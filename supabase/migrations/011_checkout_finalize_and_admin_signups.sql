-- 011_checkout_finalize_and_admin_signups.sql
-- Add admin signups visibility and finalize hosted Stripe checkout orders atomically.

drop policy if exists "Admins can view signups" on public.signups;
create policy "Admins can view signups" on public.signups
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update signups" on public.signups;
create policy "Admins can update signups" on public.signups
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

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
