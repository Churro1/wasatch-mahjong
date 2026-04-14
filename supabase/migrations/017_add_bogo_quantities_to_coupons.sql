-- 017_add_bogo_quantities_to_coupons.sql
-- Add configurable Buy X Get Y fields for bogo coupons

alter table public.coupons
  add column if not exists bogo_buy_quantity integer not null default 1 check (bogo_buy_quantity >= 1),
  add column if not exists bogo_get_quantity integer not null default 1 check (bogo_get_quantity >= 1);
