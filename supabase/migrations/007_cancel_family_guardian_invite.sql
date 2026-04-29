-- 보호자 초대 취소(대기 중만). 006 적용 이후 실행.
-- 클라이언트는 family_invites 에 직접 DELETE 불가 → RPC 로 RLS 우회.

create or replace function public.cancel_family_guardian_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.family_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'cancel_family_guardian_invite: not authenticated'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'cancel_family_guardian_invite: profile missing for current user'
      using errcode = 'P0001';
  end if;

  select fi.* into v_row
  from public.family_invites fi
  where fi.id = p_invite_id
  for update;

  if not found then
    raise exception 'cancel_family_guardian_invite: invite not found'
      using errcode = 'P0001';
  end if;

  if not public.is_guardian_in_group(v_row.family_group_id, v_uid) then
    raise exception 'cancel_family_guardian_invite: not a guardian in this family group'
      using errcode = 'P0001';
  end if;

  if v_row.consumed_at is not null then
    raise exception 'cancel_family_guardian_invite: invite already used or finalized'
      using errcode = 'P0001';
  end if;

  delete from public.family_invites where id = v_row.id;
end;
$$;

comment on function public.cancel_family_guardian_invite(uuid) is
  'Guardian in the invite''s family group deletes a pending invite (not yet consumed).';

revoke all on function public.cancel_family_guardian_invite(uuid) from public;
grant execute on function public.cancel_family_guardian_invite(uuid) to authenticated;

-- Rollback (수동):
-- drop function if exists public.cancel_family_guardian_invite(uuid);
