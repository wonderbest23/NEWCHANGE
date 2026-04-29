-- 가족 그룹에서 보호자 멤버 제거(최소 MVP). 006~008 이후 적용.
-- 클라이언트 직접 DELETE 대신 RPC (SECURITY DEFINER) — RLS·규칙 일원화.

create or replace function public.remove_family_guardian_member(
  p_family_group_id uuid,
  p_profile_id uuid
)
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
    raise exception 'remove_family_guardian_member: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'remove_family_guardian_member: profile missing for current user'
      using errcode = 'P0001';
  end if;

  if not public.is_guardian_in_group(p_family_group_id, v_uid) then
    raise exception 'remove_family_guardian_member: not a guardian in this family group'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_group_id = p_family_group_id
      and fm.profile_id = p_profile_id
      and fm.member_role = 'guardian'
  ) then
    raise exception 'remove_family_guardian_member: target is not a guardian in this group'
      using errcode = 'P0001';
  end if;

  if v_uid = p_profile_id then
    raise exception 'remove_family_guardian_member: cannot remove self'
      using errcode = 'P0001';
  end if;

  select count(*)::int into v_guardian_count
  from public.family_members fm
  where fm.family_group_id = p_family_group_id
    and fm.member_role = 'guardian';

  if v_guardian_count < 2 then
    raise exception 'remove_family_guardian_member: at least two guardians required to remove one'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.care_recipients cr
    where cr.family_group_id = p_family_group_id
      and cr.primary_guardian_id = p_profile_id
  ) then
    raise exception 'remove_family_guardian_member: is primary guardian for a care recipient in this group'
      using errcode = 'P0001';
  end if;

  delete from public.family_members fm
  where fm.family_group_id = p_family_group_id
    and fm.profile_id = p_profile_id
    and fm.member_role = 'guardian';

  if not exists (
    select 1
    from public.family_members fm2
    where fm2.profile_id = p_profile_id
      and fm2.member_role = 'guardian'
  ) then
    delete from public.user_roles ur
    where ur.user_id = p_profile_id
      and ur.role = 'guardian';
  end if;
end;
$$;

comment on function public.remove_family_guardian_member(uuid, uuid) is
  'Removes a guardian family_member from a group; forbids self, last guardian, primary guardian; drops user_roles.guardian if no other guardian membership.';

revoke all on function public.remove_family_guardian_member(uuid, uuid) from public;
grant execute on function public.remove_family_guardian_member(uuid, uuid) to authenticated;

-- Rollback (수동):
-- drop function if exists public.remove_family_guardian_member(uuid, uuid);
