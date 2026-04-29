-- 첫 care_recipient(단건)의 주 보호자 변경. 009 이후 적용.
-- RLS만으로는 "새 주 보호자가 그룹 guardian"을 강제하기 어려워 RPC 로 통일.

create or replace function public.reassign_care_recipient_primary_guardian(
  p_family_group_id uuid,
  p_care_recipient_id uuid,
  p_new_primary_guardian_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.care_recipients%rowtype;
begin
  if v_uid is null then
    raise exception 'reassign_care_recipient_primary_guardian: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'reassign_care_recipient_primary_guardian: profile missing for current user'
      using errcode = 'P0001';
  end if;

  if not public.is_guardian_in_group(p_family_group_id, v_uid) then
    raise exception 'reassign_care_recipient_primary_guardian: not a guardian in this family group'
      using errcode = 'P0001';
  end if;

  select cr.* into v_row
  from public.care_recipients cr
  where cr.id = p_care_recipient_id
  for update;

  if not found then
    raise exception 'reassign_care_recipient_primary_guardian: care recipient not found'
      using errcode = 'P0001';
  end if;

  if v_row.family_group_id <> p_family_group_id then
    raise exception 'reassign_care_recipient_primary_guardian: care recipient does not belong to this family group'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_new_primary_guardian_id) then
    raise exception 'reassign_care_recipient_primary_guardian: new primary guardian profile not found'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_group_id = p_family_group_id
      and fm.profile_id = p_new_primary_guardian_id
      and fm.member_role = 'guardian'
  ) then
    raise exception 'reassign_care_recipient_primary_guardian: new primary must be a guardian in this family group'
      using errcode = 'P0001';
  end if;

  if v_row.primary_guardian_id = p_new_primary_guardian_id then
    return;
  end if;

  update public.care_recipients
  set primary_guardian_id = p_new_primary_guardian_id
  where id = p_care_recipient_id;
end;
$$;

comment on function public.reassign_care_recipient_primary_guardian(uuid, uuid, uuid) is
  'Guardian reassigns primary_guardian_id for a care_recipient in their group; new primary must be guardian member; same-value is no-op.';

revoke all on function public.reassign_care_recipient_primary_guardian(uuid, uuid, uuid) from public;
grant execute on function public.reassign_care_recipient_primary_guardian(uuid, uuid, uuid) to authenticated;

-- Rollback (수동):
-- drop function if exists public.reassign_care_recipient_primary_guardian(uuid, uuid, uuid);
