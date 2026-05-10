# AI ARS — Cron / Worker 운영 가이드

> ⚠️ 이 문서는 **운영자가 수동으로 적용**해야 합니다.
> 자동 마이그레이션으로 등록하지 않습니다 — `INTERNAL_CRON_SECRET` 과 `PUBLIC_BASE_URL` 이
> 운영/스테이징/개발 환경마다 다르고, 잘못된 환경에 cron 이 실수로 발신을 트리거하면
> 실제 부모님께 전화가 가기 때문입니다.

## 1. 사전 점검

운영 적용 전 다음을 반드시 확인:

- [ ] `INTERNAL_CRON_SECRET` Lovable secret에 등록됨
- [ ] `PUBLIC_BASE_URL` 등록됨 (예: `https://together-care-app.lovable.app`)
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` 등록됨
- [ ] `outbound_call_jobs` 테이블에 적어도 한 건 테스트용 row 가 들어가 있음
- [ ] `pg_cron`, `pg_net` extension 활성화됨

`pg_cron`, `pg_net` 확인:

```sql
select extname from pg_extension where extname in ('pg_cron','pg_net');
```

없으면:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

## 2. 5분 주기 발신 워커 등록

`PUBLIC_BASE_URL` 과 `INTERNAL_CRON_SECRET` 부분을 실제 값으로 바꾼 뒤 한 번만 실행:

```sql
select cron.schedule(
  'ai-ars-call-jobs-run',
  '*/5 * * * *',  -- 5분마다
  $$
  select net.http_post(
    url := 'https://together-care-app.lovable.app/api/internal/call-jobs/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'PUT_INTERNAL_CRON_SECRET_HERE'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) as request_id;
  $$
);
```

> 라우트 핸들러는 body 를 읽지 않습니다 — `'{}'` 그대로 둡니다.
> `x-internal-secret` 헤더가 일치하지 않으면 401.

## 3. 운영 점검 쿼리

등록된 job 확인:

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'ai-ars-call-jobs-run';
```

최근 실행 결과:

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'ai-ars-call-jobs-run')
order by start_time desc
limit 20;
```

발신 워커가 실제로 처리한 job 확인:

```sql
select id, status, reason, scheduled_at, updated_at
from public.outbound_call_jobs
order by updated_at desc
limit 20;
```

## 4. 일시 중지 / 해제

```sql
-- 비활성화
update cron.job set active = false where jobname = 'ai-ars-call-jobs-run';

-- 재활성화
update cron.job set active = true where jobname = 'ai-ars-call-jobs-run';

