-- 034_recreate_coupon_uses_constraint.sql
-- Recreates the unique index on coupon_uses that was dropped by a faulty remote schema dump.

create unique index if not exists idx_coupon_uses_coupon_id_order_id on public.coupon_uses(coupon_id, order_id);
