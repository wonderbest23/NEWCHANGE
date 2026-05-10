# Care Call — 인수인계(Cursor 이어개발)

> **문서 상태**: 본 문서는 *구현 가능성 중심의 설계 초안*이다. 한국 운영 기준에서 아직 검증되지 않은 항목(통신·음성 품질·법무·응급/정신건강 문구 등)은 모두 *사전 검증 필요* 항목으로 분리되어 있으며, 본문에 등장하는 수치·고지 문구·보존 기간은 **후보값**이다.
>
> **AI 역할 한정 원칙**: 질문 순서·다음 질문 선택·이상징후 분류·응급 등급 판정은 모두 **서버 측 상태머신과 규칙 엔진**이 결정한다. AI(LLM/음성 모델)는 *결정된 질문을 한국어로 발화하고, 응답을 전사·구조화하는 보조 역할*에 한정되며, 의료·정신건강·응급 판단의 최종 주체가 아니다. AI는 진단·추정·처방·응급 확정 발화를 하지 않는다.

## 음성 계층 아키텍처 (메인 vs A/B 후보)

서비스의 메인 음성 계층은 **하나만 운영**한다. 두 스택을 동시에 메인으로 두지 않는다.

| 구분 | 스택 | 위치 | 상태 |
|---|---|---|---|
| **메인(설계 기준)** | **Twilio + OpenAI Realtime SIP** | 통화 발신·SIP bridge·Realtime 대화 | 본 문서 § 폴더 맵의 `twilio.*`, `openai.*`, `llm-prompt.ts`가 모두 이 스택 기준 |
| 한국어 음성 품질 A/B 후보 | Twilio ConversationRelay + ElevenLabs(또는 동급 한국어 TTS/STT) | 한국어 발화 자연스러움이 메인 스택만으로 부족할 때의 *대안* | **운영 메인이 아님**. 사전 검증 단계의 청취 테스트 결과에 따라 *대체 또는 부분 적용* 여부 결정 |

> A/B 후보 스택은 메인과 *겹쳐서 동시에* 운영하지 않는다. 청취 테스트 결과로 메인을 교체할지, 일부 발화(예: 안내문)만 분리할지 결정한다. 코드/스키마/통화 흐름은 메인 스택 기준으로만 작성되어 있다.

## 폴더 맵

```
docs/
  policy/        01~08 정책 초안 + 카카오 알림톡 템플릿
  schema/        001_init.sql · 002_rls.sql · 003_seed_rules.sql
src/server/
  care/
    types.ts           도메인 타입 (DB 스키마와 1:1)
    keywords.ts        한국어 위험 키워드 사전 + matchKeywords/shouldEscalate
    state-machine.ts   질문 상태머신 Q0~Q6 + decideNext/openingPrompt
    rule-engine.ts     R001~R009 결정주의 규칙 + Fetcher 인터페이스
    extraction.ts      통화 종료 후 turn → extracted_check_results 정규화
    scheduler.ts       매분 cron — outbound_call_jobs 생성 로직(planJobs)
    llm-prompt.ts      OpenAI Realtime system instructions 빌더
  notifications/
    adapters.ts        kakao/sms/email/push 어댑터 (현재 console stub)
    dispatcher.ts      alert → outbox row 빌더 + rule→template 매핑
src/routes/api/public/
  twilio.status.ts        통화 상태 콜백 (서명검증 TODO)
  twilio.twiml.$jobId.ts  발신 시 SIP bridge TwiML 반환
  twilio.recording.ts     녹음 완료 콜백
  openai.tool.ts          Realtime tool_call (record_answer 등) 디스패치
  openai.session.ts       세션 부트스트랩(system prompt 주입)
```

## 작업 트랙 분리 — "지금 바로 구현 가능" vs "사전 검증 필요"

개발 착수 시 두 트랙을 **명확히 분리해 병행**한다. Track A는 외부 의존 없이 코드만으로 진행 가능하고, Track B는 외부(통신/법무/사용자) 검증이 끝나야 의미 있는 결정을 내릴 수 있다. **Track B의 결과가 나오기 전에는 실제 어르신 대상 통화를 시작하지 않는다.**

### Track A — 지금 바로 구현 가능 (코드/스키마/내부 작업)

