-- family_guardian 초대(링크 복사형 MVP) — family_invites + create/accept RPC
-- 001~005 적용 이후 실행. 운영/스테이징에는 리뷰 후 적용.
--
-- 전제:
-- - invited_email 은 항상 lower(trim()) 정규화된 값만 저장 (CHECK).
-- - token 원문은 DB에 저장하지 않고 token_hash 만 저장.
-- - create RPC 가 invite_token 을 1회 반환 (이후 재조회 불가).
-- - accept RPC 는 auth.users.email 과 invited_email 일치 시에만 수락.
-- - family_members / user_roles insert 는 RLS 우회를 위해 SECURITY DEFINER (004 와 동일 패턴).
--
-- Rollback 은 파일 하단 주석 블록 참고.

-- ---------------------------------------------------------------------------
-- pgcrypto: digest / gen_random_bytes (대부분 설치 시 public 스키마)
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- public.family_invites
-- ---------------------------------------------------------------------------
create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.family_groups (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete restrict,
  invited_email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_profile_id uuid references public.profiles (id) on delete set null,
  relationship text,
  created_at timestamptz not null default now(),
  constraint family_invites_email_normalized_chk
    check (
      invited_email = lower(trim(both from invited_email))
      and length(invited_email) > 0
    ),
  constraint family_invites_relationship_len_chk
    check (relationship is null or length(relationship) <= 500)
);

comment on table public.family_invites is
  '가족 그룹에 다른 보호자를 초대하기 위한 링크형 초대(원문 토큰 미저장).';

comment on column public.family_invites.invited_email is
  '항상 lower(trim()) 된 값만 저장. citext 대신 text + CHECK 로 의존성 최소화.';

comment on column public.family_invites.token_hash is
  '초대 토큰 원문의 단방향 해시(SHA-256 hex). 원문은 저장하지 않음.';

create unique index uq_family_invites_token_hash
  on public.family_invites (token_hash);

create unique index uq_family_invites_one_active_per_email
  on public.family_invites (family_group_id, invited_email)
  where consumed_at is null;

create index idx_family_invites_family_group
  on public.family_invites (family_group_id);

create index idx_family_invites_expires_at
  on public.family_invites (expires_at);

alter table public.family_invites enable row level security;

-- 클라이언트 직접 insert/update 금지 목적: RPC 만 소비. 읽기는 초대 생성자 또는 동일 그룹 보호자.
create policy family_invites_select
on public.family_invites
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or invited_by = (select auth.uid())::uuid
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
);

-- 정책 없음 = authenticated 직접 insert/update/delete 불가 (RPC 는 DEFINER 로 RLS 우회)

-- ---------------------------------------------------------------------------
-- create_family_guardian_invite
-- ---------------------------------------------------------------------------
create or replace function public.create_family_guardian_invite(
  p_family_group_id uuid,
  p_invited_email text,
  p_relationship text default null
)
returns table (invite_id uuid, invite_token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email_norm text;
  v_raw_token text;
  v_token_hash text;
  v_invite_id uuid;
  v_inviter_email text;
  v_rel text;
begin
  if v_uid is null then
    raise exception 'create_family_guardian_invite: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'create_family_guardian_invite: profile missing for current user'
      using errcode = 'P0001';
  end if;

  if not public.is_guardian_in_group(p_family_group_id, v_uid) then
    raise exception 'create_family_guardian_invite: not a guardian in this family group'
      using errcode = 'P0001';
  end if;

  v_email_norm := lower(trim(both from coalesce(p_invited_email, '')));
  if v_email_norm is null or length(v_email_norm) = 0 then
    raise exception 'create_family_guardian_invite: invited email required'
      using errcode = 'P0001';
  end if;

  if length(v_email_norm) > 320 or position('@' in v_email_norm) = 0 then
    raise exception 'create_family_guardian_invite: invalid email'
      using errcode = 'P0001';
  end if;

  select lower(trim(both from coalesce(u.email, ''))) into v_inviter_email
  from auth.users u
  where u.id = v_uid;

  if v_inviter_email is not null and v_inviter_email = v_email_norm then
    raise exception 'create_family_guardian_invite: cannot invite your own email'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.family_members fm
    join auth.users u on u.id = fm.profile_id
    where fm.family_group_id = p_family_group_id
      and fm.member_role = 'guardian'
      and lower(trim(both from coalesce(u.email, ''))) = v_email_norm
  ) then
    raise exception 'create_family_guardian_invite: email already a guardian in this group'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.family_invites fi
    where fi.family_group_id = p_family_group_id
      and fi.invited_email = v_email_norm
      and fi.consumed_at is null
      and fi.expires_at > now()
  ) then
    raise exception 'create_family_guardian_invite: pending invite already exists for this email'
      using errcode = 'P0001';
  end if;

  v_rel := nullif(trim(both from coalesce(p_relationship, '')), '');
  if v_rel is not null and length(v_rel) > 500 then
    raise exception 'create_family_guardian_invite: relationship too long (max 500)'
      using errcode = 'P0001';
  end if;

  v_raw_token := replace(
    replace(encode(gen_random_bytes(32), 'base64'), '+', '-'),
    '/', '_'
  );
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  insert into public.family_invites (
    family_group_id,
    invited_by,
    invited_email,
    token_hash,
    expires_at,
    relationship
  )
  values (
    p_family_group_id,
    v_uid,
    v_email_norm,
    v_token_hash,
    now() + interval '7 days',
    v_rel
  )
  returning id into v_invite_id;

  return query select v_invite_id, v_raw_token;
