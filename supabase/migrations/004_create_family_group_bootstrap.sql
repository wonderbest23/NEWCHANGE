-- family_groups + 첫 family_members(guardian) 부트스트랩 RPC
-- 001_create_care_core_schema.sql, 002_care_core_rls_policies.sql 적용 이후 실행.
-- 운영/스테이징에는 리뷰 후 적용. 적용 전 §6 확인 SQL, 적용 후 §7 검증 SQL을 실행할 것.
--
-- 배경: family_members RLS insert 가 is_guardian_in_group 을 요구해
--       그룹에 보호자 행이 없으면 첫 멤버 삽입이 불가능함. SECURITY DEFINER RPC 로
--       동일 트랜잭션에서 그룹 생성 + 생성자 guardian 등록 (RLS 정책 변경 없음).
--
-- Rollback 은 파일 하단 주석 블록 참고.

-- ---------------------------------------------------------------------------
-- create_family_group_bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.create_family_group_bootstrap(
  p_name text,
  p_relationship text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'create_family_group_bootstrap: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_uid
  ) then
    raise exception 'create_family_group_bootstrap: profile missing for current user'
      using errcode = 'P0001';
  end if;

  v_name := trim(p_name);
  if v_name is null or length(v_name) = 0 then
    raise exception 'create_family_group_bootstrap: name required'
      using errcode = 'P0001';
  end if;

  if length(v_name) > 200 then
    raise exception 'create_family_group_bootstrap: name too long (max 200)'
      using errcode = 'P0001';
  end if;

  if p_relationship is not null and length(trim(p_relationship)) > 500 then
    raise exception 'create_family_group_bootstrap: relationship too long (max 500)'
      using errcode = 'P0001';
  end if;

  insert into public.family_groups (name, created_by)
  values (v_name, v_uid)
  returning id into v_group_id;

  insert into public.family_members (
    family_group_id,
    profile_id,
    member_role,
    relationship
  )
  values (
    v_group_id,
    v_uid,
    'guardian',
    nullif(trim(p_relationship), '')
  );

  return v_group_id;
end;
$$;

comment on function public.create_family_group_bootstrap(text, text) is
  'Creates family_groups row and first family_members row (guardian = auth.uid()) in one transaction; bypasses RLS chicken-egg via SECURITY DEFINER.';

revoke all on function public.create_family_group_bootstrap(text, text) from public;
grant execute on function public.create_family_group_bootstrap(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback (수동 실행용 — 별도 migration 으로 내리지 않을 때)
-- ---------------------------------------------------------------------------
-- drop function if exists public.create_family_group_bootstrap(text, text);