-- 완전 제거
select cron.unschedule('ai-ars-call-jobs-run');
```

## 5. 발신 워커 동작 요약

`POST /api/internal/call-jobs/run`:

1. `x-internal-secret` 헤더 검증 (불일치 → 401)
2. `outbound_call_jobs` 에서 `status='queued'` 이고 `scheduled_at <= now()` 인 row를 최대 25개 조회
3. 각 job 마다:
   - `care_recipients` 확인 (`status=active`, `phone_e164` 존재, `do_not_disturb=false`)
   - 현재 시각이 `[call_window_start, call_window_end]` 안인지 확인 (timezone 적용)
   - Twilio Calls API 발신 (TwiML URL = `/api/public/twilio/twiml/{jobId}`)
4. 결과:
   - 성공 → `status='dialing'`
   - 실패 → `status='failed'`, `reason` 보강
   - DND → `status='cancelled'`, `reason+=';dnd'`
   - 윈도우 밖 → `queued` 유지 (다음 라운드에서 재평가)

---

## 6. 1분 또는 5분 주기 알림 디스패처 (`notifications/dispatch`)

**목적**: `notification_outbox` 의 `status='queued'` 행을 가져와 SMS(Twilio) 발송.
보호자 critical alert 알림과 부모님 미응답 fallback SMS 가 모두 이 큐를 통해 나갑니다.

**호출 URL**: `POST {PUBLIC_BASE_URL}/api/internal/notifications/dispatch`

**필요 헤더**:
- `Content-Type: application/json`
- `x-internal-secret: <INTERNAL_CRON_SECRET>`

**Body**: `{}` (라우트는 body 미사용)

**예시 SQL** (1분 주기, 운영자가 실제 값으로 치환 후 실행):

```sql
select cron.schedule(
  'ai-ars-notifications-dispatch',
  '* * * * *',  -- 1분마다 (트래픽 적으면 '*/5 * * * *' 권장)
  $$
  select net.http_post(
    url := 'https://together-care-app.lovable.app/api/internal/notifications/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'PUT_INTERNAL_CRON_SECRET_HERE'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) as request_id;
  $$
);
```

**일시 중지 / 재개 / 제거**:

```sql
update cron.job set active = false where jobname = 'ai-ars-notifications-dispatch';
update cron.job set active = true  where jobname = 'ai-ars-notifications-dispatch';
select cron.unschedule('ai-ars-notifications-dispatch');
```

**최근 실행 결과**:

```sql
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'ai-ars-notifications-dispatch')
order by start_time desc limit 20;
```

**실패 시 먼저 볼 곳**:
- `public.notification_outbox` 의 `status`, `attempt_count`, `last_error`
- `cron.job_run_details.return_message` (HTTP 401/500 여부)
- Twilio 콘솔의 Messaging logs (실제 발송 차단/실패)

**주의**:
- `notification_outbox` 는 RLS 가 `false` 라 사용자 토큰으로는 조회 불가. `psql` 또는 service role 로만 점검.
- `attempt_count` 가 누적 증가만 하므로 무한 재시도가 되지 않도록 dispatcher 코드의 max attempts 정책 확인.

---

## 7. 30분 주기 룰 엔진 (`rules/run`)

**목적**: 통화 종료 webhook 외에도 주기적으로 모든 활성 recipient 에 대해
`R001 (no_response_48h)`, `R002 (meal_unconfirmed_repeat)`, `R003 (medication_missed_repeat)`,
`R004 (high_risk_phrase)` 룰을 평가해 `anomaly_alerts` 를 생성합니다.

특히 R001 은 "통화가 안 옴 = webhook 자체가 안 옴" 이라 cron 없이는 절대 발생하지 않습니다.

**호출 URL**: `POST {PUBLIC_BASE_URL}/api/internal/rules/run`

**필요 헤더**:
- `Content-Type: application/json`
- `x-internal-secret: <INTERNAL_CRON_SECRET>`

**Body**: `{}` (전체 활성 recipient 평가). 단일 recipient 만 강제 평가하고 싶다면
운영자가 별도로 `{ "care_recipient_id": "..." }` 를 넣어 호출 (수동 점검용).

**예시 SQL** (30분 주기):

```sql
select cron.schedule(
  'ai-ars-rules-run',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://together-care-app.lovable.app/api/internal/rules/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'PUT_INTERNAL_CRON_SECRET_HERE'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);
```

**일시 중지 / 재개 / 제거**:

```sql
update cron.job set active = false where jobname = 'ai-ars-rules-run';
update cron.job set active = true  where jobname = 'ai-ars-rules-run';
select cron.unschedule('ai-ars-rules-run');
```

**최근 실행 결과**:

```sql
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'ai-ars-rules-run')
order by start_time desc limit 20;
```

**실패 시 먼저 볼 곳**:
- `public.anomaly_alerts` (created_at desc) — critical 이 갑자기 폭증하지 않는지
- `public.outbound_call_jobs` 와 `public.call_sessions` — R001 판정 근거 데이터가 실제로 있는지
- 룰 변경 후엔 `public.anomaly_rules` 의 `params` 와 `enabled` 도 같이 점검

---

## 8. (선택) extraction 수동 재처리 — `extraction/run`

**일반 운영에는 cron 등록 불필요.** 통화 종료 webhook 이 자동으로 extraction 을 호출합니다.
다음 경우에만 운영자가 수동으로 호출:
- 룰/추출 코드 변경 후 과거 세션을 다시 돌리고 싶을 때
- 특정 세션의 extracted 결과가 비어 있어 재처리가 필요할 때

**수동 호출 예시** (cron 등록 X, ad-hoc):

```bash
curl -X POST https://together-care-app.lovable.app/api/internal/extraction/run \
  -H 'Content-Type: application/json' \
  -H 'x-internal-secret: <INTERNAL_CRON_SECRET>' \
  -d '{"session_id":"..."}'
