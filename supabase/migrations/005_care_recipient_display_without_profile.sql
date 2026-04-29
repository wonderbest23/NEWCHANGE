-- 수급자 최소 등록: auth 프로필 없이 보호자가 이름만으로 care_recipients 1건을 넣을 수 있게 함.
-- profiles_insert 는 id = auth.uid() 만 허용하므로, 부모님 전용 profiles 행은 클라이언트에서 생성 불가.
-- RLS(care_recipients_insert)는 변경 없음 — 기존처럼 그룹 내 보호자면 insert 가능.
--
-- Rollback (수동):
-- alter table public.care_recipients drop constraint if exists care_recipients_profile_or_label_chk;
-- alter table public.care_recipients drop column if exists recipient_display_name;
-- alter table public.care_recipients alter column profile_id set not null;

alter table public.care_recipients alter column profile_id drop not null;

alter table public.care_recipients
  add column if not exists recipient_display_name text;

comment on column public.care_recipients.recipient_display_name is
  '연결된 profiles 행이 없을 때 표시용 이름(보호자 입력). profile_id가 있으면 비워도 됨.';

alter table public.care_recipients
  add constraint care_recipients_profile_or_label_chk
  check (
    profile_id is not null
    or (
      recipient_display_name is not null
      and length(btrim(recipient_display_name)) > 0
    )
  );
