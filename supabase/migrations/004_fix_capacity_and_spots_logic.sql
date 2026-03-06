-- 004_fix_capacity_and_spots_logic.sql
-- Separate fixed event capacity from mutable remaining seats.

alter table public.events add column if not exists capacity integer;
alter table public.events add column if not exists spots_remaining integer;

-- Backfill capacity and spots_remaining safely from existing data.
update public.events
set capacity = coalesce(capacity, spots_available);

update public.events
set capacity = case
  when event_type = 'open_play' then 32
  when event_type = 'class' then 16
  else capacity
end
where capacity is null or capacity <= 0;

update public.events
set spots_remaining = coalesce(spots_remaining, spots_available, capacity);

alter table public.events alter column capacity set not null;
alter table public.events alter column spots_remaining set not null;
alter table public.events alter column spots_remaining set default 0;

alter table public.events drop constraint if exists events_capacity_check;
alter table public.events drop constraint if exists events_price_check;
alter table public.events drop constraint if exists events_spots_remaining_check;

alter table public.events add constraint events_capacity_check
  check (
    (event_type = 'open_play' and capacity = 32)
    or (event_type = 'class' and capacity = 16)
  );

alter table public.events add constraint events_price_check
  check (
    (event_type = 'open_play' and price = 30)
    or (event_type = 'class' and price = 50)
  );

alter table public.events add constraint events_spots_remaining_check
  check (spots_remaining >= 0 and spots_remaining <= capacity);

create or replace function public.set_default_spots_remaining()
returns trigger as $$
begin
  if new.spots_remaining is null then
    new.spots_remaining := new.capacity;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_default_spots_remaining on public.events;

create trigger trg_set_default_spots_remaining
before insert on public.events
for each row
execute function public.set_default_spots_remaining();
