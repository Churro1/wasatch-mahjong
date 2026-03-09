-- 006_drop_public_users_table.sql
-- Security hardening: do not duplicate auth identities in public schema.

drop table if exists public.users cascade;
