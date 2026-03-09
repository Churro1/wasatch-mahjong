-- 002_enforce_event_defaults.sql
-- Establish event_type and baseline validation while allowing admins to edit cost/seats.

-- Add event_type column
alter table public.events add column if not exists event_type text;

-- Remove legacy rigid constraints if they exist.
alter table public.events drop constraint if exists events_capacity_check;
alter table public.events drop constraint if exists events_price_check;
alter table public.events drop constraint if exists events_event_type_check;

-- Add permissive validations.
alter table public.events add constraint events_event_type_check
  check (event_type in ('open_play', 'class', 'custom'));

alter table public.events add constraint events_capacity_check
  check (spots_available > 0);

alter table public.events add constraint events_price_check
  check (price >= 0);

-- Set defaults for new events.
alter table public.events alter column event_type set default 'open_play';
