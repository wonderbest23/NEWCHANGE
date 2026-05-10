# 아시아 리전 이전 가이드 (Remix 절차)

> 현재 프로젝트는 생성 시점에 결정된 리전에 고정되어 있어 직접 변경할 수 없습니다.
> 한국 사용자 응답 속도를 개선하려면 **Remix → 아시아 리전 선택 → 데이터 이전** 순서로 진행합니다.

---

## 0. 먼저 시도해볼 것 — 인스턴스 업그레이드

리전 이동 없이도 체감 속도가 개선되는 경우가 많습니다.

1. 좌측 사이드바 **Cloud** 진입
2. **Overview → Advanced settings**
3. **Upgrade instance** 에서 한 단계 위 사이즈 선택
4. 2~3분 대기 후 응답 속도 재확인

> 물리적 거리(미국 ↔ 한국)에서 오는 지연은 줄지 않지만, 동시 처리/쿼리 성능은 향상됩니다.
> 실시간 음성처럼 왕복 지연이 핵심인 기능에서 부족하면 아래 Remix 절차로 진행하세요.

---

## 1. Remix로 새 프로젝트 만들기 (아시아 리전)

### Desktop
1. 좌측 상단 **프로젝트 이름 클릭** → **Settings**
2. **Project** 탭 → **Remix this project**
3. **Use Lovable Cloud** 체크 확인
4. **Region** 에서 다음 중 선택
   - `Seoul (ap-northeast-2)` ← 한국 사용자에게 권장
   - `Tokyo (ap-northeast-1)`
   - `Singapore (ap-southeast-1)`
5. **Remix** 클릭

### Mobile
1. 우측 하단 **…** → **Settings** → **Project**
2. **Remix this project** → 위와 동일하게 리전 선택

> Remix는 **소스 코드만** 복제됩니다. 데이터·파일·시크릿·가입 사용자는 자동 이전되지 않습니다.

---

## 2. Remix 직후 새 프로젝트에서 할 일

| 항목 | 작업 |
|---|---|
| 마이그레이션 | `supabase/migrations/*.sql` 이 자동 적용됐는지 Cloud → Database 에서 확인 |
| 시크릿 | `OPENAI_API_KEY`, `TWILIO_*`, `KAKAO_*` 등 기존 키를 새 프로젝트에 다시 등록 |
| 인증 설정 | Cloud → Users → Auth settings 에서 Google 등 소셜 로그인 재설정 |
| Edge Functions | 자동 배포되므로 별도 배포 불필요, 로그로 정상 동작 확인 |
| 도메인 | 게시(Publish) 후 Settings → Domains 에서 커스텀 도메인 재연결 |

---

## 3. 데이터 이전 (필요할 때만)

운영 중인 데이터(어르신·보호자·통화 기록 등)를 옮겨야 한다면:

### A. 이전 프로젝트에서 export
- Cloud → Database → Tables 에서 테이블별 **Export** (CSV)
- 또는 SQL: `COPY (SELECT * FROM public.<table>) TO STDOUT WITH CSV HEADER;`

### B. 새 프로젝트로 import
- Cloud → Database → Tables → **Import**
- 또는 마이그레이션 파일에 `INSERT` 형태로 작성

### 주의
- `auth.users` 의 비밀번호 해시는 일반 export로 옮기기 어렵습니다 → 사용자 재가입 또는 Magic Link 안내가 가장 안전
- FK 의존성이 있는 테이블은 부모 → 자식 순서로 import
- `created_at` 등 타임스탬프 컬럼은 import 시 보존되도록 컬럼 매핑 확인

---

## 4. 전환 체크리스트

- [ ] 새 프로젝트 Cloud Status = `ACTIVE_HEALTHY`
- [ ] 시크릿 전부 등록 완료
- [ ] 로그인/회원가입 정상 동작
- [ ] 주요 페이지(`/home/settings`, `/guardian/dashboard`, `/checkin`) 렌더링 확인
- [ ] Twilio/OpenAI 웹훅 URL을 새 도메인으로 갱신
- [ ] 커스텀 도메인 DNS 전환
- [ ] 기존 프로젝트는 일정 기간 읽기 전용으로 유지 후 종료

---

## 5. 자주 묻는 질문

**Q. 기존 프로젝트는 바로 삭제해도 되나요?**
A. 데이터 무결성 검증이 끝날 때까지 최소 1~2주는 유지 권장.

**Q. URL이 바뀌나요?**
A. 네. `*.lovable.app` 서브도메인이 새로 생성됩니다. 커스텀 도메인을 쓰면 사용자에겐 영향 없음.

**Q. 어느 리전이 가장 빠른가요?**
A. 한국 사용자 기준 **Seoul** 이 일반적으로 가장 낮은 지연을 보입니다.
