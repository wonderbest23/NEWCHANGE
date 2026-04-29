-- 현재 사용자(guardian)가 가족 그룹에서 스스로 나가기. 010 이후 적용.
-- remove_family_guardian_member(009)는 타인 제거 전용; 본인 나가기는 별 RPC.

create or replace function public.leave_family_group(p_family_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_guardian_count int;
begin
  if v_uid is null then
    raise exception 'leave_family_group: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'leave_family_group: profile missing for current user'
      using errcode = 'P0001';
  end if;

  if not public.is_guardian_in_group(p_family_group_id, v_uid) then
    raise exception 'leave_family_group: not a guardian in this family group'
      using errcode = 'P0001';
  end if;

  select count(*)::int into v_guardian_count
  from public.family_members fm
  where fm.family_group_id = p_family_group_id
    and fm.member_role = 'guardian';

  if v_guardian_count < 2 then
    raise exception 'leave_family_group: cannot leave as last guardian in this group'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.care_recipients cr
    where cr.family_group_id = p_family_group_id
      and cr.primary_guardian_id = v_uid
  ) then
    raise exception 'leave_family_group: is primary guardian for a care recipient in this group'
      using errcode = 'P0001';
  end if;

  delete from public.family_members fm
  where fm.family_group_id = p_family_group_id
    and fm.profile_id = v_uid
    and fm.member_role = 'guardian';

  if not exists (
    select 1
    from public.family_members fm2
    where fm2.profile_id = v_uid
      and fm2.member_role = 'guardian'
  ) then
    delete from public.user_roles ur
    where ur.user_id = v_uid
      and ur.role = 'guardian';
  end if;
end;
$$;

comment on function public.leave_family_group(uuid) is
  'Current user leaves a family group as guardian; forbids last guardian and primary guardian; drops user_roles.guardian if no other guardian membership.';

revoke all on function public.leave_family_group(uuid) from public;
grant execute on function public.leave_family_group(uuid) to authenticated;

-- Rollback (수동):
-- drop function if exists public.leave_family_group(uuid);
