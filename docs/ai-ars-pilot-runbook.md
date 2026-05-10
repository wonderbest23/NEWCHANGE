# AI ARS 파일럿 실행 Runbook

> 🚨 이 문서는 **실제 부모님 번호로 첫 안부 전화 1건을 안전하게 발신**하기 위한
> 단계별 점검표입니다.
> cron 자동화는 본 Runbook의 마지막 단계이며, 그 전까지는 모든 발신을
> **수동 1건씩만** 트리거합니다.

관련 문서:
- `docs/ai-ars-cron-setup.md` — cron 등록 SQL
- `docs/ai-ars-pilot-qa-checklist.md` — 통화별 QA 체크리스트
- `docs/ai-ars-korea-operation-risks.md` — 한국 운영 리스크

---

## 0. ⚠️ 절대 확인 (READ ME FIRST)

- 한국 발신번호 표시가 “070” / 해외번호 / 무표시이면 부모님이 전화를
  **스팸으로 인식하고 받지 않을 가능성이 매우 높습니다.**
  → 첫 통화 전에 발신번호가 부모님 단말에 어떻게 보이는지를 **반드시 사전 통화**로 확인.
- 부모님과 보호자에게 “오늘 ○시쯤 안부 확인 전화가 한 번 갈 수 있다”고
  **반드시 사전에 안내**한 뒤에만 발신할 것.
- 운영자 본인 번호 또는 사내 테스트 번호로 **먼저 1건** 발신 → 통화/녹취/추출이
  정상으로 동작하는 것을 확인한 뒤에만 실제 부모님 번호로 발신.
- 자동 cron(`call-jobs/run`)을 켜기 전에는 반드시 **수동 1건만** 테스트.
  cron 실수 1번이 실제 부모님께 반복 전화로 이어집니다.
- SMS fallback 은 **보조 수단**입니다. 고령 사용자는 문자 알림을 못 보거나
  답장 형식을 헷갈릴 수 있다는 전제로 운영하세요.
- 통화 transcript / 녹취는 개인정보입니다. **녹취/전사 보관 정책이 확정되기
  전에는 장기 보관(>30일) 금지**. 단기 디버깅 목적으로만 사용.

---

## 1. 테스트 전 환경 변수 확인

Lovable secret에 등록되어 있어야 하는 값:

| 키 | 용도 | 비고 |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio 계정 식별자 | 필수 |
| `TWILIO_AUTH_TOKEN` | Twilio 인증 토큰 | 필수 |
| `TWILIO_FROM_NUMBER` | 발신용 E.164 번호 | 한국 표시 확인 필수 |
| `OPENAI_API_KEY` | OpenAI Realtime 인증 | 필수 |
| `OPENAI_PROJECT_ID` | OpenAI 프로젝트 식별자 | 코드에서 참조 |
| `OPENAI_WEBHOOK_SECRET` | OpenAI webhook 서명 검증 | 필수 |
| `OPENAI_REALTIME_SIP_URI` | (있을 경우) SIP URI 오버라이드 | 선택 |
| `PUBLIC_BASE_URL` | Twilio/OpenAI webhook이 콜백할 base URL | 예: `https://together-care-app.lovable.app` |
| `INTERNAL_CRON_SECRET` | 내부 cron/수동 호출 인증 | 필수 |
| `RECORDING_RETENTION_DAYS` | 녹취 보관 일수 | 선택, 기본값 사용 |

> ❗ `SMS_FALLBACK_ENABLED` 같은 별도 토글은 **현재 코드에 없습니다.**
> SMS fallback 의 on/off 는 “`notifications/dispatch` cron 을 켰는지 여부”로 통제합니다.

확인 방법:
- Lovable Cloud → Connectors → Secrets 화면에서 위 키가 모두 존재하는지 눈으로 확인
- `PUBLIC_BASE_URL` 은 실제 발신/녹음 webhook이 다 콜백 가능한 URL인지 브라우저로 직접 열어볼 것

---

## 2. 테스트 대상 사전 확인