```

호출 후 확인:

```sql
select axis, value, recorded_for_date, created_at
from public.extracted_check_results
where session_id = '...'
order by created_at desc;
```

---

## 9. 권장 cron 구성 요약

| jobname                            | 주기            | 엔드포인트                                | 필수 여부              |
| ---------------------------------- | --------------- | ----------------------------------------- | ---------------------- |
| `ai-ars-call-jobs-run`             | `*/5 * * * *`   | `/api/internal/call-jobs/run`             | 필수 (발신)            |
| `ai-ars-notifications-dispatch`    | `*/1 * * * *`*  | `/api/internal/notifications/dispatch`    | 필수 (SMS)             |
| `ai-ars-rules-run`                 | `*/30 * * * *`  | `/api/internal/rules/run`                 | 필수 (R001 응답 없음)  |
| `ai-ars-extraction-run`            | (등록 X)        | `/api/internal/extraction/run`            | 수동 재처리용          |

\* 트래픽 적으면 `*/5 * * * *` 로 낮춰도 무방. critical 알림 SMS 지연이 1~5분 발생합니다.

## 10. 주의

- 이 cron 은 **실제 부모님께 전화/SMS 를 발신**합니다. 스테이징/운영 분리 필수.
- `PUBLIC_BASE_URL` 이 잘못 설정되면 Twilio 가 잘못된 TwiML URL 을 호출하여 hangup TwiML 이 응답됩니다.
- batch 크기(`BATCH_SIZE=25`)는 운영 트래픽에 맞게 코드 수정 필요.
- cron 등록 SQL 안의 `INTERNAL_CRON_SECRET` 값은 `cron.job.command` 에 평문으로 저장됩니다.
  운영자만 DB 에 직접 접근할 수 있어야 합니다.
- 운영 DB 와 스테이징 DB 의 cron 을 혼동하지 않도록 jobname 에 `-prod` / `-stg` suffix 권장.


---

## ⚠️ Cron 활성화 전 체크리스트

> 이 섹션은 `docs/ai-ars-pilot-runbook.md` 의 8번 항목과 짝을 이룹니다.
> **파일럿 통화 1건이 끝까지 성공하기 전에는 어떤 cron 도 등록하지 마세요.**

권장 활성화 순서:

1. ✅ 수동 1건 통화 성공 — Runbook 5번 모든 단계 통과
2. `extraction/run` cron — 발신 없음, 가장 안전
3. `rules/run` cron — anomaly 오발동 1~2일 모니터링
   - 특히 R001 (48h 무응답) 은 신규 가족에서 잘못 매칭될 수 있음
4. `notifications/dispatch` cron — outbox 멱등성 확인 후
5. **마지막에** `call-jobs/run` cron — 자동 발신 시작 단계

체크:
- [ ] 파일럿 1건 성공 전 cron 등록 금지
- [ ] `call-jobs/run` cron 은 가장 마지막에 켤 것
- [ ] `notifications/dispatch` cron 은 outbox 수동 dispatch 테스트 후 켤 것
- [ ] `rules/run` cron 은 R001 등 임계 룰 오발동 가능성을 확인 후 켤 것
- [ ] 운영 / 스테이징 jobname 분리 (`-prod`, `-stg`)
- [ ] recipient 당 일일 발신 상한이 코드/DB 어딘가에서 보장되기 전에는 운영 cron 금지
- [ ] cron 등록 후 첫 24시간은 매시간 `cron.job_run_details` 와 `outbound_call_jobs` 를 사람 눈으로 확인
