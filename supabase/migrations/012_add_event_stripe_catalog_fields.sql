-- 012_add_event_stripe_catalog_fields.sql
-- Persist Stripe catalog identifiers for event-based Checkout sessions.

alter table public.events
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_price_unit_amount integer,
  add column if not exists stripe_price_currency text;

create index if not exists idx_events_stripe_product_id
  on public.events (stripe_product_id);

create index if not exists idx_events_stripe_price_id
  on public.events (stripe_price_id);