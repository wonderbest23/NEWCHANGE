-- =============================================================================
-- 곁(Gyeot) Care Call — Initial Schema
-- Target: PostgreSQL 15+ (Supabase compatible)
-- Apply order: 001 → 002 → 003
-- =============================================================================
--
-- Domain boundaries:
--   identity   : families / family_members / care_recipients (auth.users 연동)
--   telephony  : outbound_call_jobs / call_sessions / call_turns
--   health     : extracted_check_results / medication_* / conditions / symptoms_log / daily_log
--   ops        : anomaly_rules / anomaly_alerts / guardian_actions / notification_outbox
--   consent    : voice_consents
--
-- Conventions:
--   - 모든 PK는 uuid (gen_random_uuid)
--   - 모든 테이블에 created_at / updated_at
--   - care_recipient_id 가 가족 단위 격리의 외부키 경계
--   - enum 은 CHECK 제약으로 표현 (마이그레이션 유연성 위해)
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- IDENTITY
-- =============================================================================

create table public.families (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 80),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.family_members (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  user_id       uuid not null,                   -- references auth.users(id)
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
  phone_e164      text not null check (phone_e164 ~ '^\+82[0-9]{8,11}$'),  -- 한국 번호 기본
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

-- =============================================================================
-- CONSENT
-- =============================================================================

create table public.voice_consents (
  id              uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  granted         boolean not null,
  granted_at      timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  audio_url       text,                            -- 동의 발화 구간 잘라 저장 (Storage)
  source_session_id uuid,                          -- 어느 통화에서 받았는지
  created_at      timestamptz not null default now()
);

create index voice_consents_recipient_idx on public.voice_consents(care_recipient_id);

-- =============================================================================
-- TELEPHONY
-- =============================================================================

create table public.outbound_call_jobs (
  id                uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  scheduled_at      timestamptz not null,
  window_start      timestamptz not null,
  window_end        timestamptz not null,
  status            text not null default 'queued'
                    check (status in ('queued','dialing','done','failed','cancelled','no_answer')),
  retry_count       smallint not null default 0,
  parent_job_id     uuid references public.outbound_call_jobs(id),  -- 재시도 체인
  reason            text,                                            -- daily / followup / consent_renewal
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
  end_reason          text,                       -- normal / user_ended / silence_timeout / hard_limit / escalate
  recording_url       text,                       -- Storage path, 90d TTL
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
  question_id       text,                          -- Q0/Q1/Q2/...
  raw_text          text,
  classified_value  jsonb,                         -- {axis, value} enum-only
  is_unclear        boolean not null default false,
  confidence        real,
  latency_ms        integer,
  created_at        timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index call_turns_session_idx on public.call_turns(session_id, turn_index);

-- =============================================================================
-- HEALTH
-- =============================================================================

create table public.extracted_check_results (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.call_sessions(id) on delete cascade,
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  recorded_for_date date not null,
  axis              text not null check (axis in ('meal','medication','symptom','mood','sleep','help','greeting')),
  value             jsonb not null,                -- {enum, detail?, keywords?[]}
  created_at        timestamptz not null default now(),
  unique (session_id, axis)
);

create index extracted_results_recipient_axis_idx on public.extracted_check_results(care_recipient_id, axis, recorded_for_date desc);

-- 식약처 의약품 카탈로그 (검증된 출처만)
create table public.medication_catalog (
  id              uuid primary key default gen_random_uuid(),
  product_name    text not null,
  ingredient_name text not null,
  classification  text,                            -- ATC 또는 식약처 분류
  kfda_item_seq   text unique,                     -- 식약처 의약품 품목기준코드
  default_warnings text,                           -- 식약처 허가사항 발췌
  verified_source text not null,                   -- 'kfda' / 'manual' / ...
  verified_at     timestamptz not null default now(),
  source_version  text,
  created_at      timestamptz not null default now()
);

create index medication_catalog_name_idx on public.medication_catalog(product_name);

create table public.medication_schedules (
  id                uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  medication_id     uuid references public.medication_catalog(id),
  display_name      text not null,                 -- catalog 미사용 시 보호자 입력 이름
  schedule_times    time[] not null,               -- ['08:00','20:00']
  dose_amount       numeric,
  dose_unit         text,
  prescribed_by     text not null default 'self_input', -- self_input / doctor_name (자유)
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
  code              text not null,                  -- enum: hypertension/diabetes/dementia/heart_failure/...
  label             text not null,
  noted_at          date not null default current_date,
  created_at        timestamptz not null default now()
);

create table public.symptoms_log (
  id                uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  session_id        uuid references public.call_sessions(id) on delete set null,
  category          text not null,                  -- pain/respiratory/cognitive/...
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

-- =============================================================================
-- OPS — Rule Engine / Alerts / Notifications
-- =============================================================================

create table public.anomaly_rules (
  code            text primary key,                -- R001 ...
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
  acknowledged_by   uuid,                          -- family_members.id
  acknowledged_at   timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index alerts_recipient_status_idx on public.anomaly_alerts(care_recipient_id, status, created_at desc);
create index alerts_severity_idx on public.anomaly_alerts(severity, status) where status = 'open';

create table public.guardian_actions (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references public.anomaly_alerts(id) on delete cascade,
  guardian_id uuid not null,                        -- family_members.id
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
  recipient     text not null,                      -- phone or email
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  attempt_count smallint not null default 0,
  last_error    text,
  scheduled_at  timestamptz not null default now(),
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index outbox_status_idx on public.notification_outbox(status, scheduled_at);

-- =============================================================================
-- updated_at triggers
-- =============================================================================

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
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
