-- 010_checkout_orders_and_attendees.sql
-- Add buyer orders, attendee line items, and finalized signup metadata
-- for hosted Stripe Checkout, confirmation emails, and admin rosters.

create table if not exists public.checkout_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete restrict,
  status text not null default 'draft' check (
    status in (
      'draft',
      'pending_payment',
      'paid',
      'cancel_requested',
      'cancelled',
      'refunded',
      'payment_failed',
      'expired'
    )
  ),
  subtotal_amount integer not null default 0 check (subtotal_amount >= 0),
  total_amount integer not null default 0 check (total_amount >= 0),
  refund_amount integer check (refund_amount is null or refund_amount >= 0),
  currency text not null default 'usd',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_payment_status text,
  cancellation_fee_amount integer not null default 1000 check (cancellation_fee_amount >= 0),
  cancellation_requested_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  confirmed_at timestamptz,
  confirmation_email_sent_at timestamptz,
  cancellation_reason text,
  refund_reason text,
  cancelled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_checkout_orders_buyer_user_id
  on public.checkout_orders (buyer_user_id, created_at desc);

create index if not exists idx_checkout_orders_event_id
  on public.checkout_orders (event_id, created_at desc);

create index if not exists idx_checkout_orders_status
  on public.checkout_orders (status);

alter table public.checkout_orders enable row level security;

drop policy if exists "Users can view own checkout orders" on public.checkout_orders;
create policy "Users can view own checkout orders" on public.checkout_orders
  for select using (
    auth.uid() = buyer_user_id
    or public.is_admin(auth.uid())
  );

drop policy if exists "Users can insert own checkout orders" on public.checkout_orders;
create policy "Users can insert own checkout orders" on public.checkout_orders
  for insert with check (
    auth.uid() = buyer_user_id
    or public.is_admin(auth.uid())
  );

drop policy if exists "Users can update own checkout orders" on public.checkout_orders;
create policy "Users can update own checkout orders" on public.checkout_orders
  for update using (
    auth.uid() = buyer_user_id
    or public.is_admin(auth.uid())
  ) with check (
    auth.uid() = buyer_user_id
    or public.is_admin(auth.uid())
  );

drop policy if exists "Users can delete own checkout orders" on public.checkout_orders;
create policy "Users can delete own checkout orders" on public.checkout_orders
  for delete using (
    auth.uid() = buyer_user_id
    or public.is_admin(auth.uid())
  );

create table if not exists public.checkout_order_attendees (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.checkout_orders(id) on delete cascade,
  full_name text not null,
  email text,
  is_buyer boolean not null default false,
  created_at timestamptz not null default now(),
  check (length(trim(full_name)) > 0)
);

create unique index if not exists idx_checkout_order_attendees_single_buyer
  on public.checkout_order_attendees (order_id)
  where is_buyer;

create index if not exists idx_checkout_order_attendees_order_id
  on public.checkout_order_attendees (order_id, created_at asc);

alter table public.checkout_order_attendees enable row level security;

drop policy if exists "Users can view own checkout attendees" on public.checkout_order_attendees;
create policy "Users can view own checkout attendees" on public.checkout_order_attendees
  for select using (
    exists (
      select 1
      from public.checkout_orders orders
      where orders.id = checkout_order_attendees.order_id
        and (orders.buyer_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop policy if exists "Users can insert own checkout attendees" on public.checkout_order_attendees;
create policy "Users can insert own checkout attendees" on public.checkout_order_attendees
  for insert with check (
    exists (
      select 1
      from public.checkout_orders orders
      where orders.id = checkout_order_attendees.order_id
        and (orders.buyer_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop policy if exists "Users can update own checkout attendees" on public.checkout_order_attendees;
create policy "Users can update own checkout attendees" on public.checkout_order_attendees
  for update using (
    exists (
      select 1
      from public.checkout_orders orders
      where orders.id = checkout_order_attendees.order_id
        and (orders.buyer_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  ) with check (
    exists (
      select 1
      from public.checkout_orders orders
      where orders.id = checkout_order_attendees.order_id
        and (orders.buyer_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop policy if exists "Users can delete own checkout attendees" on public.checkout_order_attendees;
create policy "Users can delete own checkout attendees" on public.checkout_order_attendees
  for delete using (
    exists (
      select 1
      from public.checkout_orders orders
      where orders.id = checkout_order_attendees.order_id
        and (orders.buyer_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop trigger if exists trg_checkout_orders_set_updated_at on public.checkout_orders;
create trigger trg_checkout_orders_set_updated_at
before update on public.checkout_orders
for each row
execute function public.set_row_updated_at();

alter table public.signups
  drop constraint if exists signups_user_id_event_id_key;

alter table public.signups
  add column if not exists order_id uuid references public.checkout_orders(id) on delete set null;

alter table public.signups
  add column if not exists attendee_name text;

alter table public.signups
  add column if not exists attendee_email text;

alter table public.signups
  add column if not exists is_buyer boolean not null default false;

alter table public.signups
  add column if not exists signup_status text not null default 'active' check (
    signup_status in ('active', 'cancel_requested', 'cancelled', 'refunded')
  );

alter table public.signups
  add column if not exists cancellation_requested_at timestamptz;

alter table public.signups
  add column if not exists cancelled_at timestamptz;

alter table public.signups
  add column if not exists refunded_at timestamptz;

alter table public.signups
  add column if not exists refund_amount integer check (refund_amount is null or refund_amount >= 0);

update public.signups
set attendee_name = 'Registered Player'
where attendee_name is null;

update public.signups
set is_buyer = true
where user_id is not null
  and is_buyer = false;

alter table public.signups
  alter column attendee_name set not null;

create index if not exists idx_signups_order_id on public.signups(order_id);
create index if not exists idx_signups_signup_status on public.signups(signup_status);
