-- 001_create_events_and_signups.sql
-- Migration: Create events and signups tables for Wasatch Mahjong

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  event_date timestamptz not null,
  price numeric(10,2) not null,
  spots_available integer not null,
  created_at timestamptz default now()
);

create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  payment_status text not null default 'pending',
  created_at timestamptz default now(),
  unique(user_id, event_id)
);

-- Indexes for performance
create index if not exists idx_signups_event_id on public.signups(event_id);
create index if not exists idx_signups_user_id on public.signups(user_id);