테스트할 “부모님 = `care_recipient`” 1명을 정해 두고 다음을 확인합니다.

```sql
select
  cr.id,
  cr.display_name,
  cr.phone_e164,
  cr.timezone,
  cr.call_window_start,
  cr.call_window_end,
  cr.do_not_disturb,
  cr.status,
  f.id as family_id
from public.care_recipients cr
join public.families f on f.id = cr.family_id
where cr.id = '<RECIPIENT_ID>';
```

체크:
- [ ] `phone_e164` 가 **+82** 로 시작하고 “0” 빠진 형태 (예: `+821012345678`)
- [ ] `status = 'active'`
- [ ] `do_not_disturb = false`
- [ ] 현재 시각이 `call_window_start` ~ `call_window_end` 안 (timezone 기준)
- [ ] 보호자 계정이 같은 `family_id` 에 속해 있음

```sql
select user_id, role
from public.family_members
where family_id = '<FAMILY_ID>';
```

음성 동의 (있는 경우):

```sql
select * from public.voice_consents
where care_recipient_id = '<RECIPIENT_ID>'
order by created_at desc
limit 5;
```

> 동의 정책이 미정이면 **운영 전에는 보호자 구두 동의 + 부모님 사전 통화**로
> 1건 테스트만 진행하고, 운영 출시 전까지 정책을 문서화하세요.

---

## 3. 발신 직전 DB 스냅샷

이상한 잔여 데이터가 없는지 확인합니다.

```sql
-- 최근 outbound 잡
select id, status, reason, retry_count, scheduled_at, window_start, window_end, last_error
from public.outbound_call_jobs
where care_recipient_id = '<RECIPIENT_ID>'
order by created_at desc
limit 10;

-- 최근 통화 세션
select id, status, end_reason, started_at, ended_at, openai_session_id
from public.call_sessions
where care_recipient_id = '<RECIPIENT_ID>'
order by started_at desc
limit 5;

-- 대기중 알림 outbox
select id, channel, status, template, created_at
from public.notification_outbox
where status in ('queued','sending','failed')
order by created_at desc
limit 20;

-- 열린 anomaly_alerts
select id, rule_code, severity, status, created_at
from public.anomaly_alerts
where care_recipient_id = '<RECIPIENT_ID>' and status = 'open'
order by created_at desc;
```

확인:
- [ ] 진행 중인 (`queued` / `dialing`) 잡이 없음 — 있으면 중복 발신 위험
- [ ] `notification_outbox` 에 오래된 `queued` 가 쌓여있지 않음
- [ ] 진행중 통화 세션 (`in_progress`) 가 남아있지 않음

---

## 4. 수동 즉시 발신 테스트 — 3가지 진입 경로

### 4-A. (권장) GuardianDashboard “지금 전화” 버튼

1. 보호자 계정으로 로그인.
2. `/guardian/dashboard` 진입.
3. “지금 전화” 버튼이 **활성화되어 있는지** 확인.
   - 비활성이면: call_window 밖이거나 do_not_disturb. 위 2번 항목 재확인.
4. 클릭 → 토스트 / 화면 메시지 확인.
5. 즉시 4번 섹션의 SQL로 `outbound_call_jobs.status` 추적.

### 4-B. DB에 queued row 직접 인서트 (운영자 콘솔)

```sql
insert into public.outbound_call_jobs (
  care_recipient_id, scheduled_at, window_start, window_end, status, reason
) values (
  '<RECIPIENT_ID>',
  now(),
  now(),
  now() + interval '30 minutes',
  'queued',
  'manual'
)
returning id;
```

### 4-C. `/api/internal/call-jobs/run` 수동 호출

cron 을 아직 켜지 않은 상태에서, queued 잡 1건을 즉시 처리:

```bash
curl -X POST "$PUBLIC_BASE_URL/api/internal/call-jobs/run" \
  -H "Authorization: Bearer $INTERNAL_CRON_SECRET"
```

> 실제 발신이 일어나는 단계입니다. **반드시 4-A 또는 4-B로 잡 1건만** 만들어둔 상태에서 호출하세요.

