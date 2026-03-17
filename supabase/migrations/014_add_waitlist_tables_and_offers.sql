-- 014_add_waitlist_tables_and_offers.sql
-- Waitlist queue and 24-hour exclusive offer windows.

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'queued' check (status in ('queued', 'offered', 'claimed', 'removed')),
  offered_count integer not null default 0,
  last_offered_at timestamptz,
  claimed_at timestamptz,
  removed_at timestamptz,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_waitlist_entries_event_status_joined
  on public.waitlist_entries (event_id, status, joined_at asc);

create unique index if not exists idx_waitlist_entries_active_unique_email
  on public.waitlist_entries (event_id, lower(email))
  where status in ('queued', 'offered');

create table if not exists public.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  entry_id uuid not null references public.waitlist_entries(id) on delete cascade,
  offer_token text not null unique,
  status text not null default 'active' check (status in ('active', 'claimed', 'expired', 'cancelled')),
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  claimed_order_id uuid references public.checkout_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_waitlist_offers_event_status_expires
  on public.waitlist_offers (event_id, status, expires_at asc);

create index if not exists idx_waitlist_offers_entry_id
  on public.waitlist_offers (entry_id, sent_at desc);

alter table public.waitlist_entries enable row level security;
alter table public.waitlist_offers enable row level security;

drop policy if exists "Admins can view waitlist entries" on public.waitlist_entries;
create policy "Admins can view waitlist entries" on public.waitlist_entries
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update waitlist entries" on public.waitlist_entries;
create policy "Admins can update waitlist entries" on public.waitlist_entries
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can view waitlist offers" on public.waitlist_offers;
create policy "Admins can view waitlist offers" on public.waitlist_offers
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update waitlist offers" on public.waitlist_offers;
create policy "Admins can update waitlist offers" on public.waitlist_offers
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop trigger if exists trg_waitlist_entries_set_updated_at on public.waitlist_entries;
create trigger trg_waitlist_entries_set_updated_at
before update on public.waitlist_entries
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_waitlist_offers_set_updated_at on public.waitlist_offers;
create trigger trg_waitlist_offers_set_updated_at
before update on public.waitlist_offers
for each row
execute function public.set_row_updated_at();
