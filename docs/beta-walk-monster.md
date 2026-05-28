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

- 3D AR.js / 월드 트래킹 미구현
- Google 지도 타일 없음 (원형 레이더만)
