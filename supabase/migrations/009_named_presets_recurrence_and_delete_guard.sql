-- 009_named_presets_recurrence_and_delete_guard.sql
-- Add unlimited named presets, recurring event generation support,
-- and guardrails that block deleting events with signups.

create table if not exists public.event_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null check (event_type in ('open_play', 'class', 'custom')),
  default_title text not null,
  default_description text,
  default_price numeric(10,2) not null check (default_price >= 0),
  default_capacity integer not null check (default_capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create unique index if not exists idx_event_presets_name_unique
  on public.event_presets (lower(name));

create index if not exists idx_event_presets_active
  on public.event_presets (is_active);

alter table public.event_presets enable row level security;

drop policy if exists "Admins can view event presets" on public.event_presets;
create policy "Admins can view event presets" on public.event_presets
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert event presets" on public.event_presets;
create policy "Admins can insert event presets" on public.event_presets
  for insert with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update event presets" on public.event_presets;
create policy "Admins can update event presets" on public.event_presets
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete event presets" on public.event_presets;
create policy "Admins can delete event presets" on public.event_presets
  for delete using (public.is_admin(auth.uid()));

create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  series_name text,
  name text not null,
  description text,
  event_type text not null check (event_type in ('open_play', 'class', 'custom')),
  price numeric(10,2) not null check (price >= 0),
  capacity integer not null check (capacity > 0),
  start_at timestamptz not null,
  recurrence_unit text not null check (recurrence_unit in ('day', 'week', 'month')),
  interval_count integer not null default 1 check (interval_count > 0),
  weekdays smallint[] null,
  end_at timestamptz,
  occurrence_count integer check (occurrence_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check (end_at is not null or occurrence_count is not null),
  check (
    weekdays is null
    or (
      array_length(weekdays, 1) > 0
      and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
    )
  ),
  check (
    recurrence_unit <> 'week'
    or weekdays is not null
  )
);

create index if not exists idx_event_series_created_at
  on public.event_series (created_at desc);

alter table public.event_series enable row level security;

drop policy if exists "Admins can view event series" on public.event_series;
create policy "Admins can view event series" on public.event_series
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert event series" on public.event_series;
create policy "Admins can insert event series" on public.event_series
  for insert with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update event series" on public.event_series;
create policy "Admins can update event series" on public.event_series
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete event series" on public.event_series;
create policy "Admins can delete event series" on public.event_series
  for delete using (public.is_admin(auth.uid()));

alter table public.events
  add column if not exists series_id uuid references public.event_series(id) on delete set null;

alter table public.events
  add column if not exists series_position integer;

create index if not exists idx_events_event_date on public.events(event_date);
create index if not exists idx_events_event_type on public.events(event_type);
create index if not exists idx_events_series_id on public.events(series_id);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_event_presets_set_updated_at on public.event_presets;
create trigger trg_event_presets_set_updated_at
before update on public.event_presets
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_event_series_set_updated_at on public.event_series;
create trigger trg_event_series_set_updated_at
before update on public.event_series
for each row
execute function public.set_row_updated_at();

create or replace function public.prevent_event_delete_with_signups()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.signups s
    where s.event_id = old.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Cannot delete event: this event has one or more signups.';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_event_delete_with_signups on public.events;
create trigger trg_prevent_event_delete_with_signups
before delete on public.events
for each row
execute function public.prevent_event_delete_with_signups();

create or replace function public.create_event_series_and_generate_events(
  p_series_name text,
  p_name text,
  p_description text,
  p_event_type text,
  p_price numeric,
  p_capacity integer,
  p_start_at timestamptz,
  p_recurrence_unit text,
  p_interval_count integer,
  p_weekdays smallint[],
  p_end_at timestamptz,
  p_occurrence_count integer
)
returns table (
  event_id uuid,
  event_date timestamptz,
  series_id uuid,
  series_position integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series_id uuid;
  v_time_offset interval;
  v_base_day timestamptz;
  v_start_day date;
  v_scan_day date;
  v_day_offset integer;
  v_week_index integer;
  v_candidate_at timestamptz;
  v_inserted integer := 0;
  v_loop_guard integer := 0;
  v_row_id uuid;
  v_row_position integer;
  v_effective_weekdays smallint[];
begin
  if not public.is_admin(auth.uid()) then
    raise exception using errcode = 'P0001', message = 'Only admins can generate recurring events.';
  end if;

  if p_event_type not in ('open_play', 'class', 'custom') then
    raise exception using errcode = 'P0001', message = 'Invalid event type.';
  end if;

  if p_recurrence_unit not in ('day', 'week', 'month') then
    raise exception using errcode = 'P0001', message = 'Invalid recurrence unit.';
  end if;

  if p_interval_count is null or p_interval_count <= 0 then
    raise exception using errcode = 'P0001', message = 'Interval count must be greater than 0.';
  end if;

  if p_end_at is null and (p_occurrence_count is null or p_occurrence_count <= 0) then
    raise exception using errcode = 'P0001', message = 'Provide an end date or occurrence count.';
  end if;

  if p_occurrence_count is not null and p_occurrence_count > 500 then
    raise exception using errcode = 'P0001', message = 'Occurrence count cannot exceed 500.';
  end if;

  if p_recurrence_unit = 'week' then
    v_effective_weekdays := coalesce(
      p_weekdays,
      array[extract(dow from p_start_at)::smallint]
    );
  else
    v_effective_weekdays := null;
  end if;

  insert into public.event_series (
    series_name,
    name,
    description,
    event_type,
    price,
    capacity,
    start_at,
    recurrence_unit,
    interval_count,
    weekdays,
    end_at,
    occurrence_count,
    created_by,
    updated_by
  )
  values (
    nullif(trim(coalesce(p_series_name, '')), ''),
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    p_event_type,
    p_price,
    p_capacity,
    p_start_at,
    p_recurrence_unit,
    p_interval_count,
    v_effective_weekdays,
    p_end_at,
    p_occurrence_count,
    auth.uid(),
    auth.uid()
  )
  returning id into v_series_id;

  v_base_day := date_trunc('day', p_start_at);
  v_time_offset := p_start_at - v_base_day;
  v_start_day := v_base_day::date;

  if p_recurrence_unit in ('day', 'month') then
    loop
      v_loop_guard := v_loop_guard + 1;
      if v_loop_guard > 5000 then
        raise exception using errcode = 'P0001', message = 'Recurring generation exceeded safety limit.';
      end if;

      if p_recurrence_unit = 'day' then
        v_candidate_at := p_start_at + make_interval(days => (v_inserted * p_interval_count));
      else
        v_candidate_at := p_start_at + make_interval(months => (v_inserted * p_interval_count));
      end if;

      if p_end_at is not null and v_candidate_at > p_end_at then
        exit;
      end if;

      v_row_position := v_inserted + 1;

      insert into public.events (
        name,
        description,
        event_date,
        event_type,
        price,
        capacity,
        spots_remaining,
        spots_available,
        series_id,
        series_position
      )
      values (
        trim(p_name),
        nullif(trim(coalesce(p_description, '')), ''),
        v_candidate_at,
        p_event_type,
        p_price,
        p_capacity,
        p_capacity,
        p_capacity,
        v_series_id,
        v_row_position
      )
      returning id into v_row_id;

      v_inserted := v_inserted + 1;

      event_id := v_row_id;
      event_date := v_candidate_at;
      series_id := v_series_id;
      series_position := v_row_position;
      return next;

      if p_occurrence_count is not null and v_inserted >= p_occurrence_count then
        exit;
      end if;
    end loop;
  else
    v_scan_day := v_start_day;

    loop
      v_loop_guard := v_loop_guard + 1;
      if v_loop_guard > 5000 then
        raise exception using errcode = 'P0001', message = 'Recurring generation exceeded safety limit.';
      end if;

      v_day_offset := (v_scan_day - v_start_day);

      if p_end_at is not null and (v_base_day + make_interval(days => v_day_offset) + v_time_offset) > p_end_at then
        exit;
      end if;

      v_week_index := (v_day_offset / 7);

      if (v_week_index % p_interval_count) = 0
        and extract(dow from v_scan_day)::smallint = any(v_effective_weekdays)
      then
        v_candidate_at := v_base_day + make_interval(days => v_day_offset) + v_time_offset;

        if v_candidate_at >= p_start_at then
          v_row_position := v_inserted + 1;

          insert into public.events (
            name,
            description,
            event_date,
            event_type,
            price,
            capacity,
            spots_remaining,
            spots_available,
            series_id,
            series_position
          )
          values (
            trim(p_name),
            nullif(trim(coalesce(p_description, '')), ''),
            v_candidate_at,
            p_event_type,
            p_price,
            p_capacity,
            p_capacity,
            p_capacity,
            v_series_id,
            v_row_position
          )
          returning id into v_row_id;

          v_inserted := v_inserted + 1;

          event_id := v_row_id;
          event_date := v_candidate_at;
          series_id := v_series_id;
          series_position := v_row_position;
          return next;

          if p_occurrence_count is not null and v_inserted >= p_occurrence_count then
            exit;
          end if;
        end if;
      end if;

      v_scan_day := v_scan_day + 1;
    end loop;
  end if;

  return;
end;
$$;

grant execute on function public.create_event_series_and_generate_events(
  text,
  text,
  text,
  text,
  numeric,
  integer,
  timestamptz,
  text,
  integer,
  smallint[],
  timestamptz,
  integer
) to authenticated, service_role;
