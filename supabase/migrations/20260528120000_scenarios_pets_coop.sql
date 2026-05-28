-- ─────────────────────────────────────────────────────────────────────────────
-- 시나리오 / 펫 / 협동 멀티플레이어 확장.
--
-- scenarios:        시나리오 메타 (서버 권위 + admin 관리). 클라이언트 registry.ts
--                   와 sync 되지만, 잠금/베타 토글은 서버 기준이 마지막 권위.
-- user_progress:    사용자별 시나리오 단계 진행 + 점수 + 완료 시간.
-- pets:             사용자가 키우는 가상 반려견 상태 (1유저 1펫부터).
-- pet_interactions: 펫과의 상호작용 로그 (먹이/놀기/쓰다듬기).
-- coop_pairs:       두 명이 짝을 이룬 협동 세션. presence 는 supabase realtime 으로
--                   처리하고, DB 는 페어 시작/끝 + 공유 스코어만 보관.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── scenarios ────────────────────────────────────────────────────────────────
create table if not exists public.scenarios (
  id              text primary key,                       -- ScenarioId 와 매칭
  category        text not null check (category in ('game','edu')),
  title           text not null,
  status          text not null default 'beta'
                  check (status in ('ready','beta','locked','disabled')),
  required_level  integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into public.scenarios (id, category, title, status, required_level) values
  ('walk_monster','game','산책 몬스터','beta',1),
  ('fishing','game','AR 낚시','beta',2),
  ('pet','game','AR 반려견','beta',1),
  ('coop','game','친구와 합체','beta',5),
  ('kiosk_order','edu','키오스크 주문 실습','beta',1),
  ('coffee_making','edu','커피 만들기','beta',1),
  ('excavator_basics','edu','포크레인 기본 조작','beta',1)
on conflict (id) do update set
  category=excluded.category,
  title=excluded.title,
  status=excluded.status,
  required_level=excluded.required_level,
  updated_at=now();

alter table public.scenarios enable row level security;
create policy "scenarios_read_all" on public.scenarios for select using (true);

-- ── user_progress ────────────────────────────────────────────────────────────
create table if not exists public.user_progress (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  scenario_id     text not null references public.scenarios(id) on delete cascade,
  step_key        text not null,                  -- e.g. 'select_menu', 'grind'
  score           integer,                        -- 단계별 점수 (optional)
  completed_at    timestamptz not null default now(),
  unique (user_id, scenario_id, step_key)
);

create index if not exists user_progress_user_scenario_idx
  on public.user_progress(user_id, scenario_id);

alter table public.user_progress enable row level security;
create policy "user_progress_own" on public.user_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── pets ─────────────────────────────────────────────────────────────────────
create table if not exists public.pets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null default '댕댕이',
  species         text not null default 'puppy',
  level           integer not null default 1,
  exp             integer not null default 0,
  affinity        integer not null default 50,    -- 0-100 친밀도
  mood            text not null default 'happy'
                  check (mood in ('happy','hungry','sleepy','playful','sad')),
  hunger          integer not null default 50,    -- 0-100 (높을수록 배고픔)
  last_interaction_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pets_user_idx on public.pets(user_id);

alter table public.pets enable row level security;
create policy "pets_own" on public.pets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── pet_interactions ─────────────────────────────────────────────────────────
create table if not exists public.pet_interactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  pet_id      uuid not null references public.pets(id) on delete cascade,
  action      text not null
              check (action in ('pet','feed','play','train')),
  exp_gained  integer not null default 0,
  delta_affinity  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists pet_interactions_pet_idx
  on public.pet_interactions(pet_id, created_at desc);

alter table public.pet_interactions enable row level security;
create policy "pet_interactions_own" on public.pet_interactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── coop_pairs ───────────────────────────────────────────────────────────────
create table if not exists public.coop_pairs (
  id              uuid primary key default gen_random_uuid(),
  -- pair_code: 6자 영문/숫자. 한쪽이 만들고 상대에게 알려주면 join.
  pair_code       text not null unique,
  host_user_id    uuid not null references auth.users(id) on delete cascade,
  guest_user_id   uuid references auth.users(id) on delete set null,
  status          text not null default 'waiting'
                  check (status in ('waiting','active','ended','expired')),
  shared_catches  integer not null default 0,
  shared_score    integer not null default 0,
  created_at      timestamptz not null default now(),
  joined_at       timestamptz,
  ended_at        timestamptz
);

create index if not exists coop_pairs_status_idx
  on public.coop_pairs(status, created_at desc);

alter table public.coop_pairs enable row level security;
-- 본인이 host 거나 guest 면 select. 아무나 pair_code 로 join 시도는 가능 (서버 fn 에서 verify).
create policy "coop_pairs_select_party" on public.coop_pairs
  for select using (auth.uid() = host_user_id or auth.uid() = guest_user_id);
create policy "coop_pairs_insert_host" on public.coop_pairs
  for insert with check (auth.uid() = host_user_id);
create policy "coop_pairs_update_party" on public.coop_pairs
  for update using (auth.uid() = host_user_id or auth.uid() = guest_user_id);
