-- ─────────────────────────────────────────────────────────────────────────────
-- Asset Forge — AI 기반 3D 모델 (GLB) 자동 생성 파이프라인.
--
-- 흐름:
--  1) admin 이 prompt + kind 입력 → generated_assets insert (status='queued')
--  2) Tripo3D API 호출 → tripo_task_id 보관 → status='running'
--  3) 주기적 polling (cron /api/internal/asset-forge/poll) → status 동기화
--  4) success 시 Tripo 가 준 GLB URL 을 Supabase Storage 로 미러링 → glb_url 저장
--  5) 시나리오는 useGeneratedModel(kind) 로 active=true 인 최신 모델 로드
--
-- 보안:
--  - RLS: select 는 모두 허용 (3D 모델은 클라가 GET 으로 받음)
--  - insert/update/delete 는 admin 만 (created_by IS auth.uid())
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.generated_assets (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in (
                      'kiosk','coffee_machine','excavator',
                      'pet','fish','monster','generic'
                    )),
  scenario_id       text references public.scenarios(id) on delete set null,
  prompt            text not null,
  status            text not null default 'queued' check (status in (
                      'queued','running','success','failed','expired'
                    )),
  tripo_task_id     text,
  -- 외부(트라이포) URL — 만료될 수 있음. 미러링 전 임시 보관.
  external_glb_url  text,
  external_preview_url text,
  -- 자체 Storage 미러 URL (영구 사용)
  glb_url           text,
  preview_url       text,
  poly_count        integer,
  file_size_bytes   integer,
  active            boolean not null default true,
  error_message     text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists generated_assets_kind_active_idx
  on public.generated_assets(kind, active, status, created_at desc);
create index if not exists generated_assets_running_idx
  on public.generated_assets(status)
  where status in ('queued','running');

alter table public.generated_assets enable row level security;

-- 누구나 success 인 자산 select 가능 (시나리오에서 모델 로드)
create policy "assets_select_success" on public.generated_assets
  for select using (status = 'success' or auth.uid() = created_by);

-- insert/update/delete 는 본인이 만든 행만. admin 권한 체크는 server fn 에서.
create policy "assets_insert_own" on public.generated_assets
  for insert with check (auth.uid() = created_by);
create policy "assets_update_own" on public.generated_assets
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "assets_delete_own" on public.generated_assets
  for delete using (auth.uid() = created_by);

-- Storage 버킷 (별도): asset-forge. SUPABASE 마이그레이션 SQL 로는 만들 수 없고
-- Dashboard 에서 "Public bucket" 으로 미리 생성해야 함.
-- 안내: Storage > New bucket > name=asset-forge, Public=ON