외부 절차 없이도 진행 가능한 항목. 이 트랙만으로 *내부 데모* 수준까지는 도달할 수 있다.

1. **DB 적용**: Supabase 프로젝트 생성 → `docs/schema/001_init.sql` → `002_rls.sql` → `003_seed_rules.sql` 순서로 실행.
2. **타입 동기화**: `supabase gen types typescript` 결과를 `src/integrations/supabase/types.ts`로 받고, `src/server/care/types.ts`와 충돌 없이 병행 사용(도메인 타입은 비즈니스 로직, gen 타입은 query 결과).
3. **Fetcher 구현**: `src/server/care/rule-engine.ts`의 `RuleFetchers` 인터페이스를 supabaseAdmin 기반으로 구현 (예: `src/server/care/fetchers.supabase.ts`).
4. **Extraction Writers 구현**: 같은 방식으로 `extraction.ts`의 `ExtractionFetchers`/`Writers` 구현.
5. **Webhook 서명검증 구현**: 코드 자체는 사전 작성 가능. 실제 검증 키 주입은 사업자 확정 후.
   - Twilio: `X-Twilio-Signature` HMAC-SHA1, secret = `TWILIO_AUTH_TOKEN`
   - OpenAI: webhook secret(env: `OPENAI_WEBHOOK_SECRET`)
6. **Scheduler 트리거 코드**: pg_cron 또는 Inngest로 `planJobs` 매분 호출하는 워커 구현. *실제 발신 활성화는 Track B 통과 후*.
7. **Notification worker 코드**: `notification_outbox(status='queued')` 폴링 → `dispatch()` 호출 → status 업데이트. *실제 알림톡 발송은 Track B의 사업자 심사 통과 후*.
8. **보호자 인증 / 대시보드 / 알림 카드 UI**: 외부 통신과 무관하게 구현 가능.
9. **상태머신·규칙 엔진·Extraction 단위 테스트**: 통화 발신 없이도 검증 가능.

### Track B — 사전 검증 필요 (외부 의존, Track A와 병행 시작)

외부 사업자·법무·실사용자 테스트가 필요한 항목. **모두 통과하기 전에는 실통화 운영을 시작하지 않는다.**

1. **한국 발신/수신 가능 여부 및 절차 검증**: 메인 음성 스택(Twilio + OpenAI Realtime SIP)이 한국에서 합법적으로 발신/수신 가능한지, 발신자 번호 표시·스팸 차단(SKT/KT/LG U+ 단말 표시)이 어떻게 동작하는지, 번호 임대/등록 절차(KCA 발신번호 사전등록 포함)가 어떻게 되는지 사업자·통신 규정 기준으로 사전 확인.
2. **실통화 품질 파일럿**: 메인 스택으로 KT/SKT/LG U+ 각 망에 실제 발신해 통화 연결률, 음성 품질(지연·끊김·왜곡), 발신자 표시를 측정. 망/시간대별 안정성은 테스트 전까지 *가정* 단계.
3. **한국어 음성 UX 청취 테스트**: 한국 고령 사용자(또는 대리 대상자) 대상 청취 테스트로 발화 자연스러움·이해도·지연 체감을 평가. 목표 지연(예: 응답 1초 미만)은 *목표값*이며 실측으로 재조정. **이 테스트 결과로 § 음성 계층 아키텍처의 A/B 후보(ConversationRelay + ElevenLabs 등) 도입 여부를 결정**한다.
4. **녹음/전사/보관 정책 법무 검토**: 통신비밀보호법·개인정보보호법 관점에서 보존 기간(예: 90일/2년/3년 — 모두 후보값), 녹음 동의 모델, 국외 이전 고지 절차 확정.
5. **통화 시작 고지문 / 음성 동의 정책 확정**: § `02-voice-consent.md`, § `03-call-disclosure.md`의 *후보 스크립트*를 법무 검토 후 확정.
6. **정신건강 / 응급 관련 문구 확정**: § `04-llm-guardrails.md` 금칙어/허용표현, § `06-emergency-policy.md`, 알림톡 템플릿(T005·T006·T007)을 의료/약사·법무 관점에서 검토 후 확정. 진단·추정·응급 확정형 표현은 모두 제거 또는 관찰형 표현으로 교체.
7. **약물 주의사항 데이터 출처 확정**: 식약처 등 공식 출처의 라이선스·인용 가능성·갱신 주기·표시 방식을 별도 검토 후 결정.
8. **알림톡 사업자 선정 + 템플릿 사전심사**: 통상 5~7영업일이라 알려져 있으나 사업자별·반려 여부에 따라 상이. `docs/policy/08-kakao-templates.md`를 기준안으로 제출 후 반려/수정 사이클을 가정.

