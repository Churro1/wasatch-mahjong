-- 005_add_admin_users_and_event_policies.sql
-- Add admin role management and event write policies for admin dashboard.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = check_user_id
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated, service_role;

drop policy if exists "Admins can view admin users" on public.admin_users;
create policy "Admins can view admin users" on public.admin_users
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert admin users" on public.admin_users;
create policy "Admins can insert admin users" on public.admin_users
  for insert with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete admin users" on public.admin_users;
create policy "Admins can delete admin users" on public.admin_users
  for delete using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert events" on public.events;
create policy "Admins can insert events" on public.events
  for insert with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update events" on public.events;
create policy "Admins can update events" on public.events
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events" on public.events
  for delete using (public.is_admin(auth.uid()));
