# 안부전화 완성도 개선 구현 플랜

> 목적: 홈 안부전화 기능을 “음성 챗봇”이 아니라, 질문별 기록·출처 기반 위험 감지·사용자 확인·개인별 이어말하기가 가능한 안전한 안부 시스템으로 개선한다.
>
> 원칙: 의료 진단, 처방, 응급 확정 발화는 하지 않는다. 위험 신호는 공개 출처와 내부 규칙에 근거해 “확인 필요 신호”로 기록한다. 원문 기록은 삭제하지 않고, 사용자 수정은 별도 이력으로 append 한다.

## 현재 완료 상태

### 1. 출처 기반 위험 감지 1차 완료

구현 파일:
- `src/lib/checkin/evidence-risk.ts`
- `src/lib/checkin/checkin-actions.ts`
- `src/lib/voice-profile.ts`
- `src/server/voice-profile.ts`
- `src/server/care/keywords.ts`

적용 내용:
- 쇼크 직접 언급은 긴급 확인 대상으로 기록.
- 식은땀, 창백함, 빠른 호흡, 실신, 혼란 등 쇼크 관련 증상은 단일 표현만으로 단정하지 않고, 복수 증상 묶음이면 긴급으로 기록.
- 가슴 통증/압박, 호흡 곤란, 의식 저하/실신, 신경학적 위험 신호, 머리 충격 후 반복 구토는 긴급 확인 대상으로 기록.
- 보호자 리포트에 원문, 감지 표현, 판단 근거, 권장 대응, 출처 URL을 남김.

현재 사용 출처:
- Mayo Clinic, Shock: First aid  
  https://www.mayoclinic.org/first-aid/first-aid-shock/basics/art-20056620
- CDC, Symptoms of Mild TBI and Concussion  
  https://www.cdc.gov/traumatic-brain-injury/signs-symptoms/index.html
- CDC, Signs and Symptoms of MIS  
  https://www.cdc.gov/mis/signs-symptoms/index.html

주의:
- 출처 문구를 그대로 길게 복사하지 않는다.
- 위험 기준 추가 시 반드시 `evidence-risk.ts`에 출처 이름, URL, 접근일을 함께 남긴다.

### 2. 질문별 스텝 기록 1차 완료

구현 파일:
- `src/lib/checkin/checkin-steps.ts`
- `src/components/voice/DailyVoiceCheckin.tsx`
- `src/lib/checkin/background-save.ts`
- `src/lib/checkin/checkin-actions.ts`

현재 스텝:
- `Q1_MEAL`: 식사
- `Q2_CONDITION`: 몸 상태
- `Q3_PAIN`: 통증과 불편
- `Q4_MEDICINE`: 약
- `Q5_MOOD`: 기분
- `Q6_HELP`: 도움 요청

적용 내용:
- AI 질문 문장을 기반으로 현재 질문 스텝을 추정.
- 사용자 답변이 들어올 때 `stepAnswers`에 질문 ID, 질문 원문, 답변 원문, 답변 시각, 위험 근거를 저장.
- 임시저장과 최종 저장 페이로드에 `stepAnswers` 포함.
- `health_checkins.raw_transcript`에 일반 대화와 `[질문별 구조화 기록]`을 함께 append.

현재 한계:
- 아직 별도 DB 테이블이 아니라 `raw_transcript` 블록에 구조화 기록을 남기는 1차 방식.
- AI 질문 문장 기반 추정이라, 모델이 질문 문구를 크게 바꾸면 스텝 추정이 흔들릴 수 있음.
- 다음 단계에서 결정주의 상태머신으로 질문 순서를 서버/클라이언트가 직접 통제해야 함.

### 3. 통화 후 확인 화면 완료

구현 파일:
- `src/components/voice/DailyVoiceCheckin.tsx`

적용 내용:
- 통화 완료 후 “오늘 이렇게 기록했어요” 섹션 표시.
- 질문별 답변 확인.
- 위험 표현이 있으면 “확인 필요” 표시.
- 원문 대화 접기/펼치기.

### 4. 사용자 수정 저장 완료

구현 파일:
- `src/lib/checkin/checkin-actions.ts`
- `src/components/voice/DailyVoiceCheckin.tsx`

서버 액션:
- `amendTodayCheckinReview`

적용 내용:
- 통화 후 확인 화면에서 답변별 textarea 수정 가능.
- 수정 저장 시 기존 원문은 삭제하지 않고 `[사용자 수정 확인]` 블록을 `raw_transcript`에 append.
- 수정 답변 기준으로 식사, 약, 통증, 기분, 외로움, 어지러움, 긴급 여부를 보정.
- 수정 답변에도 출처 기반 위험 감지를 다시 적용.