---

## 5. 통화 성공 시 검증 순서

발신 직후 ~ 통화 종료 후 5분 내 다음을 순서대로 확인합니다.

| # | 어디서 | 무엇을 | 정상 값 |
|---|---|---|---|
| 1 | `outbound_call_jobs` | 해당 잡 status | `dialing` → `completed` |
| 2 | `call_sessions` | 새 행 | `status='in_progress'` → `completed`, `started_at` / `ended_at` 채워짐 |
| 3 | `call_sessions.openai_session_id` | OpenAI session id 채워짐 | non-null |
| 4 | `call_sessions.end_reason` | 통화 종료 사유 | `completed` / `hangup` 등 lifecycle 값 |
| 5 | `call_turns` | 발화 N개 | role=`assistant`/`user` 교차로 누적 |
| 6 | `extracted_check_results` | 오늘 axis별 row | meal/medication/symptom/mood/sleep/help 중 응답한 항목 |
| 7 | `daily_log` | 오늘 행 | upsert 결과 반영 |
| 8 | `symptoms_log` | (증상 있는 경우) | 새 증상 행 |
| 9 | `anomaly_alerts` | (룰 매칭 시) | 새 `open` 알림 |
| 10 | `/guardian/dashboard` | UI | 가장 최근 통화 카드와 결과 타일 갱신 |
| 11 | `/guardian/alerts` | UI | open 알림 카운트 = 9번과 일치 |

**SQL 묶음:**

```sql
-- 1, 4
select id, status, end_reason, started_at, ended_at, openai_session_id
from public.call_sessions
where care_recipient_id = '<RECIPIENT_ID>'
order by started_at desc limit 1;

-- 5
select role, content, created_at
from public.call_turns
where session_id = '<SESSION_ID>'
order by created_at;

-- 6
select axis, value, created_at
from public.extracted_check_results
where care_recipient_id = '<RECIPIENT_ID>'
  and created_at::date = current_date
order by created_at desc;

-- 7
select * from public.daily_log
where care_recipient_id = '<RECIPIENT_ID>'
  and log_date = current_date;

-- 9
select id, rule_code, severity, status, evidence
from public.anomaly_alerts
where care_recipient_id = '<RECIPIENT_ID>' and status = 'open';
```

---

## 6. 미응답 / SMS fallback 검증 순서

부모님이 전화를 받지 않는 시나리오를 의도적으로 테스트할 때 (예: 발신 후 응답 안 함):

| # | 확인 포인트 | 정상 값 |
|---|---|---|
| 1 | `call_sessions.end_reason` | `no_answer` / `busy` / `failed` 중 하나 |
| 2 | `outbound_call_jobs` (원본) | `status='completed'` 또는 `failed`, `retry_count` 증가 가능 |
| 3 | `outbound_call_jobs` (retry) | `reason='retry'` 인 새 잡, ~30분 뒤 `scheduled_at` |
| 4 | retry 도 실패하면 `notification_outbox` | `channel='sms'`, `template='parent_call_fallback_v1'`, `status='queued'` |
| 5 | `/api/internal/notifications/dispatch` 수동 호출 | `status='sent'` 로 전환 |
| 6 | 부모님 단말 | 짧은 안내 SMS 수신 |
| 7 | 부모님이 “1” / “2” / “3” / “4” 회신 → `/api/public/sms.inbound` 도달 | 200 응답 |
| 8 | `extracted_check_results` | `axis='sms_reply'` row 생성 |
| 9 | (필요 시) `anomaly_alerts` | help/symptom 응답이면 새 알림 |

`notifications/dispatch` 수동 호출:

```bash
curl -X POST "$PUBLIC_BASE_URL/api/internal/notifications/dispatch" \
  -H "Authorization: Bearer $INTERNAL_CRON_SECRET"
```

멱등성 확인:
- 같은 명령을 한 번 더 호출했을 때 이미 `sent` 인 건은 다시 발송되지 않아야 함.
- 같은 session 에 대해 SMS fallback 이 두 번 enqueue 되지 않아야 함.

