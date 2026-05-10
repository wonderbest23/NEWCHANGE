# AI ARS 파일럿 통화 QA 체크리스트

> 운영자가 실제 부모님 한 분께 처음 전화를 거는 파일럿 직전·직후에 체크하는 문서.
> 모든 항목은 **체크박스가 채워져야** 다음 단계로 갑니다.
> 의심되면 멈추고 보호자/엔지니어와 상의하세요.

---

## 1. 사전 준비 (환경/시크릿)

- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` 가 Lovable Cloud secrets 에 있음
- [ ] `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `OPENAI_WEBHOOK_SECRET` 가 있음
- [ ] `INTERNAL_CRON_SECRET` 가 있음
- [ ] `PUBLIC_BASE_URL` 이 **현재 배포 환경**과 일치 (예: `https://together-care-app.lovable.app`)
- [ ] Twilio 콘솔의 발신번호가 한국 수신 가능한 번호인지 확인
- [ ] Twilio Voice → "A call comes in" 이 우리 TwiML 라우트와 충돌하지 않게 비어있거나 의도된 값
- [ ] 테스트 `care_recipients.phone_e164` 가 E.164 (`+82...`) 형식
- [ ] 같은 recipient 의 `voice_consents.granted=true` (또는 파일럿 동의서 별도 보관)
- [ ] `care_recipients.call_window_start` ~ `call_window_end` 안에서 테스트 시각 진행
- [ ] `care_recipients.do_not_disturb = false`
- [ ] `care_recipients.status = 'active'`

---

## 2. 테스트 데이터 준비

- [ ] 테스트 보호자 계정 1개 (auth.users + family_members 에 `primary_guardian` 으로 매핑)
- [ ] 테스트 부모님 1명 (`care_recipients` 에 등록, 위 조건 만족)
- [ ] 보호자 본인 휴대폰 번호 일부도 `family_members.phone_e164` 에 들어가 있음 (critical SMS 받기 위해)

**옵션 A — 큐에 직접 row 삽입** (관리자/엔지니어):

```sql
insert into public.outbound_call_jobs
  (care_recipient_id, scheduled_at, window_start, window_end, status, reason)
values
  ('<RECIPIENT_UUID>',
   now(),
   now() - interval '5 minute',
   now() + interval '30 minute',
   'queued', 'pilot');
```

이후 cron(5분) 이 처리하거나, 즉시 한 번 호출:

```bash
curl -X POST https://together-care-app.lovable.app/api/internal/call-jobs/run \
  -H 'x-internal-secret: <INTERNAL_CRON_SECRET>' -H 'Content-Type: application/json' -d '{}'
```

**옵션 B — 보호자 대시보드의 "지금 전화" 버튼** (실 사용자 플로우):

- [ ] `/guardian/dashboard` 접속
- [ ] 통화 가능 시간 안 / DND off 인지 화면에서 확인
- [ ] "지금 전화" 클릭 → toast "안부 전화를 큐에 등록했어요" 확인
- [ ] `outbound_call_jobs` 에 새 `queued` row 가 생성됐는지 SQL 로 확인

---

## 3. 전화 성공 시나리오

순서대로 실행/관찰:

- [ ] cron 또는 수동 호출로 `call-jobs/run` 실행
- [ ] Twilio 콘솔 → Voice → Calls 에 새 outbound call 표시
- [ ] 부모님 휴대폰에서 실제 벨 울림 (3회 이상 reachability 테스트)
- [ ] 응답 후 AI 첫 인사 들림 (한국어, "안녕하세요 …")
- [ ] Twilio 가 `/api/public/twilio/twiml/{jobId}` 호출 → 200, TwiML 정상
- [ ] OpenAI Realtime session webhook (`/api/public/openai/session`) 도착
- [ ] tool webhook (`/api/public/openai/tool`) 에 `record_answer` 등 호출 도착
- [ ] `call_sessions` row 생성: `twilio_call_sid`, `openai_session_id` 둘 다 채워짐
- [ ] `call_turns` 가 `turn_index` 순으로 1개 이상 저장됨
- [ ] 통화 종료 후 Twilio status webhook (`/api/public/twilio/status`) 가 `completed` 로 도착
- [ ] `call_sessions.status='completed'`, `end_reason` 정상 (`completed_normal` 등)
- [ ] extraction 자동 실행 → `extracted_check_results` 에 axis 별 row 생성
- [ ] daily_log / symptoms_log 에 해당하는 행 생성 (식사·수면·기분/증상 발화가 있었다면)
- [ ] rule engine 실행 → high_risk 발화가 없었다면 새 alert 0건
- [ ] `/guardian/dashboard` 새로고침 → "AI 안부 통화" 섹션에 시각·종료사유·대화 일부 표시

```sql
-- 빠른 점검
select id, status, end_reason, started_at, ended_at, duration_sec
from public.call_sessions
where care_recipient_id = '<RECIPIENT_UUID>'
order by started_at desc nulls last limit 5;

select axis, value, recorded_for_date, created_at
from public.extracted_check_results
where care_recipient_id = '<RECIPIENT_UUID>'
order by created_at desc limit 20;
```

---

## 4. 전화 미응답 시나리오 (no-answer / busy / failed)

- [ ] 부모님 전화기를 꺼두거나 응답하지 않은 상태에서 `call-jobs/run` 실행
- [ ] Twilio status webhook 이 `no-answer` / `busy` / `failed` 로 도착
- [ ] `call_sessions.status` 가 동일하게 기록
- [ ] **30분 뒤 재시도 job** 이 자동 enqueue 되는지:

