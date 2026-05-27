-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: AI 안부전화 idempotency / wrong_person / 운영 보강
--
--  - call_sessions.post_processed_at:
--      Twilio status webhook이 동일 terminal 이벤트를 여러 번 재시도하더라도
--      extraction / rule engine / no-answer fallback이 정확히 1회만 실행되도록
--      "처리 완료" 마커. 동시 콜백은 `update ... where post_processed_at is null
--      returning id` 패턴으로 단일 winner 결정.
--
--  - call_sessions.status check constraint:
--      'wrong_person' 은 이미 허용. 변경 없음 — 본 마이그레이션은 컬럼 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.call_sessions
  add column if not exists post_processed_at timestamptz;

create index if not exists call_sessions_post_processed_idx
  on public.call_sessions(post_processed_at)
  where post_processed_at is null;

comment on column public.call_sessions.post_processed_at is
  'Twilio status webhook 후처리(extraction/rules/fallback) 완료 시각. NULL이면 아직 미처리.';
