-- 022_enable_rls_webhook_events.sql
-- Enable Row Level Security on webhook_events and add restrictive policies
-- Service role connections (service_role key) bypass RLS so the server will continue to work.

alter table if exists public.webhook_events enable row level security;

-- Prevent any non-service_role access via PostgREST/JWT by denying all operations.
drop policy if exists "webhook_events_no_select" on public.webhook_events;
create policy "webhook_events_no_select" on public.webhook_events
for select using (false);

drop policy if exists "webhook_events_no_insert" on public.webhook_events;
create policy "webhook_events_no_insert" on public.webhook_events
for insert with check (false);

drop policy if exists "webhook_events_no_update" on public.webhook_events;
create policy "webhook_events_no_update" on public.webhook_events
for update using (false) with check (false);

drop policy if exists "webhook_events_no_delete" on public.webhook_events;
create policy "webhook_events_no_delete" on public.webhook_events
for delete using (false);
