-- 020_add_private_events.sql
-- Add support for private events that require an event code.

alter table public.events
  add column if not exists is_private boolean not null default false,
  add column if not exists event_code text;

update public.events
set event_code = upper(substring(md5(gen_random_uuid()::text), 1, 8))
where is_private = true
  and (event_code is null or event_code !~ '^[A-Z0-9]{8}$');

alter table public.events drop constraint if exists events_event_code_format_check;
alter table public.events add constraint events_event_code_format_check
  check (event_code is null or event_code ~ '^[A-Z0-9]{8}$');

alter table public.events drop constraint if exists events_private_requires_code_check;
alter table public.events add constraint events_private_requires_code_check
  check (is_private = false or event_code is not null);

create index if not exists idx_events_private_code on public.events(event_code)
where is_private = true;
