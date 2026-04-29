-- 만료된 미수락 초대 행을 새 초대 직전에 제거해 동일 이메일 재초대 가능하게 함.
-- uq_family_invites_one_active_per_email 은 consumed_at is null 인 행만 대상이므로,
-- 만료만 된 행(consumed_at null, expires_at <= now())이 남으면 unique 충돌로 INSERT 실패함.
-- 006 이후 적용.

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

  delete from public.family_invites fi
  where fi.family_group_id = p_family_group_id
    and fi.invited_email = v_email_norm
    and fi.consumed_at is null
    and fi.expires_at <= now();

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
  'Guardian creates a pending invite; removes expired unconsumed row for same email first; returns invite_id and one-time raw token.';

revoke all on function public.create_family_guardian_invite(uuid, text, text) from public;
grant execute on function public.create_family_guardian_invite(uuid, text, text) to authenticated;

-- Rollback: 006 의 create 함수 정의로 되돌리거나, 이 파일의 이전 버전을 재적용.