---

## 7. 실패 원인별 빠른 체크

| 증상 | 1차 확인 | 2차 확인 |
|---|---|---|
| Twilio 가 `/api/public/twilio.twiml.$jobId` 를 안 부른다 | `outbound_call_jobs.last_error`, Twilio 콘솔의 call log | `PUBLIC_BASE_URL` 이 외부에서 접근 가능한지, `TWILIO_FROM_NUMBER` 가 활성인지 |
| Twilio call 은 만들어졌지만 OpenAI session webhook (`/api/public/openai.session`) 이 안 온다 | `call_sessions.openai_session_id` null 여부 | OpenAI realtime SIP 설정 / `OPENAI_WEBHOOK_SECRET` 일치 |
| SIP header (`X-...`) 가 안 넘어와 jobId 매칭 실패 | `call_sessions` 행 자체가 없음 | TwiML `<Dial><Sip>` 헤더 부분 / Twilio 측 SIP 설정 |
| OpenAI `/api/public/openai.tool` 호출이 안 옴 | `call_turns` 가 0건 | OpenAI 측 tool 설정, 모델/세션 설정 |
| `call_turns` 는 쌓이는데 `extracted_check_results` 가 비어있음 | `/api/internal/extraction/run` 수동 호출 결과 | extraction.server 로그, axis 매칭 정규식 |
| extraction 은 됐는데 `anomaly_alerts` 가 안 생김 | `/api/internal/rules/run` 수동 호출 | rule-engine.server 로그, 룰 임계치 |
| SMS 가 안 나감 | `notification_outbox` 의 `status` / `last_error` | `/api/internal/notifications/dispatch` 수동 호출, Twilio Messaging 활성 여부 |
| 보호자 Dashboard 에 결과가 안 보임 | `getGuardianHome` 쿼리가 같은 family_id 보고 있는지 | RLS / `family_members` 매핑, 새로고침 |

수동 호출용 엔드포인트 정리:
- `POST /api/internal/call-jobs/run`
- `POST /api/internal/extraction/run`
- `POST /api/internal/rules/run`
- `POST /api/internal/notifications/dispatch`

모두 `Authorization: Bearer $INTERNAL_CRON_SECRET` 헤더 필요.

---

## 8. cron 활성화 전 체크리스트

cron 자동화는 “수동 1건이 끝까지 성공한 뒤에만” 켭니다. 권장 순서:

1. **수동 1건 통화 성공 확인** (5번 섹션 모두 통과)
2. `extraction/run` cron 켜기 — 가장 안전, 발신 없음
3. `rules/run` cron 켜기 — anomaly 오발동 여부 1~2일 모니터링
   - 특히 R001 “48h 무응답” 룰은 신규 가족 등록 직후 잘못 매칭될 수 있음
4. `notifications/dispatch` cron 켜기 — outbox 멱등성 확인 후
5. **마지막에** `call-jobs/run` cron 켜기 — 자동 발신이 시작되는 단계

- [ ] 운영/스테이징/개발 cron `jobname` 이 분리되어 있다 (예: `ai-ars-call-jobs-run-prod`)
- [ ] 일일 발신 상한(예: recipient당 1~2회)이 코드/DB 어딘가에서 보장된다
  - 미보장 상태에서 cron 활성화 금지
- [ ] cron 등록 후 첫 24시간은 매시간 `cron.job_run_details` 와 `outbound_call_jobs` 를 사람 눈으로 확인

세부 SQL 은 `docs/ai-ars-cron-setup.md` 참고.

---

## 9. 통화 후 정리

- [ ] 1건 테스트가 끝나면 `outbound_call_jobs` 의 잔여 queued 가 없는지 다시 확인
- [ ] `call_turns` / 녹취 파일은 디버깅이 끝나는 즉시 보관 정책에 맞춰 정리
- [ ] 보호자/부모님께 “테스트 통화였다”고 사후 안내
- [ ] 발견된 이슈는 `docs/ai-ars-pilot-qa-checklist.md` 에 기록
