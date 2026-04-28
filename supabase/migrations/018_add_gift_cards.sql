-- 018_add_gift_cards.sql
-- Add gift cards, redemption tracking, and helpers for checkout refund reversal.

alter table public.checkout_orders
  add column if not exists gift_card_amount integer not null default 0 check (gift_card_amount >= 0);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  original_amount integer not null check (original_amount > 0),
  remaining_amount integer not null check (remaining_amount >= 0),
  currency text not null default 'usd',
  status text not null default 'active' check (status in ('active', 'redeemed', 'void', 'expired')),
  issued_by_user_id uuid references auth.users(id) on delete set null,
  purchaser_email text,
  recipient_name text,
  recipient_email text,
  message text,
  expires_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  purchase_source text not null default 'purchase' check (purchase_source in ('purchase', 'admin')),
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (remaining_amount <= original_amount)
);

create index if not exists idx_gift_cards_code on public.gift_cards(code);
create index if not exists idx_gift_cards_status on public.gift_cards(status);
create index if not exists idx_gift_cards_created_at on public.gift_cards(created_at desc);

create table if not exists public.gift_card_redemptions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete restrict,
  order_id uuid not null references public.checkout_orders(id) on delete cascade,
  amount integer not null check (amount > 0),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists idx_gift_card_redemptions_gift_card_id on public.gift_card_redemptions(gift_card_id);
create index if not exists idx_gift_card_redemptions_order_id on public.gift_card_redemptions(order_id);
create index if not exists idx_gift_card_redemptions_created_at on public.gift_card_redemptions(created_at desc);

alter table public.gift_cards enable row level security;
alter table public.gift_card_redemptions enable row level security;

drop policy if exists "Admins can view gift cards" on public.gift_cards;
create policy "Admins can view gift cards" on public.gift_cards
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can create gift cards" on public.gift_cards;
create policy "Admins can create gift cards" on public.gift_cards
  for insert with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update gift cards" on public.gift_cards;
create policy "Admins can update gift cards" on public.gift_cards
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can view gift card redemptions" on public.gift_card_redemptions;
create policy "Admins can view gift card redemptions" on public.gift_card_redemptions
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can create gift card redemptions" on public.gift_card_redemptions;
create policy "Admins can create gift card redemptions" on public.gift_card_redemptions
  for insert with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update gift card redemptions" on public.gift_card_redemptions;
create policy "Admins can update gift card redemptions" on public.gift_card_redemptions
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop trigger if exists trg_gift_cards_set_updated_at on public.gift_cards;
create trigger trg_gift_cards_set_updated_at
before update on public.gift_cards
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_gift_card_redemptions_set_updated_at on public.gift_card_redemptions;
create trigger trg_gift_card_redemptions_set_updated_at
before update on public.gift_card_redemptions
for each row
execute function public.set_row_updated_at();

create or replace function public.apply_gift_card_to_order(
  p_order_id uuid,
  p_gift_card_code text,
  p_requested_amount integer
)
returns table (
  gift_card_id uuid,
  gift_card_code text,
  applied_amount integer,
  remaining_balance integer,
  order_total_amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.checkout_orders%rowtype;
  v_gift_card public.gift_cards%rowtype;
  v_existing_redemption public.gift_card_redemptions%rowtype;
  v_normalized_code text := upper(regexp_replace(coalesce(p_gift_card_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_apply_amount integer;
begin
  if p_requested_amount is null or p_requested_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'Checkout amount must be greater than zero.';
  end if;

  if v_normalized_code = '' then
    raise exception using errcode = 'P0001', message = 'Gift card code is required.';
  end if;

  select *
  into v_order
  from public.checkout_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Checkout order not found.';
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception using errcode = 'P0001', message = 'This checkout order can no longer be updated.';
  end if;

  select r.*
  into v_existing_redemption
  from public.gift_card_redemptions r
  join public.gift_cards c on c.id = r.gift_card_id
  where r.order_id = p_order_id
  limit 1;

  if found then
    if v_existing_redemption.reversed_at is not null then
      raise exception using errcode = 'P0001', message = 'This gift card redemption has already been reversed.';
    end if;

    select *
    into v_gift_card
    from public.gift_cards
    where id = v_existing_redemption.gift_card_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'Gift card not found.';
    end if;

    update public.checkout_orders
    set gift_card_amount = v_existing_redemption.amount,
        total_amount = greatest(p_requested_amount - v_existing_redemption.amount, 0),
        updated_at = now()
    where id = p_order_id;

    return query
    select
      v_gift_card.id,
      v_gift_card.code,
      v_existing_redemption.amount,
      v_gift_card.remaining_amount,
      greatest(p_requested_amount - v_existing_redemption.amount, 0);
    return;
  end if;

  select *
  into v_gift_card
  from public.gift_cards
  where code = v_normalized_code
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Gift card code not found.';
  end if;

  if v_gift_card.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'This gift card is no longer active.';
  end if;

  if v_gift_card.expires_at is not null and v_gift_card.expires_at < now() then
    update public.gift_cards
    set status = 'expired',
        updated_at = now()
    where id = v_gift_card.id;

    raise exception using errcode = 'P0001', message = 'This gift card has expired.';
  end if;

  v_apply_amount := least(p_requested_amount, v_gift_card.remaining_amount);

  if v_apply_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'This gift card has no remaining balance.';
  end if;

  update public.gift_cards
  set remaining_amount = remaining_amount - v_apply_amount,
      status = case when remaining_amount - v_apply_amount <= 0 then 'redeemed' else 'active' end,
      redeemed_at = case when remaining_amount - v_apply_amount <= 0 then now() else redeemed_at end,
      updated_at = now()
  where id = v_gift_card.id
  returning remaining_amount into v_gift_card.remaining_amount;

  insert into public.gift_card_redemptions (
    gift_card_id,
    order_id,
    amount
  ) values (
    v_gift_card.id,
    p_order_id,
    v_apply_amount
  );

  update public.checkout_orders
  set gift_card_amount = v_apply_amount,
      total_amount = greatest(p_requested_amount - v_apply_amount, 0),
      updated_at = now()
  where id = p_order_id;

  return query
  select
    v_gift_card.id,
    v_gift_card.code,
    v_apply_amount,
    v_gift_card.remaining_amount,
    greatest(p_requested_amount - v_apply_amount, 0);
end;
$$;

grant execute on function public.apply_gift_card_to_order(uuid, text, integer)
  to authenticated, service_role;

create or replace function public.reverse_gift_card_redemptions(
  p_order_id uuid
)
returns table (
  gift_card_id uuid,
  reversed_amount integer,
  remaining_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption record;
  v_remaining_balance integer;
begin
  for v_redemption in
    select r.id, r.gift_card_id, r.amount
    from public.gift_card_redemptions r
    where r.order_id = p_order_id
      and r.reversed_at is null
    for update
  loop
    update public.gift_cards
    set remaining_amount = remaining_amount + v_redemption.amount,
        status = 'active',
        redeemed_at = null,
        updated_at = now()
    where id = v_redemption.gift_card_id
    returning remaining_amount into v_remaining_balance;

    update public.gift_card_redemptions
    set reversed_at = now(),
        updated_at = now()
    where id = v_redemption.id;

    return query
    select v_redemption.gift_card_id, v_redemption.amount, v_remaining_balance;
  end loop;
end;
$$;

grant execute on function public.reverse_gift_card_redemptions(uuid)
  to authenticated, service_role;