현재 한계:
- 수정 필드 보정은 정규식 기반의 1차 로직.
- 수정 이력을 별도 테이블로 보관하지 않음.

### 5. 결정주의 질문 상태머신 1차 완료

구현 파일:
- `src/lib/checkin/checkin-state-machine.ts`
- `src/components/voice/DailyVoiceCheckin.tsx`
- `src/lib/voice-test-actions.ts`
- `src/lib/checkin/background-save.ts`

적용 내용:
- Realtime `server_vad.create_response`를 `false`로 변경해 모델의 자동 다음 응답 생성을 막음.
- 앱이 첫 질문과 다음 질문을 `response.create`로 직접 지정.
- 사용자 final transcript가 들어오면 상태머신이 다음 질문을 결정.
- 긴급 위험 근거가 있으면 `ESCALATE` 상태로 전환하고 일반 질문을 중단.
- 통화 draft에 `currentStepId`, `lastQuestion`, `urgentNotice`를 포함.
- `stepAnswers`가 생길 때마다 통화 중 draft를 자동 갱신해 중간 이탈 복귀 안정성을 높임.

현재 한계:
- 상태머신은 클라이언트 1차 구현이다. 추후 서버 저장/검증 레이어와 연결해야 한다.
- 답변 분류는 아직 정규식/위험근거 중심이며, 질문별 구조화 분류 테이블은 아직 없다.
- Realtime 이벤트 환경에 따라 `create_response=false` 이후 final transcript 이벤트가 안정적으로 오는지 실제 브라우저/모바일 테스트가 필요하다.

## 다음 단계

### 6. 통화 중 실시간 저장 강화

목표:
- 통화가 끊겨도 마지막 답변까지 더 확실히 보존한다.

해야 할 일:
- final transcript가 들어오는 즉시 localStorage draft 저장.
- `stepAnswers` 변경 시 draft 자동 갱신.
- draft에 `currentStepId`, `lastQuestion`, `urgentNotice` 포함.
- 복귀 시 해당 질문부터 이어가기.

완료 기준:
- 앱을 닫거나 전화가 끊겨도 직전 사용자 답변과 질문 ID가 남는다.
- 10분 이내 복귀 시 이어서 진행.
- 긴급 플래그가 있는 draft는 이어가기보다 긴급 확인 화면 우선.

### 7. 상태머신 모바일 실사용 검증

목표:
- `create_response=false` 상태에서 모바일/브라우저별 전사 이벤트와 응답 생성이 안정적인지 확인한다.

체크리스트:
- 첫 질문이 들리는지.
- 사용자 답변 후 다음 질문이 자동으로 이어지는지.
- AI가 임의로 다른 질문을 덧붙이지 않는지.
- 짧은 답변 “네”, “아니요”, “몰라요”가 기록되는지.
- 긴급 표현 후 일반 질문이 중단되는지.
- 화면 잠금/전화 수신/홈화면 이동 후 draft 복귀가 되는지.

### 8. 별도 DB 테이블로 질문별 기록 정규화 - 1차 완료

목표:
- `raw_transcript` append 방식에서 벗어나 질문별 기록을 조회/분석 가능한 구조로 만든다.

추가한 테이블:
- `health_checkin_turns`

추가한 컬럼:
- `id`
- `checkin_id`
- `turn_index`
- `step_id`
- `step_label`
- `ai_question`
- `user_answer`
- `risk_matches jsonb`
- `source_transcript_index`
- `corrected_answer`
- `corrected_at`
- `created_at`
- `updated_at`

구현 파일:
- `supabase/migrations/20260519093000_health_checkin_turns.sql`
- `src/lib/checkin/checkin-actions.ts`
- `src/integrations/supabase/types.ts`
- `src/routes/home.index.tsx`
- `src/routes/watch.tsx`

현재 동작:
- 안부전화 저장 시 `stepAnswers`를 `health_checkin_turns`에 함께 저장한다.
- 통화 후 사용자가 기록을 수정하면 같은 `checkin_id + step_id` 기준으로 수정 답변과 수정 시각을 저장한다.
- 홈의 오늘 탭과 보호자 오늘 안부 화면에서 질문별 답변을 표시한다.
- `health_checkins.raw_transcript`는 원문 백업과 호환 용도로 유지한다.
- RLS는 기존 `health_checkins`의 본인/가족 공유 권한을 따른다.

