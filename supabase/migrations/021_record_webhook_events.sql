-- 021_record_webhook_events.sql
-- Add a table to record Stripe webhook events and processing status to support idempotent processing.

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb,
  status text not null default 'processing', -- processing | succeeded | failed
  error_text text null,
  inserted_at timestamptz not null default now(),
  processed_at timestamptz null
);

create index if not exists idx_webhook_events_status on public.webhook_events(status);
