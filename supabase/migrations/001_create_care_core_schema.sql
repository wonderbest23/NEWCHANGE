-- 효도형 가족 케어 MVP — 코어 스키마 초안
-- PostGIS + 핵심 테이블 + RLS 활성화(정책은 다음 마이그레이션)
-- 수동 적용/실행하지 말고, 팀 리뷰·스테이징에서 검증 후 적용

-- -- extensions (Supabase: 보통 public 또는 extensions; 클라우드에서 postgis 사용 가능)
create extension if not exists postgis;

-- -- 공통: updated_at 자동 갱신(해당 컬럼이 있는 테이블만)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: auth.users 1:1
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  phone text,
  birth_year int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_birth_year_check check (birth_year is null or (birth_year >= 1900 and birth_year <= 2100))
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_roles: 다중 역할(한 계정에 guardian + partner 등)
-- ---------------------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null
    check (role in ('guardian', 'senior', 'admin', 'partner')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- family_groups, family_members
-- ---------------------------------------------------------------------------
create table public.family_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_family_groups_updated_at
before update on public.family_groups
for each row execute function public.set_updated_at();

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.family_groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_role text not null
    check (member_role in ('guardian', 'senior')),
  relationship text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- care_recipients: 돌봄 대상(시니어 등)
-- ---------------------------------------------------------------------------
create table public.care_recipients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  family_group_id uuid not null references public.family_groups (id) on delete cascade,
  emergency_note text,
  primary_guardian_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_care_recipients_updated_at
before update on public.care_recipients
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- check_ins, medications, medication_logs
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  mood text not null,
  body_condition text not null,
  note text,
  source text not null
    check (source in ('self', 'guardian', 'ai_call', 'partner')),
  created_at timestamptz not null default now()
);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  name text not null,
  dosage text not null,
  schedule_rule jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_medications_updated_at
before update on public.medications
for each row execute function public.set_updated_at();

create table public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  care_recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  taken_at timestamptz not null,
  status text not null
    check (status in ('taken', 'missed', 'skipped')),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- location: 동의 스냅샷 + PostGIS ping
-- ---------------------------------------------------------------------------
create table public.location_consents (
  id uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  is_granted boolean not null,
  version text not null,
  label text,
  recorded_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.location_pings (
  id uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  location geography (point, 4326) not null,
  accuracy_meters numeric,
  consent_snapshot_id uuid not null references public.location_consents (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- alerts, care_tasks, subscriptions, audit_logs
-- ---------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  type text not null,
  severity text not null
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null
    check (status in ('open', 'acknowledged', 'resolved')),
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  assigned_partner_id uuid references public.profiles (id) on delete set null,
  task_type text not null,
  status text not null
    check (status in (
      'requested', 'assigned', 'in_progress', 'completed', 'cancelled'
    )),
  scheduled_at timestamptz,
  completed_at timestamptz,
  report text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_care_tasks_updated_at
before update on public.care_tasks
for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles (id) on delete restrict,
  family_group_id uuid not null references public.family_groups (id) on delete cascade,
  plan text not null
    check (plan in ('basic', 'care', 'premium')),
  status text not null
    check (status in ('active', 'inactive', 'canceled', 'past_due')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- -- 인덱스 (MVP 조회·정렬)
create index if not exists idx_user_roles_user on public.user_roles (user_id);
create index if not exists idx_user_roles_user_role on public.user_roles (user_id, role);

create index if not exists idx_family_members_group on public.family_members (family_group_id);
create index if not exists idx_family_members_profile on public.family_members (profile_id);
create index if not exists idx_family_groups_created_by on public.family_groups (created_by);

create index if not exists idx_care_recipients_group on public.care_recipients (family_group_id);
create index if not exists idx_care_recipients_profile on public.care_recipients (profile_id);
create index if not exists idx_care_recipients_primary on public.care_recipients (primary_guardian_id);

create index if not exists idx_check_ins_recipient_time
  on public.check_ins (care_recipient_id, created_at desc);

create index if not exists idx_medications_recipient on public.medications (care_recipient_id) where is_active;
create index if not exists idx_medication_logs_recipient_taken
  on public.medication_logs (care_recipient_id, taken_at desc);
create index if not exists idx_medication_logs_medication on public.medication_logs (medication_id);

create index if not exists idx_location_consents_recipient on public.location_consents (care_recipient_id);
create index if not exists idx_location_pings_recipient_time
  on public.location_pings (care_recipient_id, created_at desc);
create index if not exists location_pings_location_gix
  on public.location_pings using gist (location);

create index if not exists idx_alerts_recipient_status_time
  on public.alerts (care_recipient_id, status, created_at desc);
create index if not exists idx_alerts_recipient on public.alerts (care_recipient_id);

create index if not exists idx_care_tasks_partner_status
  on public.care_tasks (assigned_partner_id, status) where assigned_partner_id is not null;
create index if not exists idx_care_tasks_recipient on public.care_tasks (care_recipient_id);
create index if not exists idx_care_tasks_status on public.care_tasks (status);

create index if not exists idx_subscriptions_group on public.subscriptions (family_group_id);
create index if not exists idx_subscriptions_guardian on public.subscriptions (guardian_id);

create index if not exists idx_audit_logs_entity on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists idx_audit_logs_actor on public.audit_logs (actor_id, created_at desc);

-- -- RLS: 활성화만 (정책은 별도 마이그레이션)
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.family_groups enable row level security;
alter table public.family_members enable row level security;
alter table public.care_recipients enable row level security;
alter table public.check_ins enable row level security;
alter table public.medications enable row level security;
alter table public.medication_logs enable row level security;
alter table public.location_consents enable row level security;
alter table public.location_pings enable row level security;
alter table public.alerts enable row level security;
alter table public.care_tasks enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;

-- 주: RLS만 켜 두면 anon / authenticated 는 기본적으로 행이 보이지 않을 수 있음(정책 없음 = 거부). 다음 단계에서 정책·헬퍼 함수 추가.
