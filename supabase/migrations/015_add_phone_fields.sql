-- 015_add_phone_fields.sql
-- Add phone number field to checkout_order_attendees table
-- Note: public.users table was dropped in migration 006

alter table public.checkout_order_attendees 
add column if not exists phone text;

