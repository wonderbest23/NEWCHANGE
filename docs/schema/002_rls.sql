-- =============================================================================
-- RLS — Family-scoped isolation
-- =============================================================================
-- 원칙:
--   - 보호자(family_members.user_id = auth.uid())만 자기 family 데이터 접근
--   - care_recipient_id 또는 family_id 를 추적해 가족 경계로 격리
--   - 통화 녹음 URL 은 primary_guardian 만 SELECT (별도 view 권장)
--   - service role 은 RLS 우회 → 서버 admin 작업용
-- =============================================================================

-- helper: 현재 유저가 속한 family_id 모음
create or replace function public.user_family_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select family_id from public.family_members where user_id = auth.uid()
$$;

-- helper: 현재 유저가 특정 care_recipient 에 접근 가능한가
create or replace function public.can_access_recipient(_recipient_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.care_recipients r
    join public.family_members m on m.family_id = r.family_id
    where r.id = _recipient_id and m.user_id = auth.uid()
  )
$$;

-- helper: primary_guardian 여부 (녹음 청취 권한 등)
create or replace function public.is_primary_guardian(_recipient_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.care_recipients r
    join public.family_members m on m.family_id = r.family_id
    where r.id = _recipient_id
      and m.user_id = auth.uid()
      and m.role = 'primary_guardian'
  )
$$;

-- =============================================================================
-- enable RLS + policies
-- =============================================================================

alter table public.families enable row level security;
create policy families_select on public.families for select to authenticated
  using (id in (select public.user_family_ids()));
create policy families_update on public.families for update to authenticated
  using (id in (select public.user_family_ids()));

alter table public.family_members enable row level security;
create policy family_members_select on public.family_members for select to authenticated
  using (family_id in (select public.user_family_ids()));
create policy family_members_self_update on public.family_members for update to authenticated
  using (user_id = auth.uid());

alter table public.care_recipients enable row level security;
create policy care_recipients_select on public.care_recipients for select to authenticated
  using (family_id in (select public.user_family_ids()));
create policy care_recipients_modify on public.care_recipients for all to authenticated
  using (family_id in (select public.user_family_ids()))
  with check (family_id in (select public.user_family_ids()));

alter table public.voice_consents enable row level security;
create policy voice_consents_select on public.voice_consents for select to authenticated
  using (public.can_access_recipient(care_recipient_id));

alter table public.outbound_call_jobs enable row level security;
create policy call_jobs_select on public.outbound_call_jobs for select to authenticated
  using (public.can_access_recipient(care_recipient_id));

alter table public.call_sessions enable row level security;
-- 녹음 URL 은 primary_guardian 만. 일반 select 는 메타데이터만 노출하도록
-- 애플리케이션 레이어에서 recording_url 을 마스킹할 것 (또는 view 분리).
create policy call_sessions_select on public.call_sessions for select to authenticated
  using (public.can_access_recipient(care_recipient_id));

alter table public.call_turns enable row level security;
create policy call_turns_select on public.call_turns for select to authenticated
  using (
    exists(
      select 1 from public.call_sessions s
      where s.id = call_turns.session_id
        and public.can_access_recipient(s.care_recipient_id)
    )
  );

alter table public.extracted_check_results enable row level security;
create policy extracted_select on public.extracted_check_results for select to authenticated
  using (public.can_access_recipient(care_recipient_id));

alter table public.medication_catalog enable row level security;
create policy med_catalog_select on public.medication_catalog for select to authenticated using (true);
-- 카탈로그는 관리자만 수정 (service role)

alter table public.medication_schedules enable row level security;
create policy med_schedules_all on public.medication_schedules for all to authenticated
  using (public.can_access_recipient(care_recipient_id))
  with check (public.can_access_recipient(care_recipient_id));

alter table public.medication_adherence_logs enable row level security;
create policy med_adherence_select on public.medication_adherence_logs for select to authenticated
  using (
    exists(
      select 1 from public.medication_schedules ms
      where ms.id = medication_adherence_logs.schedule_id
        and public.can_access_recipient(ms.care_recipient_id)
    )
  );

alter table public.conditions enable row level security;
create policy conditions_all on public.conditions for all to authenticated
  using (public.can_access_recipient(care_recipient_id))
  with check (public.can_access_recipient(care_recipient_id));

alter table public.symptoms_log enable row level security;
create policy symptoms_select on public.symptoms_log for select to authenticated
  using (public.can_access_recipient(care_recipient_id));

alter table public.daily_log enable row level security;
create policy daily_log_select on public.daily_log for select to authenticated
  using (public.can_access_recipient(care_recipient_id));

alter table public.anomaly_rules enable row level security;
create policy rules_select on public.anomaly_rules for select to authenticated using (true);
-- 수정은 service role 만

alter table public.anomaly_alerts enable row level security;
create policy alerts_select on public.anomaly_alerts for select to authenticated
  using (public.can_access_recipient(care_recipient_id));

alter table public.guardian_actions enable row level security;
create policy guardian_actions_select on public.guardian_actions for select to authenticated
  using (
    exists(
      select 1 from public.anomaly_alerts a
      where a.id = guardian_actions.alert_id
        and public.can_access_recipient(a.care_recipient_id)
    )
  );
create policy guardian_actions_insert on public.guardian_actions for insert to authenticated
  with check (
    exists(
      select 1 from public.anomaly_alerts a
      where a.id = guardian_actions.alert_id
        and public.can_access_recipient(a.care_recipient_id)
    )
  );

alter table public.notification_outbox enable row level security;
-- outbox 는 server-side worker 만 관리. 일반 사용자 노출 금지.
