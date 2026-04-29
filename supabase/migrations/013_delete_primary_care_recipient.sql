-- 그룹 보호자가 해당 그룹의 care_recipient 1건을 삭제(MVP: created_at 기준 첫 번째만). 012 이후 적용.

create or replace function public.delete_care_recipient(
  p_family_group_id uuid,
  p_care_recipient_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.care_recipients%rowtype;
  v_first_id uuid;
begin
  if v_uid is null then
    raise exception 'delete_care_recipient: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'delete_care_recipient: profile missing for current user'
      using errcode = 'P0001';
  end if;

  if not public.is_guardian_in_group(p_family_group_id, v_uid) then
    raise exception 'delete_care_recipient: not a guardian in this family group'
      using errcode = 'P0001';
  end if;

  select cr.* into v_row
  from public.care_recipients cr
  where cr.id = p_care_recipient_id
  for update;

  if not found then
    raise exception 'delete_care_recipient: care recipient not found'
      using errcode = 'P0001';
  end if;

  if v_row.family_group_id <> p_family_group_id then
    raise exception 'delete_care_recipient: care recipient does not belong to this family group'
      using errcode = 'P0001';
  end if;

  select cr_first.id into v_first_id
  from public.care_recipients cr_first
  where cr_first.family_group_id = p_family_group_id
  order by cr_first.created_at asc, cr_first.id asc
  limit 1;

  if v_first_id is null or v_first_id <> p_care_recipient_id then
    raise exception 'delete_care_recipient: only the first care recipient in this group can be deleted'
      using errcode = 'P0001';
  end if;

  delete from public.care_recipients cr
  where cr.id = p_care_recipient_id;
end;
$$;

comment on function public.delete_care_recipient(uuid, uuid) is
  'Guardian deletes one care_recipient in their group; MVP allows only the chronologically first row per family_group_id; CASCADE cleans dependent rows.';

revoke all on function public.delete_care_recipient(uuid, uuid) from public;
grant execute on function public.delete_care_recipient(uuid, uuid) to authenticated;

-- Rollback (수동):
-- drop function if exists public.delete_care_recipient(uuid, uuid);
