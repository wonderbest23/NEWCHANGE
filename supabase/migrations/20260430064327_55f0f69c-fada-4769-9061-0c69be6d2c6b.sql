-- =============================================================================
-- 곁(Gyeot) Care Call — Track A1
-- 001_init.sql + 002_rls.sql + 003_seed_rules.sql 통합 적용
-- =============================================================================

create extension if not exists "pgcrypto";

-- ============================ IDENTITY ============================
create table public.families (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 80),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.family_members (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  user_id       uuid not null,
  role          text not null check (role in ('primary_guardian','secondary_guardian','partner')),
  display_name  text,
  phone_e164    text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (family_id, user_id)
);
create index family_members_user_idx on public.family_members(user_id);
create index family_members_family_idx on public.family_members(family_id);

create table public.care_recipients (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  display_name    text not null check (length(display_name) between 1 and 40),
  phone_e164      text not null check (phone_e164 ~ '^\+82[0-9]{8,11}$'),
  birth_year      smallint check (birth_year between 1900 and extract(year from now())::int),
  timezone        text not null default 'Asia/Seoul',
  call_window_start time not null default '09:00',
  call_window_end   time not null default '11:00',
  do_not_disturb  boolean not null default false,
  status          text not null default 'active' check (status in ('active','paused','archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index care_recipients_family_idx on public.care_recipients(family_id);

-- ============================ CONSENT =============================
create table public.voice_consents (
  id              uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  granted         boolean not null,
  granted_at      timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  audio_url       text,
  source_session_id uuid,
  created_at      timestamptz not null default now()
);
create index voice_consents_recipient_idx on public.voice_consents(care_recipient_id);

-- ============================ TELEPHONY ===========================
create table public.outbound_call_jobs (
  id                uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  scheduled_at      timestamptz not null,
  window_start      timestamptz not null,
  window_end        timestamptz not null,
  status            text not null default 'queued'
                    check (status in ('queued','dialing','done','failed','cancelled','no_answer')),
  retry_count       smallint not null default 0,
  parent_job_id     uuid references public.outbound_call_jobs(id),
  reason            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index outbound_call_jobs_status_idx on public.outbound_call_jobs(status, scheduled_at);
create index outbound_call_jobs_recipient_idx on public.outbound_call_jobs(care_recipient_id, scheduled_at desc);

create table public.call_sessions (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid references public.outbound_call_jobs(id) on delete set null,
  care_recipient_id   uuid not null references public.care_recipients(id) on delete cascade,
  twilio_call_sid     text unique,
  openai_session_id   text,
  started_at          timestamptz,
  answered_at         timestamptz,
  ended_at            timestamptz,
  status              text not null default 'initiated'
                      check (status in ('initiated','ringing','in_progress','completed','no_answer','busy','failed','escalated','wrong_person')),
  end_reason          text,
  recording_url       text,
  recording_expires_at timestamptz,
  duration_sec        integer,
  cost_cents          integer,
  wrong_person_flag   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index call_sessions_recipient_idx on public.call_sessions(care_recipient_id, started_at desc);
create index call_sessions_status_idx on public.call_sessions(status);

create table public.call_turns (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.call_sessions(id) on delete cascade,
  turn_index        integer not null,
  role              text not null check (role in ('ai','user','system')),
  question_id       text,
  raw_text          text,
  classified_value  jsonb,
  is_unclear        boolean not null default false,
  confidence        real,
  latency_ms        integer,
  created_at        timestamptz not null default now(),
  unique (session_id, turn_index)
);
create index call_turns_session_idx on public.call_turns(session_id, turn_index);

-- ============================ HEALTH ==============================
create table public.extracted_check_results (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.call_sessions(id) on delete cascade,
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  recorded_for_date date not null,
  axis              text not null check (axis in ('meal','medication','symptom','mood','sleep','help','greeting')),
  value             jsonb not null,
  created_at        timestamptz not null default now(),
  unique (session_id, axis)
);
create index extracted_results_recipient_axis_idx on public.extracted_check_results(care_recipient_id, axis, recorded_for_date desc);

create table public.medication_catalog (
  id              uuid primary key default gen_random_uuid(),
  product_name    text not null,
  ingredient_name text not null,
  classification  text,
  kfda_item_seq   text unique,
  default_warnings text,
  verified_source text not null,
  verified_at     timestamptz not null default now(),
  source_version  text,
  created_at      timestamptz not null default now()
);
create index medication_catalog_name_idx on public.medication_catalog(product_name);

create table public.medication_schedules (
  id                uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  medication_id     uuid references public.medication_catalog(id),
  display_name      text not null,
  schedule_times    time[] not null,
  dose_amount       numeric,
  dose_unit         text,
  prescribed_by     text not null default 'self_input',
  active            boolean not null default true,
  starts_on         date,
  ends_on           date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index med_schedules_recipient_idx on public.medication_schedules(care_recipient_id) where active;

create table public.medication_adherence_logs (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.medication_schedules(id) on delete cascade,
  expected_at   timestamptz not null,
  status        text not null check (status in ('taken','missed','unsure','skipped_by_guardian')),
  source        text not null check (source in ('call','manual','schedule_default')),
  session_id    uuid references public.call_sessions(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (schedule_id, expected_at)
);
create index med_adherence_schedule_idx on public.medication_adherence_logs(schedule_id, expected_at desc);

create table public.conditions (
  id                uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  code              text not null,
  label             text not null,
  noted_at          date not null default current_date,
  created_at        timestamptz not null default now()
);

create table public.symptoms_log (
  id                uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  session_id        uuid references public.call_sessions(id) on delete set null,
  category          text not null,
  severity          text check (severity in ('mild','moderate','severe')),
  keywords          text[],
  occurred_on       date not null default current_date,
  created_at        timestamptz not null default now()
);
create index symptoms_recipient_date_idx on public.symptoms_log(care_recipient_id, occurred_on desc);

create table public.daily_log (
  id                uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  log_date          date not null,
  meal_status       text check (meal_status in ('ate','partial','skipped','unknown')),
  sleep_status      text check (sleep_status in ('good','poor','awake_often','unknown')),
  mood_status       text check (mood_status in ('good','soso','bad','unknown')),
  activity_note     text,
  created_at        timestamptz not null default now(),
  unique (care_recipient_id, log_date)
);

-- ============================ OPS =================================
create table public.anomaly_rules (
  code            text primary key,
  name            text not null,
  severity        text not null check (severity in ('info','warning','critical')),
  params          jsonb not null default '{}'::jsonb,
  enabled         boolean not null default true,
  version         integer not null default 1,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.anomaly_alerts (
  id                uuid primary key default gen_random_uuid(),
  rule_code         text not null references public.anomaly_rules(code),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  severity          text not null check (severity in ('info','warning','critical')),
  evidence          jsonb not null default '{}'::jsonb,
  guardian_message  text not null,
  status            text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
  acknowledged_by   uuid,
  acknowledged_at   timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index alerts_recipient_status_idx on public.anomaly_alerts(care_recipient_id, status, created_at desc);
create index alerts_severity_idx on public.anomaly_alerts(severity, status) where status = 'open';

create table public.guardian_actions (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references public.anomaly_alerts(id) on delete cascade,
  guardian_id uuid not null,
  action      text not null check (action in ('acknowledged','called','visited','dispatched_119','noted','dismissed')),
  note        text,
  created_at  timestamptz not null default now()
);
create index guardian_actions_alert_idx on public.guardian_actions(alert_id, created_at desc);

create table public.notification_outbox (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid references public.anomaly_alerts(id) on delete cascade,
  channel       text not null check (channel in ('kakao','sms','email','push')),
  template_code text not null,
  recipient     text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  attempt_count smallint not null default 0,
  last_error    text,
  scheduled_at  timestamptz not null default now(),
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index outbox_status_idx on public.notification_outbox(status, scheduled_at);

-- ============================ updated_at triggers ==================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end$$;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'families','family_members','care_recipients',
      'outbound_call_jobs','call_sessions',
      'medication_schedules','anomaly_rules'
    ])
  loop
    execute format($f$
      drop trigger if exists trg_%1$s_updated on public.%1$s;
      create trigger trg_%1$s_updated before update on public.%1$s
        for each row execute function public.tg_set_updated_at();
    $f$, t);
  end loop;
end$$;

-- ============================ RLS HELPERS =========================
create or replace function public.user_family_ids()
returns setof uuid language sql stable security definer
set search_path = public
as $$
  select family_id from public.family_members where user_id = auth.uid()
$$;

create or replace function public.can_access_recipient(_recipient_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.care_recipients r
    join public.family_members m on m.family_id = r.family_id
    where r.id = _recipient_id and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_primary_guardian(_recipient_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.care_recipients r
    join public.family_members m on m.family_id = r.family_id
    where r.id = _recipient_id and m.user_id = auth.uid()
      and m.role = 'primary_guardian'
  )
$$;

-- ============================ RLS POLICIES ========================
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

-- ============================ SEED RULES ==========================
-- 보수화 원칙: R005(응급), R006(정신건강) 은 enabled=false 로 시드.
-- Track B-6 (의료/법무 검토) 통과 후 운영팀이 수동으로 enabled=true 전환.
insert into public.anomaly_rules (code, name, severity, params, enabled, description) values
('R001','48시간 미응답','critical',
 '{"window_hours":48,"min_no_answer":3}'::jsonb, true,
 '성공 통화 0건 + no_answer >= 3 인 경우'),
('R002','이틀 연속 식사 미확인','warning',
 '{"window_days":2}'::jsonb, true,
 'extracted(meal) = skipped 가 2일 연속'),
('R003','약 누락 반복','warning',
 '{"window_days":7,"min_missed":3}'::jsonb, true,
 '7일 중 missed >= 3'),
('R004','낙상 관련 표현 감지','critical',
 '{"keywords":["넘어졌","쓰러졌","미끄러졌","낙상"]}'::jsonb, true,
 '오늘 통화 turn 에서 낙상 관련 관찰 키워드 매칭 (관찰형 분류, 응급 확정 아님)'),
('R005','응급 의심 표현 감지','critical',
 '{"keywords":["가슴이 아파","숨이 차","숨쉬기 힘","머리가 깨질","말이 안 나","한쪽이 안 움직","의식이"]}'::jsonb, false,
 '호흡곤란/가슴통증/의식혼미 등 응급 의심 표현. Track B-6 의료/법무 검토 후 활성화'),
('R006','정서적으로 가라앉은 표현 반복','warning',
 '{"window_days":14,"min_days":5}'::jsonb, false,
 '관찰형: 부정 정서 표현 키워드 일정 일수 이상. Track B-6 검토 후 활성화'),
('R007','수면 악화 지속','info',
 '{"window_days":7,"min_poor":5}'::jsonb, true,
 'sleep=poor >= 5/7일'),
('R008','본인확인 실패','warning',
 '{}'::jsonb, true,
 'wrong_person_flag=true 인 통화'),
('R009','약 부작용 의심 표현','warning',
 '{}'::jsonb, true,
 'Q3a=side_effect 응답 (관찰형)')
on conflict (code) do update
set name = excluded.name,
    severity = excluded.severity,
    params = excluded.params,
    enabled = excluded.enabled,
    description = excluded.description,
    updated_at = now();
