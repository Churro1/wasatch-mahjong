-- 019_reserve_then_commit_gift_cards.sql
-- Switch gift card application to reservation-first and commit balances only when an order finalizes.

alter table public.gift_card_redemptions
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists committed_at timestamptz;

create index if not exists idx_gift_card_redemptions_committed_at on public.gift_card_redemptions(committed_at);
create index if not exists idx_gift_card_redemptions_reservation_expires_at on public.gift_card_redemptions(reservation_expires_at);

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
  v_other_reserved integer := 0;
  v_normalized_code text := upper(regexp_replace(coalesce(p_gift_card_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_apply_amount integer;
  v_reservation_expires_at timestamptz := now() + interval '2 hours';
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

  select *
  into v_existing_redemption
  from public.gift_card_redemptions
  where order_id = p_order_id
  limit 1
  for update;

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

  select coalesce(sum(r.amount), 0)::integer
  into v_other_reserved
  from public.gift_card_redemptions r
  where r.gift_card_id = v_gift_card.id
    and r.reversed_at is null
    and r.committed_at is null
    and (r.reservation_expires_at is null or r.reservation_expires_at > now())
    and (v_existing_redemption.id is null or r.id <> v_existing_redemption.id);

  v_apply_amount := least(p_requested_amount, greatest(v_gift_card.remaining_amount - v_other_reserved, 0));

  if v_apply_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'This gift card has no remaining balance.';
  end if;

  if found and v_existing_redemption.id is not null and v_existing_redemption.committed_at is null then
    update public.gift_card_redemptions
    set gift_card_id = v_gift_card.id,
        amount = v_apply_amount,
        reversed_at = null,
        committed_at = null,
        reservation_expires_at = v_reservation_expires_at,
        updated_at = now()
    where id = v_existing_redemption.id;
  else
    insert into public.gift_card_redemptions (
      gift_card_id,
      order_id,
      amount,
      reservation_expires_at
    ) values (
      v_gift_card.id,
      p_order_id,
      v_apply_amount,
      v_reservation_expires_at
    );
  end if;

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

create or replace function public.commit_gift_card_redemptions(
  p_order_id uuid
)
returns table (
  gift_card_id uuid,
  committed_amount integer,
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
      and r.committed_at is null
    for update
  loop
    update public.gift_cards
    set remaining_amount = remaining_amount - v_redemption.amount,
        status = case when remaining_amount - v_redemption.amount <= 0 then 'redeemed' else 'active' end,
        redeemed_at = case when remaining_amount - v_redemption.amount <= 0 then now() else redeemed_at end,
        updated_at = now()
    where id = v_redemption.gift_card_id
    returning remaining_amount into v_remaining_balance;

    if v_remaining_balance is null or v_remaining_balance < 0 then
      raise exception using errcode = 'P0001', message = 'Gift card balance could not be committed.';
    end if;

    update public.gift_card_redemptions
    set committed_at = now(),
        reservation_expires_at = null,
        updated_at = now()
    where id = v_redemption.id;

    return query
    select v_redemption.gift_card_id, v_redemption.amount, v_remaining_balance;
  end loop;
end;
$$;

grant execute on function public.commit_gift_card_redemptions(uuid)
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
    select r.id, r.gift_card_id, r.amount, r.committed_at
    from public.gift_card_redemptions r
    where r.order_id = p_order_id
      and r.reversed_at is null
    for update
  loop
    if v_redemption.committed_at is not null then
      update public.gift_cards
      set remaining_amount = remaining_amount + v_redemption.amount,
          status = 'active',
          redeemed_at = null,
          updated_at = now()
      where id = v_redemption.gift_card_id
      returning remaining_amount into v_remaining_balance;
    else
      select remaining_amount
      into v_remaining_balance
      from public.gift_cards
      where id = v_redemption.gift_card_id;
    end if;

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

create or replace function public.finalize_checkout_order(
  p_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_payment_status text
)
returns table (
  order_id uuid,
  buyer_user_id uuid,
  buyer_email text,
  event_id uuid,
  event_name text,
  event_date timestamptz,
  attendee_count integer,
  total_amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.checkout_orders%rowtype;
  v_event public.events%rowtype;
  v_attendee_count integer;
  v_buyer_email text;
begin
  select *
  into v_order
  from public.checkout_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Checkout order not found.';
  end if;

  select *
  into v_event
  from public.events
  where id = v_order.event_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Event not found for checkout order.';
  end if;

  select count(*)::integer
  into v_attendee_count
  from public.checkout_order_attendees
  where order_id = v_order.id;

  if v_attendee_count <= 0 then
    raise exception using errcode = 'P0001', message = 'Checkout order has no attendees.';
  end if;

  if v_order.status = 'paid' then
    select email
    into v_buyer_email
    from auth.users
    where id = v_order.buyer_user_id;

    return query
    select
      v_order.id,
      v_order.buyer_user_id,
      v_buyer_email,
      v_event.id,
      v_event.name,
      v_event.event_date,
      v_attendee_count,
      v_order.total_amount;
    return;
  end if;

  if coalesce(v_event.spots_remaining, 0) < v_attendee_count then
    raise exception using errcode = 'P0001', message = 'Not enough spots remaining for this order.';
  end if;

  perform public.commit_gift_card_redemptions(v_order.id);

  select email
  into v_buyer_email
  from auth.users
  where id = v_order.buyer_user_id;

  insert into public.signups (
    user_id,
    event_id,
    order_id,
    payment_status,
    attendee_name,
    attendee_email,
    is_buyer,
    signup_status
  )
  select
    case when attendees.is_buyer then v_order.buyer_user_id else null end,
    v_order.event_id,
    v_order.id,
    'paid',
    attendees.full_name,
    nullif(trim(coalesce(attendees.email, '')), ''),
    attendees.is_buyer,
    'active'
  from public.checkout_order_attendees attendees
  where attendees.order_id = v_order.id
    and not exists (
      select 1
      from public.signups signups
      where signups.order_id = v_order.id
        and signups.attendee_name = attendees.full_name
        and coalesce(signups.attendee_email, '') = coalesce(attendees.email, '')
        and signups.is_buyer = attendees.is_buyer
    );

  update public.events
  set spots_remaining = spots_remaining - v_attendee_count
  where id = v_event.id;

  update public.checkout_orders
  set status = 'paid',
      stripe_checkout_session_id = coalesce(p_checkout_session_id, stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
      stripe_payment_status = p_payment_status,
      confirmed_at = now(),
      updated_at = now()
  where id = v_order.id;

  return query
  select
    v_order.id,
    v_order.buyer_user_id,
    v_buyer_email,
    v_event.id,
    v_event.name,
    v_event.event_date,
    v_attendee_count,
    v_order.total_amount;
end;
$$;

grant execute on function public.finalize_checkout_order(uuid, text, text, text)
  to authenticated, service_role;