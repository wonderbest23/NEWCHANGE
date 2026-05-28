# 산책 몬스터 베타 (URL 전용)

## 접속

1. 로그인 후 브라우저에서 `/beta/walk-monster` 로 이동
2. (선택) `.env`에 `VITE_BETA_GAME_GATE=비밀값` 설정 시 → `/beta/walk-monster?key=비밀값`
3. `VITE_BETA_GAME_ENABLED=0` 이면 베타 비활성

## DB

Supabase에 마이그레이션 적용:

- `supabase/migrations/20260527120000_beta_walk_monster_game.sql`
- 또는 SQL Editor: `docs/schema/007_beta_walk_monster_game.sql`

## 플레이

1. 위치·게임 동의
2. **산책 추적 시작** → 실외에서 걷기 (GPS)
3. **50m**마다 몬스터 스폰
4. **포획** → 화면을 3번 탭
5. XP·코인·레벨 적립 (안부 `walk_checkins` 와 별도)

## 한계 (베타 0)

- AR 카메라 없음 (2D 탭 포획)
- 실시간 맵 없음
- 스폰은 현재 위치 기준 오프셋
