-- 008_event_templates_and_flexible_event_defaults.sql
-- Allow admins to customize pricing/capacity while keeping event-type presets editable.

alter table public.events drop constraint if exists events_capacity_check;
alter table public.events drop constraint if exists events_price_check;

alter table public.events add constraint events_capacity_check
  check (capacity > 0);

alter table public.events add constraint events_price_check
  check (price >= 0);

create table if not exists public.event_templates (
  template_type text primary key check (template_type in ('class', 'open_play', 'custom')),
  label text not null,
  default_title text not null,
  default_description text,
  default_price numeric(10,2) not null check (default_price >= 0),
  default_capacity integer not null check (default_capacity > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.event_templates enable row level security;

drop policy if exists "Admins can view event templates" on public.event_templates;
create policy "Admins can view event templates" on public.event_templates
  for select using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert event templates" on public.event_templates;
create policy "Admins can insert event templates" on public.event_templates
  for insert with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update event templates" on public.event_templates;
create policy "Admins can update event templates" on public.event_templates
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.event_templates (
  template_type,
  label,
  default_title,
  default_description,
  default_price,
  default_capacity
)
values
  (
    'class',
    'Class',
    'Beginner Mahjong Class',
    'Learn the basics of American Mahjong in a friendly, supportive environment.',
    50,
    16
  ),
  (
    'open_play',
    'Open Play',
    'Open Play Night',
    'A fun, casual night of American Mahjong. All skill levels welcome!',
    30,
    32
  ),
  (
    'custom',
    'Custom',
    'Special Mahjong Event',
    '',
    40,
    20
  )
on conflict (template_type) do nothing;
