-- 026_add_passes.sql
-- Add reusable pass entitlements for open play bookings.

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  pass_slug text not null,
  pass_name text not null,
  total_uses integer not null check (total_uses > 0),
  remaining_uses integer not null check (remaining_uses >= 0),
  currency text not null default 'usd',
  status text not null default 'active' check (status in ('active', 'redeemed', 'void', 'expired')),
  issued_by_user_id uuid references auth.users(id) on delete set null,
  purchaser_email text,
  purchaser_name text,
  recipient_name text,
  recipient_email text,
  notes text,
  expires_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  purchase_source text not null default 'purchase' check (purchase_source in ('purchase', 'admin')),
  open_play_only boolean not null default true,
  self_only boolean not null default true,
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (remaining_uses <= total_uses)
);

create index if not exists idx_passes_slug on public.passes(pass_slug);
create index if not exists idx_passes_code on public.passes(code);
create index if not exists idx_passes_status on public.passes(status);
create index if not exists idx_passes_created_at on public.passes(created_at desc);

create table if not exists public.pass_redemptions (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.passes(id) on delete restrict,
  order_id uuid not null references public.checkout_orders(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  used_uses integer not null default 1 check (used_uses > 0),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists idx_pass_redemptions_pass_id on public.pass_redemptions(pass_id);
create index if not exists idx_pass_redemptions_order_id on public.pass_redemptions(order_id);
create index if not exists idx_pass_redemptions_event_id on public.pass_redemptions(event_id);

alter table public.passes enable row level security;
alter table public.pass_redemptions enable row level security;

drop policy if exists "Users can view own passes" on public.passes;
create policy "Users can view own passes" on public.passes
  for select using (auth.uid() = issued_by_user_id or public.is_admin(auth.uid()));

drop policy if exists "Admins can manage passes" on public.passes;
create policy "Admins can manage passes" on public.passes
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can view pass redemptions" on public.pass_redemptions;
create policy "Admins can view pass redemptions" on public.pass_redemptions
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage pass redemptions" on public.pass_redemptions;
create policy "Admins can manage pass redemptions" on public.pass_redemptions
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop trigger if exists trg_passes_set_updated_at on public.passes;
create trigger trg_passes_set_updated_at
before update on public.passes
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_pass_redemptions_set_updated_at on public.pass_redemptions;
create trigger trg_pass_redemptions_set_updated_at
before update on public.pass_redemptions
for each row
execute function public.set_row_updated_at();