-- 002_enforce_event_defaults.sql
-- Enforce event defaults for Open Play and Classes

-- Add event_type column
alter table public.events add column if not exists event_type text check (event_type in ('open_play', 'class'));

-- Add check constraints for capacity and price based on event_type
alter table public.events drop constraint if exists events_capacity_check;
alter table public.events drop constraint if exists events_price_check;

alter table public.events add constraint events_capacity_check
  check (
    (event_type = 'open_play' and spots_available = 32)
    or (event_type = 'class' and spots_available = 16)
  );

alter table public.events add constraint events_price_check
  check (
    (event_type = 'open_play' and price = 30)
    or (event_type = 'class' and price = 50)
  );

-- Optionally, set defaults for new events
alter table public.events alter column event_type set default 'open_play';
