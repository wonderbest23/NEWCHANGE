# 산책 몬스터 베타 (URL 전용)

## 접속

1. 로그인 후 `/beta/walk-monster`
2. (선택) `VITE_BETA_GAME_GATE` → `?key=비밀값`
3. `VITE_BETA_GAME_ENABLED=0` 이면 비활성

## DB (SQL Editor에 한 번에 붙여넣기)

**파일:** [`docs/schema/apply_beta_walk_monster.sql`](schema/apply_beta_walk_monster.sql)

1. Supabase 대시보드 → **SQL Editor** → New query
2. 위 파일 **전체** 복사 → Run
3. (선택) 하단 확인 쿼리로 `game_*` 테이블 4개 확인

개별 적용: `007_beta_walk_monster_game.sql`, `008_game_inventory.sql`

## 플레이 (베타 1)

1. 동의 → 스타터 **포획구×5**, **걸음 부스터×2**
2. **레이더**에서 내 위치·몬스터 방향 확인
3. 산책 추적 → 50m마다 스폰
4. **80m 이내**에서만 포획
5. 포획 → 카메라 + **기울기 AR** (iOS는 「AR 움직임 허용」)
6. 포획구: 탭 2번 · +5 코인
7. 코인으로 상점 구매 · 부스터로 스폰 거리 10m 단축
8. 포획 랭킹

## 카메라·AR

- HTTPS / localhost 필수
- 기울기 센서: iOS Safari에서 버튼으로 권한 요청

## 한계

- 3D AR.js / 월드 트래킹 미구현 (Phase 4 WebXR/Capacitor PoC 준비 중)
- Google 지도 타일 없음 (원형 레이더만)

## 로드맵 (POGO형 개선)

| Phase | 내용 | 상태 |
|-------|------|------|
| 0 | 조우 FSM, aimScore 통합 판정 | 완료 |
| 1 | 지면 휴리스틱 + MediaPipe 앵커 + 조우 화면 | 완료 |
| 2 | 포켓볼 스와이프 던지기 + wiggle | 완료 |
| 3 | 레이더 spawn 선택 + 도감(얕은) | 완료 |
| 4 | WebXR hit-test / Capacitor AR | PoC (`AnchorProvider`) |

### 조우 흐름

`walking` → `encounter_enter`(0.8s) → `encounter_fight` → `capture_throw`(스와이프) → wiggle → `caught` / `fled`

- 레이더에서 spawn 핀 탭 → 해당 몬스터 조우
- 80m 이내 자동 조우 (쿨다운 4s)
- legendary 45s flee 타이머

### 테스트 (dev / 스테이징)

- **로컬 dev** (`npm run dev`): AR 화면 좌하단 **「🧪 테스트 조우」** 버튼 자동 표시
- **스테이징/빌드**: `.env`에 `VITE_DEBUG_WALK_MONSTER=1` 설정
- 버튼 동작: in_range 몬스터 없으면 `forceSpawnNearby` → 조우 FSM 시작 (`encounter_enter`)
- **「🧪 몬스터 8종 생성」**: `forceSpawnAllMonstersDebug` — sprout~golden 8종을 ~29m 원형 배치 (기존 활성 스폰 교체)
- **위치 권한 없음**: dev/`VITE_DEBUG_WALK_MONSTER=1` 이면 서울숲 mock 좌표(`37.5444, 127.0396`)로 자동 진행
- 조우 중 **「→ 던지기 단계」** 로 포획 스와이프 UI 바로 점프 가능