### Track A → Track B 게이트

다음 모든 항목이 충족된 시점부터 실어르신 대상 통화를 시작할 수 있다.

- Track B의 1·2·3·4·5·6 모두 *완료* 상태
- Track B의 7(약물 데이터)은 약 복용 관련 알림(T004 등)을 활성화하기 전까지 충족 필요
- Track B의 8은 알림톡 발송을 시작하기 전까지 충족 필요

## 환경변수 체크리스트

서버(런타임):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `OPENAI_API_KEY`, `OPENAI_REALTIME_SIP_URI`, `OPENAI_WEBHOOK_SECRET`
- `KAKAO_BIZ_SENDER_KEY`, `KAKAO_BIZ_API_KEY` (선정 사업자에 따라 변경)

브라우저(VITE_*):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

## 정책 동기화 규칙

`docs/policy/04-llm-guardrails.md`의 금칙어/허용표현은 `src/server/care/llm-prompt.ts`의 `HARD_BANS`/`buildSystemPrompt`와 **반드시 동기화**. 한쪽만 바꾸지 말 것.

## 미구현(TODO) 요약

- [ ] 모든 webhook 서명 검증
- [ ] Supabase 기반 Fetcher/Writer 구현
- [ ] Notification 실제 사업자 SDK 연동
- [ ] Scheduler cron 트리거
- [ ] 보호자 인증(Supabase Auth) + 대시보드 ↔ DB 연동
- [ ] 음성 동의(`voice_consents`) 첫 통화 절차
- [ ] 녹음 Storage lifecycle 설정(보존 기간은 Track B-4 법무 검토 후 확정 — 90일은 후보값)
- [ ] 데이터 파기 cron(`07-data-retention.md` § 5)

## 사전 검증 없이 확정하면 안 되는 항목

다음 항목은 본 설계서·정책 폴더의 어떤 문서에서도 *확정형*으로 기술되어서는 안 된다. 모두 Track B 또는 별도 검토를 통해서만 확정한다.

| # | 항목 | 현재 상태 | 확정 절차 |
|---|---|---|---|
| 1 | 한국 발신 번호 전략(번호 임대·발신자 표시·KCA 등록 절차) | 후보 가정 | Track B-1 |
| 2 | 발신자 표시 / 스팸 차단(SKT/KT/LG U+ 단말 표시) 대응 | 후보 가정 | Track B-1 + 실통화 파일럿 |
| 3 | 한국어 음성 품질(지연·자연스러움·이해도) | 목표값만 존재 | Track B-2 + B-3 |
| 4 | 한국 고령자 청취 테스트 결과 | 미수행 | Track B-3 |
| 5 | 녹음 / 전사 / 보관 정책(기간·범위·접근 통제) | 후보값(예: 90일·2년·3년) | Track B-4 + 정책 § 01·07 법무 확정 |
| 6 | 음성 동의 절차(주체·갱신 주기·철회·고지문) | 후보 모델 | Track B-5 + 정책 § 02·03 법무 확정 |
| 7 | 정신건강 / 응급 관련 문구(알림·발화·고지) | 관찰형 초안 | Track B-6 + 정책 § 04·06·08(T005·T006·T007) 법무·의료 검토 |
| 8 | 약물 주의사항 / 상호작용 데이터 출처 | 미확정 | Track B-7 (별도 약물 데이터 정책 문서로 분리) |
| 9 | 음성 계층 메인 스택 최종 결정(메인 유지 vs A/B 후보 채택) | Twilio + OpenAI Realtime SIP를 메인으로 가정 | Track B-3 청취 테스트 결과 |

> 위 항목 중 어느 하나라도 확정 전인 상태에서는 본 문서·정책 문서·코드 주석 어디에도 *확정형 표현*("~이다", "~한다", "~로 운영한다")을 사용하지 않는다. *후보값 / 사전 검증 필요 / 파일럿 필요 / 정책 확정 필요* 표기를 유지한다.
