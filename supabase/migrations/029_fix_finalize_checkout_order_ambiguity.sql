-- 029_fix_finalize_checkout_order_ambiguity.sql
-- This migration removes the conflicting overload of the finalize_checkout_order function
-- that was causing ambiguity with named parameter RPC calls.

drop function if exists public.finalize_checkout_order(
  p_checkout_session_id text,
  p_coupon_code text,
  p_coupon_discount_amount integer,
  p_order_id uuid,
  p_payment_intent_id text,
  p_payment_status text
);
