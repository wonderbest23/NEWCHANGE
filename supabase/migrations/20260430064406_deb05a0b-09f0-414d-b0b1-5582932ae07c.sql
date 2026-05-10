-- 1) notification_outbox: 일반 사용자 접근 명시적 차단 (서비스 롤만 사용)
create policy outbox_no_user_access on public.notification_outbox
  for all to authenticated
  using (false)
  with check (false);

-- 2) RLS 헬퍼 함수에서 anon 실행 권한 회수
revoke execute on function public.user_family_ids() from anon, public;
revoke execute on function public.can_access_recipient(uuid) from anon, public;
revoke execute on function public.is_primary_guardian(uuid) from anon, public;

-- authenticated 에는 RLS 정책 내부에서 호출되어야 하므로 유지
grant execute on function public.user_family_ids() to authenticated;
grant execute on function public.can_access_recipient(uuid) to authenticated;
grant execute on function public.is_primary_guardian(uuid) to authenticated;