완료 기준:
- 안부전화 저장 시 질문별 기록이 `health_checkin_turns`에 생성된다. - 완료
- 수정 저장 시 `corrected_answer`, `corrected_at`이 반영된다. - 완료
- 오늘 안부 상세 화면과 보호자 화면이 `health_checkin_turns`를 기준으로 질문별 기록을 표시할 수 있다. - 완료
- `raw_transcript`는 원문 백업으로만 사용한다. - 진행 중

### 9. 계정별 기억 시스템 - 1차 완료

목표:
- 매번 같은 패턴의 대화를 줄이고, 최근 기록을 바탕으로 자연스럽게 이어 묻는다.

주의:
- 개인별 기억은 진단이나 추정에 쓰면 안 된다.
- “지난 기록 기반 확인 질문”으로만 사용한다.

추가한 테이블:
- `care_memory_items`

추가한 컬럼:
- `id`
- `user_id`
- `memory_type`
- `normalized_key`
- `content`
- `evidence_checkin_id`
- `evidence_turn_id`
- `confidence`
- `observation_count`
- `last_observed_at`
- `last_confirmed_at`
- `denied_at`
- `created_at`
- `updated_at`

구현 파일:
- `supabase/migrations/20260520093000_care_memory_items.sql`
- `src/lib/checkin/checkin-actions.ts`
- `src/lib/checkin/checkin-state-machine.ts`
- `src/components/voice/DailyVoiceCheckin.tsx`
- `src/lib/voice-test.memory.server.ts`
- `src/server/voice-test.memory.server.ts`
- `src/server/voice-test.memory.test.ts`

현재 동작:
- 질문별 답변에서 직접 확인된 반복 이슈만 기억 후보로 저장한다.
- 저장 대상은 식사 부족, 약 확인 필요, 통증, 기분 저하, 외로움, 어지럼이다.
- 각 기억은 `evidence_checkin_id`, `evidence_turn_id`를 가진다.
- 다음 안부전화 시작 시 활성 기억 1개만 짧게 언급한다.
- 사용자가 첫 답변에서 “아니요/그런 적 없어요/잘못”처럼 부정하면 해당 기억을 `denied_at` 처리하고 confidence를 0으로 낮춘다.
- 기존 Realtime memory prompt도 `health_checkins.summary` 대신 `care_memory_items` 기반으로 바꿨다.

예시:
- “지난번 무릎이 불편하다고 하셨는데 오늘은 어떠세요?”
- “요즘 아침 식사를 거르신 날이 몇 번 있었어요. 오늘은 드셨어요?”

완료 기준:
- 최근 반복 이슈를 1개만 짧게 첫 질문 또는 관련 질문에 자연스럽게 연결. - 완료
- 사용자가 부정하면 해당 기억 신뢰도를 낮추거나 비활성화. - 완료
- 기억 출처가 항상 남는다. - 완료
- 마이페이지/설정에서 기억 목록을 보고 삭제할 수 있다. - 다음 단계 후보

### 10. 보호자 알림과 긴급 UX 고도화 - 1차 완료

목표:
- 긴급/주의 신호가 보호자에게 원문과 근거 중심으로 전달되게 한다.

해야 할 일:
- 홈 안부통화에서 긴급 감지 시 즉시 보호자 확인 이벤트 생성. - 완료
- 보호자 화면에서 원문, 근거 표현, 출처, 권장 행동을 표시. - 완료
- 알림 발송은 정책/사업자 검증 전에는 실제 발송하지 않는다. - 유지

완료 기준:
- 긴급 표현이 감지되면 일반 요약보다 긴급 확인 카드가 우선 표시된다. - 완료
- 보호자에게는 “진단”이 아니라 “확인 필요 표현이 기록됨”으로 표시된다. - 완료

구현 파일:
- `supabase/migrations/20260520094500_checkin_urgent_alert_rule.sql`
- `src/lib/checkin/checkin-actions.ts`
- `src/routes/guardian.alerts.tsx`

현재 동작:
- 안부전화 저장 또는 수정 저장에서 출처 기반 긴급 위험이 확인되면 `anomaly_alerts`에 `R007` critical 알림을 생성한다.
- 알림 evidence에는 `checkin_id`, 원문 일부, 매칭 카테고리, 매칭 단어, 출처명, 보호자 리포트, 권장 행동을 남긴다.
- 같은 checkin에 대해 열린 `R007` 알림이 있으면 중복 생성하지 않는다.
- 보호자 알림 화면에서는 `R007`을 “안부전화 긴급 확인 표현”으로 표시하고, 원문/근거 출처/권장 행동을 함께 보여준다.
- 실제 SMS/카카오 발송은 아직 하지 않는다. 정책 및 운영 상한 검증 전까지는 앱 내부 알림만 생성한다.

