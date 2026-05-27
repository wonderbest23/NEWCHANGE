-- ─────────────────────────────────────────────────────────────────────────────
-- 안부전화 idempotency 보강
--
-- call_sessions.post_processed_at:
--   Twilio status webhook이 동일 terminal 이벤트(`completed`/`no_answer`/`busy`/
--   `failed`) 를 여러 번 재시도하더라도 extraction / rule engine / no-answer
--   fallback 이 정확히 1회만 실행되도록 하는 "처리 완료" 마커.
--
--   동시 콜백 race-free 패턴:
--     UPDATE call_sessions
--        SET post_processed_at = now()
--      WHERE id = $1 AND post_processed_at IS NULL
--   RETURNING id;
--
--   row 가 반환된 webhook 만 후처리를 실행 (단일 winner).
--
-- 참조: docs/schema/005_checkin_call_idempotency.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.call_sessions
  add column if not exists post_processed_at timestamptz;

create index if not exists call_sessions_post_processed_idx
  on public.call_sessions(post_processed_at)
  where post_processed_at is null;

comment on column public.call_sessions.post_processed_at is
  'Twilio status webhook 후처리(extraction/rules/fallback) 완료 시각. NULL이면 아직 미처리.';