```sql
select id, parent_job_id, scheduled_at, status, reason, retry_count
from public.outbound_call_jobs
where care_recipient_id = '<RECIPIENT_UUID>'
order by created_at desc limit 5;
```

  - [ ] `parent_job_id` 가 원래 job 을 가리킴
  - [ ] `scheduled_at` 이 약 30분 후
  - [ ] `reason` 에 `retry` 포함

- [ ] 재시도도 실패하면 `notification_outbox` 에 부모님께 보낼 SMS 가 enqueue:

```sql
select id, channel, template_code, recipient, status, scheduled_at, last_error
from public.notification_outbox
order by created_at desc limit 10;
```

- [ ] dispatcher cron 실행 후 `status='sent'` 로 전이
- [ ] 부모님이 SMS 에 숫자(1/2/3/4)로 답장
- [ ] `/api/public/sms/inbound` 가 200 응답
- [ ] `extracted_check_results` 에 `axis='sms_reply'` row 생성
- [ ] dashboard "통화 보조 진행 상황" 패널이 표시됨

---

## 5. 이상징후 시나리오

운영자가 본인 번호로 테스트해서 의도된 발화를 합니다.

- [ ] 발화 예시: "숨이 좀 차요" / "가슴이 쿡쿡 아파" / "어제 넘어졌어"
- [ ] 통화 정상 종료
- [ ] `symptoms_log` 에 row 생성, `severity='high'`, `category` 가 `breath`/`chest_pain`/`fall` 중 하나
- [ ] `anomaly_alerts` 에 `rule_code='R004'`, `severity='critical'`, `status='open'` 새 row
- [ ] `notification_outbox` 에 보호자(primary_guardian) 대상 critical SMS enqueue
- [ ] dispatcher cron 실행 후 보호자 휴대폰으로 실제 SMS 도착
- [ ] `/guardian/alerts` 진입 → critical 카드가 가장 위에 표시
- [ ] 같은 룰로 중복 enqueue 안 되는지 (idempotency) — 한 번 더 통화/룰 실행해서 SMS 가 중복 발송되지 않는지 확인

---

## 6. 권한 / RLS 시나리오

- [ ] 보호자 A 로 로그인 → `/guardian/alerts` 에 다른 가족(B)의 alert 가 안 보이는지
- [ ] 보호자 A 가 다른 가족 alert UUID 로 직접 `acknowledgeAlert({ alertId })` 호출 시
      `alert_not_found_or_forbidden` 반환되는지
- [ ] `notification_outbox` 를 사용자 토큰으로 `select` 시도 → 0건 (RLS `false`)
- [ ] `anomaly_alerts.update` 를 사용자 토큰으로 직접 시도 → 거부 (RLS 에 UPDATE 정책 없음)
- [ ] 보호자 본인의 alert 는 "확인했어요" / "해결했어요" 정상 동작

---

## 7. 실패 시 먼저 볼 테이블 / 로그

| 증상                                | 먼저 볼 곳                                          |
| ----------------------------------- | --------------------------------------------------- |
| 전화가 아예 안 감                   | `outbound_call_jobs.status`, `cron.job_run_details` |
| Twilio 는 발신했는데 hangup         | `PUBLIC_BASE_URL` 환경변수, TwiML 라우트 로그       |
| 통화는 됐는데 대화가 저장 안 됨     | `call_sessions`, `call_turns`, OpenAI tool webhook 로그 |
| 통화는 됐는데 axis 결과 비어 있음   | `extracted_check_results`, extraction 라우트 로그   |
| critical 발화에 alert 안 뜸         | `symptoms_log`, `anomaly_alerts`, rules 로그        |
| 보호자에게 SMS 안 옴                | `notification_outbox.status / last_error`, Twilio Messaging logs |
| 부모님 SMS 답장이 반영 안 됨        | `extracted_check_results` (axis=sms_reply)          |
| dashboard 에 안 보임                | 보호자 권한(family_members), recipient family_id 매핑 |
| alert 액션 후 변화 없음             | `guardian_actions` 인서트 여부, `anomaly_alerts.status` |

---

## 8. 성공 기준 (파일럿 통과 조건)

다음을 모두 만족하면 한 명에 대한 파일럿이 성공한 것으로 봅니다:

- [ ] **실제 전화 1건이 끝까지 완료** (response → AI 인사 → Q&A → 정상 종료)
- [ ] `call_turns` 에 user/ai turn 이 **각각 2개 이상** 저장
- [ ] `extracted_check_results` 에 의미 있는 axis 1개 이상 (예: meal=eaten)
- [ ] `/guardian/dashboard` 에 오늘 결과가 사람이 봐도 이해되는 형태로 표시
- [ ] high-risk 테스트 통화 1건 → `/guardian/alerts` critical 표시 + 보호자 SMS 1건 도착
- [ ] 미응답 테스트 1건 → 30분 retry 1건 enqueue + retry 실패 시 부모님 SMS 1건 도착
- [ ] 권한 없는 보호자가 다른 가족 데이터를 못 본다는 것 1회 이상 검증

---

## 9. 파일럿 직후 체크 (24시간 이내)

- [ ] R001 (no_response_48h) 가 잘못 발화되지 않는지 — 정상 통화 후 24h 내 critical 이 뜨면 안 됨
- [ ] cron 누락 (`cron.job_run_details.status != 'succeeded'`) 발생 빈도
- [ ] Twilio 비용/Messaging 비용 대시보드
- [ ] 보호자 피드백: "메시지가 진단처럼 들리지 않았는지", "전화 톤이 너무 빠르지 않았는지"
- [ ] 부모님 피드백: "벨소리 후 안내가 자연스러웠는지", "끊고 싶을 때 끊을 수 있었는지"