end;
$$;

comment on function public.create_family_guardian_invite(uuid, text, text) is
  'Guardian creates a pending invite; returns invite_id and one-time raw token (not stored).';

revoke all on function public.create_family_guardian_invite(uuid, text, text) from public;
grant execute on function public.create_family_guardian_invite(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_family_guardian_invite
-- ---------------------------------------------------------------------------
create or replace function public.accept_family_guardian_invite(
  p_invite_token text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_hash text;
  v_row public.family_invites%rowtype;
  v_acceptor_email text;
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'accept_family_guardian_invite: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'accept_family_guardian_invite: profile missing for current user'
      using errcode = 'P0001';
  end if;

  v_token := trim(both from coalesce(p_invite_token, ''));
  if length(v_token) = 0 then
    raise exception 'accept_family_guardian_invite: token required'
      using errcode = 'P0001';
  end if;

  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  select fi.* into v_row
  from public.family_invites fi
  where fi.token_hash = v_hash
  for update;

  if not FOUND then
    raise exception 'accept_family_guardian_invite: invalid or unknown token'
      using errcode = 'P0001';
  end if;

  if v_row.consumed_at is not null then
    raise exception 'accept_family_guardian_invite: invite already used'
      using errcode = 'P0001';
  end if;

  if v_row.expires_at <= now() then
    raise exception 'accept_family_guardian_invite: invite expired'
      using errcode = 'P0001';
  end if;

  select lower(trim(both from coalesce(u.email, ''))) into v_acceptor_email
  from auth.users u
  where u.id = v_uid;

  if v_acceptor_email is null or v_acceptor_email <> v_row.invited_email then
    raise exception 'accept_family_guardian_invite: email does not match invite'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.family_group_id = v_row.family_group_id
      and fm.profile_id = v_uid
      and fm.member_role = 'guardian'
  ) then
    raise exception 'accept_family_guardian_invite: already a guardian in this group'
      using errcode = 'P0001';
  end if;

  insert into public.family_members (
    family_group_id,
    profile_id,
    member_role,
    relationship
  )
  values (
    v_row.family_group_id,
    v_uid,
    'guardian',
    v_row.relationship
  );

  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_uid and ur.role = 'guardian'
  ) then
    insert into public.user_roles (user_id, role)
    values (v_uid, 'guardian');
  end if;

  update public.family_invites
  set
    consumed_at = now(),
    consumed_by_profile_id = v_uid
  where id = v_row.id;

  v_group_id := v_row.family_group_id;
  return v_group_id;
end;
$$;

comment on function public.accept_family_guardian_invite(text) is
  'Accepts invite: verifies token and email, inserts family_members guardian and optional user_roles.guardian.';

revoke all on function public.accept_family_guardian_invite(text) from public;
grant execute on function public.accept_family_guardian_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback (수동 실행용 — 별도 migration 으로 내리지 않을 때)
-- ---------------------------------------------------------------------------
-- drop function if exists public.accept_family_guardian_invite(text);
-- drop function if exists public.create_family_guardian_invite(uuid, text, text);
-- drop policy if exists family_invites_select on public.family_invites;
-- drop table if exists public.family_invites;
-- -- pgcrypto 는 다른 객체가 쓰면 extension 제거 생략

-- ---------------------------------------------------------------------------
-- 적용 전 확인 SQL (예시)
-- ---------------------------------------------------------------------------
-- select exists(select 1 from pg_extension where extname = 'pgcrypto');
-- select column_name, data_type from information_schema.columns
--   where table_schema = 'auth' and table_name = 'users' and column_name = 'email';
-- select proname from pg_proc join pg_namespace n on n.oid = pg_proc.pronamespace
--   where n.nspname = 'public' and proname in ('has_role', 'is_guardian_in_group');

-- ---------------------------------------------------------------------------
-- 적용 후 검증 SQL (예시 — 실제 uuid/token 은 세션에 맞게 교체)
-- ---------------------------------------------------------------------------
-- select * from public.create_family_guardian_invite(
--   '<family_group_id>'::uuid,
--   'invitee@example.com',
--   '동생'
-- );
-- select * from public.accept_family_guardian_invite('<paste_invite_token>');
-- select * from public.family_members where family_group_id = '<family_group_id>';
-- select * from public.user_roles where user_id = '<profile_id>' and role = 'guardian';
