-- 028_add_email_sent_at_to_passes.sql
-- Add email_sent_at to passes to track delivery of pass codes.

alter table public.passes
add column if not exists email_sent_at timestamptz;
