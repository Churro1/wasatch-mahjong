-- 016_add_coupons_and_coupon_uses.sql
-- Add coupons and coupon usage tracking for admin discount management

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('dollar', 'percentage', 'bogo')),
  discount_value numeric not null check (discount_value > 0),
  expiry_date timestamptz,
  max_uses_per_user integer not null default 1 check (max_uses_per_user >= 1),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_coupons_code on public.coupons(code);
create index if not exists idx_coupons_is_active on public.coupons(is_active);
create index if not exists idx_coupons_created_at on public.coupons(created_at desc);

create table if not exists public.coupon_uses (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  order_id uuid references public.checkout_orders(id) on delete set null,
  discount_amount_cents integer not null check (discount_amount_cents >= 0),
  used_at timestamptz not null default now()
);

create index if not exists idx_coupon_uses_coupon_id on public.coupon_uses(coupon_id);
create index if not exists idx_coupon_uses_user_id on public.coupon_uses(user_id);
create index if not exists idx_coupon_uses_used_at on public.coupon_uses(used_at desc);

alter table public.coupons enable row level security;
alter table public.coupon_uses enable row level security;

create policy "Admins can view coupons" on public.coupons
  for select using (public.is_admin(auth.uid()));

create policy "Admins can create coupons" on public.coupons
  for insert with check (public.is_admin(auth.uid()));

create policy "Admins can update coupons" on public.coupons
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "Admins can view coupon uses" on public.coupon_uses
  for select using (public.is_admin(auth.uid()));

create policy "Admins can insert coupon uses" on public.coupon_uses
  for insert with check (public.is_admin(auth.uid()));
