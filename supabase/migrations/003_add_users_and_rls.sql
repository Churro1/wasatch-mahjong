-- 003_add_users_and_rls.sql
-- Create a users table for profile info and stats

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text not null,
  num_classes integer not null default 0,
  num_open_play integer not null default 0,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS) on all main tables
alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public.signups enable row level security;

-- RLS policies for users table: users can only see/update their own row
create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

-- RLS for signups: users can only see/add their own signups
create policy "Users can view own signups" on public.signups
  for select using (auth.uid() = user_id);
create policy "Users can insert own signups" on public.signups
  for insert with check (auth.uid() = user_id);
create policy "Users can delete own signups" on public.signups
  for delete using (auth.uid() = user_id);

-- RLS for events: all users can view, only admin can insert/update/delete
create policy "Anyone can view events" on public.events
  for select using (true);
-- (Admin policies for insert/update/delete should be added in the app logic)
