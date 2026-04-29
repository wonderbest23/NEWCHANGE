-- 마지막 보호자 1명만 가족 그룹 hard delete. care_recipient 있으면 금지. 011 이후 적용.
-- leave_family_group / remove_family_guardian_member 와 별도 RPC.

create or replace function public.delete_family_group(p_family_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_guardian_count int;
  v_care_count int;
  v_guardian_ids uuid[];
  v_pid uuid;
begin
  if v_uid is null then
    raise exception 'delete_family_group: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'delete_family_group: profile missing for current user'
      using errcode = 'P0001';
  end if;

  if not public.is_guardian_in_group(p_family_group_id, v_uid) then
    raise exception 'delete_family_group: not a guardian in this family group'
      using errcode = 'P0001';
  end if;

  select count(*)::int into v_guardian_count
  from public.family_members fm
  where fm.family_group_id = p_family_group_id
    and fm.member_role = 'guardian';

  if v_guardian_count <> 1 then
    raise exception 'delete_family_group: can only delete when exactly one guardian remains in the group'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_group_id = p_family_group_id
      and fm.member_role = 'guardian'
      and fm.profile_id = v_uid
  ) then
    raise exception 'delete_family_group: caller must be the sole guardian'
      using errcode = 'P0001';
  end if;

  select count(*)::int into v_care_count
  from public.care_recipients cr
  where cr.family_group_id = p_family_group_id;

  if v_care_count > 0 then
    raise exception 'delete_family_group: care recipients exist in this group'
      using errcode = 'P0001';
  end if;

  select coalesce(
    array_agg(fm.profile_id order by fm.created_at),
    array[]::uuid[]
  ) into v_guardian_ids
  from public.family_members fm
  where fm.family_group_id = p_family_group_id
    and fm.member_role = 'guardian';

  -- CASCADE 로도 지워지지만, pending 포함 해당 그룹 초대를 명시적으로 먼저 정리(구현 단순·의도 명확).
  delete from public.family_invites fi
  where fi.family_group_id = p_family_group_id;

  delete from public.family_groups fg
  where fg.id = p_family_group_id;

  foreach v_pid in array v_guardian_ids
  loop
    if not exists (
      select 1
      from public.family_members fm2
      where fm2.profile_id = v_pid
        and fm2.member_role = 'guardian'
    ) then
      delete from public.user_roles ur
      where ur.user_id = v_pid
        and ur.role = 'guardian';
    end if;
  end loop;
end;
$$;

comment on function public.delete_family_group(uuid) is
  'Sole guardian deletes empty family group (no care_recipients); clears invites; CASCADE removes members/subscriptions; drops user_roles.guardian if no other guardian membership.';

revoke all on function public.delete_family_group(uuid) from public;
grant execute on function public.delete_family_group(uuid) to authenticated;

-- Rollback (수동):
-- drop function if exists public.delete_family_group(uuid);
