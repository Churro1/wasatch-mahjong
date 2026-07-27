-- 030_fix_pass_redemption_ambiguity.sql
-- Fixes an ambiguous column reference for 'remaining_uses' in pass redemption functions.

create or replace function public.commit_pass_redemptions(
  p_order_id uuid
)
returns table (
  pass_id uuid,
  committed_uses integer,
  remaining_uses integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption record;
  v_remaining_uses integer;
begin
  for v_redemption in
    select r.id, r.pass_id, r.used_uses
    from public.pass_redemptions r
    where r.order_id = p_order_id
      and r.reversed_at is null
      and r.committed_at is null
    for update
  loop
    update public.passes
    set remaining_uses = passes.remaining_uses - v_redemption.used_uses,
        status = case when passes.remaining_uses - v_redemption.used_uses <= 0 then 'redeemed' else 'active' end,
        redeemed_at = case when passes.remaining_uses - v_redemption.used_uses <= 0 then now() else redeemed_at end,
        updated_at = now()
    where id = v_redemption.pass_id
    returning passes.remaining_uses into v_remaining_uses;

    if v_remaining_uses is null or v_remaining_uses < 0 then
      raise exception using errcode = 'P0001', message = 'Pass balance could not be committed.';
    end if;

    update public.pass_redemptions
    set committed_at = now(),
        reservation_expires_at = null,
        updated_at = now()
    where id = v_redemption.id;

    return query
    select v_redemption.pass_id, v_redemption.used_uses, v_remaining_uses;
  end loop;
end;
$$;

create or replace function public.reverse_pass_redemptions(
  p_order_id uuid
)
returns table (
  pass_id uuid,
  reversed_uses integer,
  remaining_uses integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption record;
  v_remaining_uses integer;
begin
  for v_redemption in
    select r.id, r.pass_id, r.used_uses, r.committed_at
    from public.pass_redemptions r
    where r.order_id = p_order_id
      and r.reversed_at is null
    for update
  loop
    if v_redemption.committed_at is null then
      update public.pass_redemptions
      set reversed_at = now(),
          updated_at = now()
      where id = v_redemption.id;
    else
      update public.passes
      set remaining_uses = passes.remaining_uses + v_redemption.used_uses,
          status = 'active',
          redeemed_at = case when passes.remaining_uses + v_redemption.used_uses > 0 then null else redeemed_at end,
          updated_at = now()
      where id = v_redemption.pass_id
      returning passes.remaining_uses into v_remaining_uses;

      update public.pass_redemptions
      set reversed_at = now(),
          updated_at = now()
      where id = v_redemption.id;
    end if;

    return query
    select v_redemption.pass_id, v_redemption.used_uses, coalesce(v_remaining_uses, 0);
  end loop;
end;
$$;
