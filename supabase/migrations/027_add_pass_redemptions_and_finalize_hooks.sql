-- 027_add_pass_redemptions_and_finalize_hooks.sql
-- Add reservation/commit helpers for pass redemptions and wire them into checkout finalization.

alter table public.pass_redemptions
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists committed_at timestamptz;

create index if not exists idx_pass_redemptions_committed_at on public.pass_redemptions(committed_at);
create index if not exists idx_pass_redemptions_reservation_expires_at on public.pass_redemptions(reservation_expires_at);

create or replace function public.apply_pass_to_order(
  p_order_id uuid,
  p_pass_code text,
  p_requested_amount integer
)
returns table (
  pass_id uuid,
  pass_code text,
  applied_uses integer,
  remaining_uses integer,
  order_total_amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.checkout_orders%rowtype;
  v_event public.events%rowtype;
  v_pass public.passes%rowtype;
  v_existing_redemption public.pass_redemptions%rowtype;
  v_other_reserved integer := 0;
  v_normalized_code text := upper(regexp_replace(coalesce(p_pass_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_apply_uses integer := 1;
  v_reservation_expires_at timestamptz := now() + interval '2 hours';
begin
  if p_requested_amount is null or p_requested_amount < 0 then
    raise exception using errcode = 'P0001', message = 'Checkout amount must be valid.';
  end if;

  if v_normalized_code = '' then
    raise exception using errcode = 'P0001', message = 'Pass code is required.';
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
  into v_event
  from public.events
  where id = v_order.event_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Event not found for checkout order.';
  end if;

  if v_event.event_type is distinct from 'open_play' then
    raise exception using errcode = 'P0001', message = 'Passes can only be used for open play events.';
  end if;

  select *
  into v_existing_redemption
  from public.pass_redemptions
  where order_id = p_order_id
  limit 1
  for update;

  select *
  into v_pass
  from public.passes
  where code = v_normalized_code
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Pass code not found.';
  end if;

  if v_pass.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'This pass is no longer active.';
  end if;

  if v_pass.open_play_only is true and v_event.event_type is distinct from 'open_play' then
    raise exception using errcode = 'P0001', message = 'This pass can only be used for open play.';
  end if;

  if v_pass.expires_at is not null and v_pass.expires_at < now() then
    update public.passes
    set status = 'expired',
        updated_at = now()
    where id = v_pass.id;

    raise exception using errcode = 'P0001', message = 'This pass has expired.';
  end if;

  select coalesce(sum(r.used_uses), 0)::integer
  into v_other_reserved
  from public.pass_redemptions r
          v_attendee_count integer := 0;
  where r.pass_id = v_pass.id
    and r.reversed_at is null
    and r.committed_at is null
    and (r.reservation_expires_at is null or r.reservation_expires_at > now())
    and (v_existing_redemption.id is null or r.id <> v_existing_redemption.id);

  if v_pass.remaining_uses - v_other_reserved <= 0 then
    raise exception using errcode = 'P0001', message = 'This pass has no remaining uses.';
  end if;

  if attendees_count(v_order.id) <> 1 then
    raise exception using errcode = 'P0001', message = 'Passes can only be used for one attendee.';
  end if;

  v_apply_uses := least(1, greatest(v_pass.remaining_uses - v_other_reserved, 0));

  if v_apply_uses <= 0 then
    raise exception using errcode = 'P0001', message = 'This pass has no remaining uses.';
  end if;

  if found and v_existing_redemption.id is not null and v_existing_redemption.committed_at is null then
    update public.pass_redemptions
    set pass_id = v_pass.id,
        used_uses = v_apply_uses,
        reversed_at = null,
        committed_at = null,
        reservation_expires_at = v_reservation_expires_at,
        updated_at = now()
    where id = v_existing_redemption.id;
  else
    insert into public.pass_redemptions (
      pass_id,
      order_id,
      event_id,
      used_uses,
      reservation_expires_at
    ) values (
      v_pass.id,
      p_order_id,
      v_order.event_id,
      v_apply_uses,
      v_reservation_expires_at
    );
  end if;

  update public.checkout_orders
  set total_amount = 0,
      updated_at = now()
  where id = p_order_id;

  return query
  select
    v_pass.id,
    v_pass.code,
    v_apply_uses,
    v_pass.remaining_uses,
    0;
end;
$$;

grant execute on function public.apply_pass_to_order(uuid, text, integer)
  to authenticated, service_role;

create or replace function public.commit_pass_redemptions(
  p_order_id uuid
)
returns table (
  pass_id uuid,
  committed_uses integer,
  remaining_uses integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption record;
  v_remaining_uses integer;
begin
  for v_redemption in
    select r.id, r.pass_id, r.used_uses
    from public.pass_redemptions r
    where r.order_id = p_order_id
      and r.reversed_at is null
          select count(*)::integer
          into v_attendee_count
          from public.checkout_order_attendees as attendees
          where attendees.order_id = v_order.id;

          if v_attendee_count <> 1 then
            raise exception using errcode = 'P0001', message = 'Passes can only be used for one attendee.';
          end if;

          if not exists (
            select 1
            from public.checkout_order_attendees as attendees
            where attendees.order_id = v_order.id
              and attendees.is_buyer = true
          ) then
            raise exception using errcode = 'P0001', message = 'The buyer must be included when using a pass.';
          end if;
      and r.committed_at is null
    for update
  loop
    update public.passes
    set remaining_uses = remaining_uses - v_redemption.used_uses,
        status = case when remaining_uses - v_redemption.used_uses <= 0 then 'redeemed' else 'active' end,
        redeemed_at = case when remaining_uses - v_redemption.used_uses <= 0 then now() else redeemed_at end,
        updated_at = now()
    where id = v_redemption.pass_id
    returning remaining_uses into v_remaining_uses;

    if v_remaining_uses is null or v_remaining_uses < 0 then
      raise exception using errcode = 'P0001', message = 'Pass balance could not be committed.';
    end if;

    update public.pass_redemptions
    set committed_at = now(),
        reservation_expires_at = null,
        updated_at = now()
    where id = v_redemption.id;

    return query
    select v_redemption.pass_id, v_redemption.used_uses, v_remaining_uses;
  end loop;
end;
$$;

grant execute on function public.commit_pass_redemptions(uuid)
  to authenticated, service_role;

create or replace function public.reverse_pass_redemptions(
  p_order_id uuid
)
returns table (
  pass_id uuid,
  reversed_uses integer,
  remaining_uses integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption record;
  v_remaining_uses integer;
begin
  for v_redemption in
    select r.id, r.pass_id, r.used_uses, r.committed_at
    from public.pass_redemptions r
    where r.order_id = p_order_id
      and r.reversed_at is null
    for update
  loop
    if v_redemption.committed_at is null then
      update public.pass_redemptions
      set reversed_at = now(),
          updated_at = now()
      where id = v_redemption.id;
    else
      update public.passes
      set remaining_uses = remaining_uses + v_redemption.used_uses,
          status = 'active',
          redeemed_at = case when remaining_uses + v_redemption.used_uses > 0 then null else redeemed_at end,
          updated_at = now()
      where id = v_redemption.pass_id
      returning remaining_uses into v_remaining_uses;

      update public.pass_redemptions
      set reversed_at = now(),
          updated_at = now()
      where id = v_redemption.id;
    end if;

    return query
    select v_redemption.pass_id, v_redemption.used_uses, coalesce(v_remaining_uses, 0);
  end loop;
end;
$$;

grant execute on function public.reverse_pass_redemptions(uuid)
  to authenticated, service_role;

create or replace function public.finalize_checkout_order(
  p_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_payment_status text,
  p_coupon_code text default null,
  p_coupon_discount_amount integer default null
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
  v_coupon public.coupons%rowtype;
  v_attendee_count integer;
  v_buyer_email text;
  v_coupon_code text := upper(trim(coalesce(p_coupon_code, '')));
begin
  select o.*
  into v_order
  from public.checkout_orders as o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Checkout order not found.';
  end if;

  select e.*
  into v_event
  from public.events as e
  where e.id = v_order.event_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Event not found for checkout order.';
  end if;

  select count(*)::integer
  into v_attendee_count
  from public.checkout_order_attendees as attendees
  where attendees.order_id = v_order.id;

  if v_attendee_count <= 0 then
    raise exception using errcode = 'P0001', message = 'Checkout order has no attendees.';
  end if;

  select u.email
  into v_buyer_email
  from auth.users as u
  where u.id = v_order.buyer_user_id;

  if v_coupon_code <> '' and coalesce(p_coupon_discount_amount, 0) > 0 then
    select *
    into v_coupon
    from public.coupons as c
    where c.code = v_coupon_code
    limit 1;

    if found then
      insert into public.coupon_uses (
        coupon_id,
        user_id,
        order_id,
        discount_amount_cents
      ) values (
        v_coupon.id,
        v_order.buyer_user_id,
        v_order.id,
        p_coupon_discount_amount
      ) on conflict (coupon_id, order_id) do nothing;
    end if;
  end if;

  if v_order.status = 'paid' then
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
  perform public.commit_pass_redemptions(v_order.id);

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
  from public.checkout_order_attendees as attendees
  where attendees.order_id = v_order.id
    and not exists (
      select 1
      from public.signups as signups
      where signups.order_id = v_order.id
        and signups.attendee_name = attendees.full_name
        and coalesce(signups.attendee_email, '') = coalesce(attendees.email, '')
        and signups.is_buyer = attendees.is_buyer
    );

  update public.events as e
  set spots_remaining = e.spots_remaining - v_attendee_count
  where e.id = v_event.id;

  update public.checkout_orders as o
  set status = 'paid',
      stripe_checkout_session_id = coalesce(p_checkout_session_id, o.stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(p_payment_intent_id, o.stripe_payment_intent_id),
      stripe_payment_status = p_payment_status,
      confirmed_at = now(),
      updated_at = now()
  where o.id = v_order.id;

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

grant execute on function public.finalize_checkout_order(uuid, text, text, text, text, integer)
  to authenticated, service_role;

create or replace function public.finalize_checkout_order_webhook(
  p_checkout_session_id text,
  p_coupon_code text,
  p_coupon_discount_amount integer,
  p_order_id uuid,
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
  v_coupon public.coupons%rowtype;
  v_attendee_count integer;
  v_buyer_email text;
  v_coupon_code text := upper(trim(coalesce(p_coupon_code, '')));
begin
  select o.*
  into v_order
  from public.checkout_orders as o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Checkout order not found.';
  end if;

  select e.*
  into v_event
  from public.events as e
  where e.id = v_order.event_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Event not found for checkout order.';
  end if;

  select count(*)::integer
  into v_attendee_count
  from public.checkout_order_attendees as attendees
  where attendees.order_id = v_order.id;

  if v_attendee_count <= 0 then
    raise exception using errcode = 'P0001', message = 'Checkout order has no attendees.';
  end if;

  select u.email
  into v_buyer_email
  from auth.users as u
  where u.id = v_order.buyer_user_id;

  if v_coupon_code <> '' and coalesce(p_coupon_discount_amount, 0) > 0 then
    select *
    into v_coupon
    from public.coupons as c
    where c.code = v_coupon_code
    limit 1;

    if found then
      insert into public.coupon_uses (
        coupon_id,
        user_id,
        order_id,
        discount_amount_cents
      ) values (
        v_coupon.id,
        v_order.buyer_user_id,
        v_order.id,
        p_coupon_discount_amount
      ) on conflict (coupon_id, order_id) do nothing;
    end if;
  end if;

  if v_order.status = 'paid' then
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
  perform public.commit_pass_redemptions(v_order.id);

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
  from public.checkout_order_attendees as attendees
  where attendees.order_id = v_order.id
    and not exists (
      select 1
      from public.signups as signups
      where signups.order_id = v_order.id
        and signups.attendee_name = attendees.full_name
        and coalesce(signups.attendee_email, '') = coalesce(attendees.email, '')
        and signups.is_buyer = attendees.is_buyer
    );

  update public.events as e
  set spots_remaining = e.spots_remaining - v_attendee_count
  where e.id = v_event.id;

  update public.checkout_orders as o
  set status = 'paid',
      stripe_checkout_session_id = coalesce(p_checkout_session_id, o.stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(p_payment_intent_id, o.stripe_payment_intent_id),
      stripe_payment_status = p_payment_status,
      confirmed_at = now(),
      updated_at = now()
  where o.id = v_order.id;

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

grant execute on function public.finalize_checkout_order_webhook(text, text, integer, uuid, text, text)
  to authenticated, service_role;