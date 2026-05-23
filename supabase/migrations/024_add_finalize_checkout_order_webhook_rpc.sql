-- 024_add_finalize_checkout_order_webhook_rpc.sql
-- Dedicated webhook RPC to avoid PostgREST overload resolution issues.

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
begin
  return query
  select *
  from public.finalize_checkout_order(
    p_order_id,
    p_checkout_session_id,
    p_payment_intent_id,
    p_payment_status,
    p_coupon_code,
    p_coupon_discount_amount
  );
end;
$$;

grant execute on function public.finalize_checkout_order_webhook(text, text, integer, uuid, text, text)
  to authenticated, service_role;