### 11. 운영 검수 지표 - 1차 완료

목표:
- 통화 품질과 기록 정확도를 운영자가 볼 수 있게 한다.

추천 지표:
- 질문별 완료율 - 완료
- 답변 누락률 - 완료
- 수정 발생률 - 완료
- 위험 감지 건수 - 완료
- 긴급 감지 후 보호자 확인 여부 - 기존 `anomaly_alerts` 상태와 연결
- 중단/복귀 위치 - draft 저장 이벤트로 기록
- WebRTC 음성 품질 통계(jitter, RTT, packet loss 관측) - 완료

근거:
- ISO 9241-11:2018의 사용성 관점인 효과성, 효율성, 만족 중 1차 구현은 효과성/효율성에 해당하는 완료율, 누락률, 수정률을 먼저 기록한다.
- WebRTC Statistics API/MDN에서 실시간 음성 품질 저하 관측에 쓰이는 jitter, roundTripTime, packetsLost 값을 수집한다.

구현 파일:
- `supabase/migrations/20260520102000_checkin_quality_events.sql`
- `src/lib/checkin/checkin-actions.ts`
- `src/components/voice/DailyVoiceCheckin.tsx`
- `src/server/admin/dashboard.functions.ts`
- `src/routes/admin.index.tsx`

현재 동작:
- 안부전화 완료/실패/너무 짧은 통화/일시저장/수정 저장 시 `checkin_quality_events`에 품질 이벤트를 남긴다.
- 각 이벤트에는 질문 완료 수, 누락 질문, transcript turn 수, 사용자/AI turn 수, 수정 건수, 긴급 여부, draft 복귀 여부, audio stats, issue flags가 들어간다.
- 통화 중 `RTCPeerConnection.getStats()`를 주기적으로 읽어 jitter, RTT, packet loss 관측값을 저장한다.
- 관리자 홈에 최근 7일 안부전화 품질 카드가 표시된다.
- 전사 중복/무효 답변 비율

### 12. 실제 통화 안정화 - 진행 중

목표:
- 실제 모바일 통화에서 자동종료, 일시저장, 약한 음성 대응이 사용자의 기대와 맞게 동작하게 한다.

근거:
- Web Audio API의 `AnalyserNode.getByteTimeDomainData()`로 마이크 입력 파형을 읽어 RMS/peak 기반 약한 입력 신호를 관측한다.
- WebRTC `RTCPeerConnection.getStats()`로 jitter, RTT, packet loss를 수집해 통화 품질 저하를 운영 지표에 남긴다.
- 단, 브라우저 Realtime 전사 이벤트에서 신뢰도 점수가 제공되지 않는 경우가 있으므로 “ASR 확신도”라고 단정하지 않고, 파형 약함 + 짧거나 불명확한 전사 텍스트를 함께 보는 보수적 규칙으로 처리한다.

구현 파일:
- `src/components/voice/DailyVoiceCheckin.tsx`
- `src/lib/checkin/checkin-state-machine.ts`
- `src/lib/checkin/checkin-state-machine.test.ts`

현재 동작:
- 마지막 답변 후 종료 안내를 보낼 때 즉시 타이머로 끊지 않고, AI 마지막 음성 완료 이벤트 이후 짧게 대기하고 종료한다.
- 음성 완료 이벤트가 누락되는 브라우저/네트워크 상황을 대비해 최대 대기 fallback을 둔다.
- 사용자 final transcript가 들어오면 React 상태 반영을 기다리지 않고 즉시 `transcriptsRef`, `stepAnswersRef`, draft를 갱신한다.
- 파형이 약하거나 답변이 너무 짧고 애매하면 추측해서 저장하지 않고 “제가 이렇게 들은 게 맞나요?” 확인 질문을 한다.
- 같은 항목이 반복해서 불명확하면 해당 항목은 기록하지 않고 다음 질문으로 넘어간다.
- 마지막 항목이 반복해서 불명확하면 추측 저장 없이 통화를 마친다.

테스트:
- 상태머신 단위 테스트로 불명확 답변 재확인, 반복 불명확 시 스킵, 마지막 항목 종료, 긴급 표현 중단, 짧은 긍정 답변 보존을 검증한다.

다음 확인 필요:
- 실제 iOS/Android 브라우저에서 `response.output_audio.done` 또는 `response.done` 이벤트가 어떤 순서로 오는지 확인한다.
- 약한 음성 RMS 기준값은 실제 통화 로그의 `audio_stats.micSignal`을 보고 조정한다.
- 블루투스 이어폰, 스피커폰, 무음모드 케이스를 별도로 테스트한다.

