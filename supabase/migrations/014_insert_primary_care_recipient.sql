-- 첫 care_recipient 등록: 클라이언트 INSERT RLS 이슈 회피(004 패턴). 013 이후 적용.
-- 호출자 = primary_guardian_id 이고, 해당 그룹의 guardian family_members 가 있을 때만 INSERT.

create or replace function public.insert_primary_care_recipient(
  p_family_group_id uuid,
  p_primary_guardian_id uuid,
  p_profile_id uuid,
  p_recipient_display_name text,
  p_emergency_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_new_id uuid;
  v_label text;
  v_disp text;
begin
  if v_uid is null then
    raise exception 'insert_primary_care_recipient: not authenticated'
      using errcode = '28000';
  end if;

  if v_uid <> p_primary_guardian_id then
    raise exception 'insert_primary_care_recipient: primary_guardian_id must match caller'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'insert_primary_care_recipient: profile missing for current user'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_group_id = p_family_group_id
      and fm.profile_id = v_uid
      and fm.member_role = 'guardian'
  ) then
    raise exception 'insert_primary_care_recipient: not a guardian in this family group'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.care_recipients cr
    where cr.family_group_id = p_family_group_id
  ) then
    raise exception 'insert_primary_care_recipient: family group already has a care recipient'
      using errcode = 'P0001';
  end if;

  v_label := nullif(trim(both from coalesce(p_recipient_display_name, '')), '');
  if p_profile_id is null and (v_label is null or length(v_label) = 0) then
    raise exception 'insert_primary_care_recipient: recipient_display_name required when profile_id is null'
      using errcode = 'P0001';
  end if;

  v_disp := trim(both from coalesce(p_recipient_display_name, ''));

  insert into public.care_recipients (
    family_group_id,
    primary_guardian_id,
    profile_id,
    recipient_display_name,
    emergency_note
  )
  values (
    p_family_group_id,
    p_primary_guardian_id,
    p_profile_id,
    case
      when p_profile_id is null then v_label
      when length(v_disp) > 0 then v_disp
      else null
    end,
    nullif(trim(both from coalesce(p_emergency_note, '')), '')
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.insert_primary_care_recipient(uuid, uuid, uuid, text, text) is
  'Guardian inserts first care_recipient for their group; validates membership; MVP one row per group.';

revoke all on function public.insert_primary_care_recipient(uuid, uuid, uuid, text, text) from public;
grant execute on function public.insert_primary_care_recipient(uuid, uuid, uuid, text, text) to authenticated;

-- Rollback (수동):
-- drop function if exists public.insert_primary_care_recipient(uuid, uuid, uuid, text, text);
