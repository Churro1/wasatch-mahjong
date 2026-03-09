-- 007_add_custom_event_type.sql
-- Allow custom events while preserving enforced defaults for class/open play.

alter table public.events drop constraint if exists events_event_type_check;

alter table public.events drop constraint if exists events_capacity_check;
alter table public.events drop constraint if exists events_price_check;

-- Normalize nullable legacy rows to custom so event type is explicit.
update public.events
set event_type = 'custom'
where event_type is null;

alter table public.events alter column event_type set default 'open_play';
alter table public.events alter column event_type set not null;

alter table public.events add constraint events_event_type_check
  check (event_type in ('open_play', 'class', 'custom'));

alter table public.events add constraint events_capacity_check
  check (
    (event_type = 'open_play' and capacity = 32)
    or (event_type = 'class' and capacity = 16)
    or (event_type = 'custom' and capacity > 0)
  );

alter table public.events add constraint events_price_check
  check (
    (event_type = 'open_play' and price = 30)
    or (event_type = 'class' and price = 50)
    or (event_type = 'custom' and price >= 0)
  );