### 13. 개인화 질문 계획 기반 - 1차 완료

목표:
- 고정 6문항을 그대로 읽는 구조에서 벗어나, 통화 시작 시점의 한국시간과 향후 개인 기억을 반영할 수 있는 “오늘의 질문 계획”을 만든다.

구현 파일:
- `src/lib/checkin/checkin-steps.ts`
- `src/lib/checkin/checkin-state-machine.ts`
- `src/components/voice/DailyVoiceCheckin.tsx`
- `src/lib/checkin/background-save.ts`

현재 동작:
- 통화 시작 시 `buildCheckinQuestionPlan()`으로 질문 계획을 만든다.
- 식사 질문은 한국시간 기준으로 아침/점심/저녁/늦은 시간에 맞춰 달라진다.
- 예: 아침에는 아침 식사 여부, 점심에는 점심과 아침 누락 여부, 저녁에는 저녁과 오늘 거른 끼니 여부를 묻는다.
- 상태머신은 이제 전역 고정 문항이 아니라 `questionPlan`을 따라 다음 질문을 결정한다.
- draft에도 `questionPlan`을 저장해, 중간 이탈 후 복귀해도 처음 생성된 질문 맥락을 유지한다.
- `care_memory_items`의 활성 기억을 질문 계획 생성기에 넣어 식사/약/통증/기분 질문 중 1개만 개인화한다.
- 개인화 질문은 사용자가 직접 말한 기록과 `evidence_turn_id`가 있는 기억만 사용한다.
- 기억이 없는 신규 사용자는 지금처럼 시간대 기반 기본 질문 계획을 사용한다.
- 개인화 문구는 해당 질문 단계에만 들어가며, 첫 인사에 같은 기억을 중복 언급하지 않는다.

현재 개인화 매핑:
- `meal` → 식사 질문
- `medicine` → 약 질문
- `pain` → 통증과 불편 질문
- `dizziness` → 몸 상태 질문
- `mood`, `loneliness` → 기분 질문

테스트:
- 한국시간 식사 질문 분기, 질문 계획 첫 인사 반영, 출처 turn이 있는 기억만 1개 질문에 반영, 출처 없는 기억 미반영을 단위 테스트로 검증한다.

### 14. 기억 통제권 UI - 1차 완료

목표:
- 개인화 질문에 쓰이는 기억을 사용자가 직접 확인하고, 원하지 않는 기억은 다음 안부전화에서 제외할 수 있게 한다.

구현 파일:
- `src/lib/checkin/checkin-actions.ts`
- `src/routes/home.me.tsx`

현재 동작:
- 마이페이지에 “AI가 기억하는 내용” 섹션을 표시한다.
- 본인의 활성 `care_memory_items` 최대 20개를 최근 관측/신뢰도 순으로 보여준다.
- 각 기억에는 유형, 내용, 관측 횟수, 신뢰도, 마지막 관측일을 표시한다.
- “이 기억 쓰지 않기”를 누르면 `denied_at` 처리하고 confidence를 0으로 낮춘다.
- 원본 checkin/turn 근거는 삭제하지 않고, 이후 개인화 질문에서만 제외한다.

주의:
- 실제 개인정보/건강 기록 삭제가 아니라 개인화 기억 비활성화다.
- 원문 transcript와 질문별 기록은 감사/보호자 공유 근거로 유지한다.

## 개발 시 절대 지킬 규칙

- 원문 transcript는 삭제하지 않는다.
- 사용자 수정은 append 또는 별도 correction 필드로 남긴다.
- 위험 판단은 출처와 함께 기록한다.
- 진단/처방/응급 확정 표현을 쓰지 않는다.
- “쇼크”처럼 명시적인 표현은 긴급 확인 대상으로 보되, 단일 경미 증상만으로 쇼크를 단정하지 않는다.
- AI가 다음 질문을 자유롭게 고르는 구조로 되돌리지 않는다.
- `npm run build`로 검증한다. Wrangler 로그 권한 경고는 현재 환경에서 반복되지만 빌드 exit code가 0이면 통과로 본다.

## 다음 작업 추천 순서

1. 실제 iOS/Android에서 자동종료 이벤트 순서와 draft 저장 여부를 확인한다.
2. 관리자 품질 이벤트의 `audio_stats.micSignal` 표본으로 약한 음성 기준값을 조정한다.
3. draft 복귀 UX를 긴급/비긴급으로 분리한다.
4. 개인화 질문 성공률/부정률을 운영 지표에 추가한다.
5. 마이페이지 기억 섹션에 “전체 개인화 끄기” 설정을 추가한다.
