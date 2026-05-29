# AR 시나리오 구현 현황

> **목적**: AI/개발자에게 시나리오 개선 작업을 전달하기 위한 코드 기반 현황 문서  
> **기준일**: 2026-05-29  
> **관련 기존 문서**: `docs/beta-walk-monster.md` (산책 몬스터 베타 URL·DB·플레이 상세), `docs/HANDOFF.md` (Care Call 음성/케어 — 시나리오와 무관)

---

## 1. 개요

### 1.1 시나리오 허브 URL

| 경로 | 설명 | 인증 |
|------|------|------|
| `/scenario/` | 게임/교육 시나리오 카드 허브 (`ScenarioHub`) | **불필요** |
| `/scenario/$scenarioId` | 개별 시나리오 실행 (lazy-load) | **필요** (`requireAuthBeforeLoad`) |
| `/beta/walk-monster` | 산책 몬스터 **레거시 베타 전용 URL** | 필요 + 선택적 베타 게이트 |

**URL 별칭** (`scenario.$scenarioId.tsx`의 `SCENARIO_ID_ALIASES`):

- `walk-monster` → `walk_monster` (301 리다이렉트)

**허브 → 실행 흐름**: `ScenarioHub` 카드 클릭 시 `/scenario/$scenarioId`로 이동. 실행 라우트에서 인증 검사 후 `registry.loader`로 lazy-load.

### 1.2 공통 아키텍처

```
src/lib/scenario/
  types.ts      — ScenarioId, ScenarioDef, ScenarioStep, ScenarioRunnerProps
  registry.ts   — SCENARIOS[] (single source of truth, 클라이언트)
  actions.ts    — server fn (진행·펫·협동)
  voice.ts      — TTS + 자막 (edu)

src/routes/
  scenario.index.tsx       — 허브 (ssr 기본, auth 없음)
  scenario.$scenarioId.tsx — 동적 lazy-load + auth + 별칭 리다이렉트 (ssr: false)

src/components/scenarios/
  ScenarioHub.tsx          — 카드 그리드 (game/edu 분류)
  ScenarioCameraShell.tsx  — 카메라 lifecycle 공통
  StepRunner.tsx           — edu 단계 진행 + TTS 자막
  *Scenario.tsx            — 시나리오별 구현
```

**카테고리 분기** (`types.ts` 주석 기준):

- **game** (`walk_monster`, `fishing`, `pet`, `coop`): 자유 흐름, 자체 phase/state
- **edu** (`kiosk_order`, `coffee_making`, `excavator_basics`): `registry.steps` + `StepRunner` 단계형

**공유 인프라**:

- 카메라: `ScenarioCameraShell` (후면 카메라, HTTPS 필요)
- 3D: Three.js (`FishingArScene`, `MonsterArScene`, `AssetPreview`)
- AR/센서: GPS, DeviceOrientation, MediaPipe HandLandmarker
- HUD: `GameHUD` + `action-context.ts` (산책/낚시 공통 액션 blueprint)
- DB: Supabase Auth + server fn + (일부) Realtime

**새 시나리오 추가 절차** (`registry.ts` 주석):

1. `types.ts`에 `ScenarioId` 추가  
2. `src/components/scenarios/<Name>.tsx` 작성  
3. `registry.ts`의 `SCENARIOS` 배열에 등록 → `/scenario/$scenarioId` 라우트가 자동 lazy-load

---

## 2. 시나리오 목록 표

| ID | 제목 | 카테고리 | URL | registry status | needs (권장 환경) | 구현 수준 |
|----|------|----------|-----|-----------------|-------------------|-----------|
| `walk_monster` | 산책 몬스터 | game | `/scenario/walk_monster` | beta | camera, location, outdoor | **베타 (E2E)** |
| `fishing` | AR 낚시 | game | `/scenario/fishing` | beta | camera, location | **베타 (클라이언트 loop 완성)** |
| `pet` | AR 반려견 | game | `/scenario/pet` | beta | camera, handTracking | **베타 (DB 연동)** |
| `coop` | 친구와 합체 | game | `/scenario/coop` | beta | camera, location | **베타 (presence만, 사냥 미연동)** |
| `kiosk_order` | 키오스크 주문 실습 | edu | `/scenario/kiosk_order` | beta | camera, indoor | **WIP (UI placeholder)** |
| `coffee_making` | 커피 만들기 | edu | `/scenario/coffee_making` | beta | camera, handTracking, indoor | **WIP (UI placeholder)** |
| `excavator_basics` | 포크레인 기본 조작 | edu | `/scenario/excavator_basics` | beta | camera, indoor | **WIP (조이스틱 + SVG/GLB fallback)** |

> DB `public.scenarios` 테이블에도 동일 7개 seed (`supabase/migrations/20260528120000_scenarios_pets_coop.sql`).  
> **현재 런타임 잠금/베타 토글은 클라이언트 `registry.ts`가 실질 권위** (서버 테이블은 설계상 최종 권위 후보).

---

## 3. 시나리오 상세

### 3.1 산책 몬스터 (`walk_monster`)

| 항목 | 내용 |
|------|------|
| **상태** | beta — 가장 완성도 높은 game 시나리오 |
| **주요 파일** | `WalkMonsterScenario.tsx` → `WalkMonsterBeta.tsx` → `ARWalkSession.tsx`, `MonsterArScene.tsx`, `walk-monster-actions.ts`, `SpawnRadarMap.tsx`, `GameInventoryPanel.tsx`, `GameLeaderboard.tsx` |
| **레거시 URL** | `/beta/walk-monster` — `checkBetaGameAccess()` (env 게이트). `/scenario/walk_monster`는 게이트 **미적용** |

**게임플레이 loop**:

1. 로그인 → (동의 미완) 위치·카메라 동의 화면  
2. GPS 추적 시작 → 50m(`SPAWN_DISTANCE_M`)마다 몬스터 스폰  
3. 레이더/방위각으로 몬스터 접근 → 80m(`CATCH_RADIUS_M`) 이내 `in_range`  
4. 카메라 AR + 기울기/조준 → aim/tap/rhythm 포획  
5. 포획 → XP/코인, 일일 한도 30(`DAILY_CATCH_LIMIT`), 인벤토리·상점·랭킹

**Phase/state** (`action-context.ts`): `walking` → `hiding`(방향 안내) → `aimed` → `capturing`

**UI/3D/AR**:

- 풀스크린 카메라 + `MonsterArScene` (Three.js, in_range일 때만)
- `useDeviceOrientation` — iOS는 「AR 움직임 허용」 버튼
- `SpawnRadarMap` — 원형 레이더 (Google 지도 타일은 `VITE_GOOGLE_MAPS_STATIC_KEY` 있을 때만)
- `useObjectDetector` — 선택적 앵커 (MediaPipe)

**API/DB**:

- Server fn: `getWalkMonsterProfile`, `syncWalkMonsterSession`, `catchWalkMonster`, `acceptWalkMonsterConsent`, `forceSpawnNearby`, `resetWalkMonsterSession` 등 (`walk-monster-actions.ts`)
- 테이블: `game_profiles`, `game_spawns`, `game_catches`, `game_inventory` (`docs/schema/007_beta_walk_monster_game.sql`, `008_game_inventory.sql`)

**Auth**: Supabase Auth 필수. 미로그인 시 `/auth?redirect=/scenario/walk_monster`

**알려진 이슈/한계** (`docs/beta-walk-monster.md`, 코드):

- AR.js / 월드 트래킹 미구현 (기울기·카메라 합성 AR)
- Google 지도 타일 없으면 원형 레이더만
- GPS 정확도 30m 초과 샘플 무시, moving average 4샘플
- `/scenario/walk_monster` vs `/beta/walk-monster` 게이트 정책 불일치

**env**:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- `/beta/walk-monster` 전용: `VITE_BETA_GAME_ENABLED`, `VITE_BETA_GAME_GATE`
- 선택: `VITE_GOOGLE_MAPS_STATIC_KEY`

---

### 3.2 AR 낚시 (`fishing`)

| 항목 | 내용 |
|------|------|
| **상태** | beta — 클라이언트 게임 loop + Three.js AR 씬 완성, 소셜/인벤토리는 mock |
| **주요 파일** | `FishingScenario.tsx`, `FishingArScene.tsx`, `useFishingSession.ts`, `action-context.ts`, `src/components/game/fishing/*` (19파일) |

**게임플레이 loop** (`useFishingSession`):

```
spot_select → ready → casting(홀드) → floating → waiting
  → bite(1.5s 윈도우) → fighting(텐션 0.35~0.7) 
  → hook_success → fish_breach → fish_land → fish_flop → capture_confirm → reward
  (실패: escaped)
```

**물고기**: minnow, bass, carp, goldfish — rarity별 hp/xp/coins

**UI/3D/AR**:

- `ScenarioCameraShell` + `FishingArScene` (Three.js)
- 연못(`createFishingPond`), 찌, 물고기 그림자, 절차적/GLB 낚싯대
- `fishingViewport.ts` — `mobilePortrait` / `tabletPortrait` tier별 FOV·연못·낚싯대 NDC
- `rodScreenLayout.ts` — 모바일 grip 우하단, tip 중앙~좌상 NDC 타깃
- AI 에셋: `useGeneratedModel("fish"|"generic")` + `asset-manifest` fallback
- HUD: phase별 primary strike 버튼, fighting 게이지, mock 소셜 feed

**API/DB**:

- 성공 시 `markStepComplete({ scenario_id: "fishing", step_key: "catch_one" })` → `user_progress`
- **낚시 보상/인벤토리 DB 저장 없음** (클라이언트 onReward + toast만)

**Auth**: `/scenario/fishing` — route auth 필수

**알려진 이슈**:

- `nearbyPlayers` — 랜덤 mock (`useFishingSession` 주석: "추후 supabase presence")
- 소셜 feed — 하드코딩 mock (`SOCIAL_FEED_MOCK`)
- 가방/도감 버튼 — `toast.info("추후 연결")`
- **모바일 낚싯대 GLB**: `shouldUseRodGlb()` 기본 true, `rodGlbActivation` bbox 검사, 실패 시 procedural fallback — tier별 레이아웃 튜닝 진행 중
- `VITE_FISHING_ROD_GLB=0` 시 GLB 비활성

**env**:

- `VITE_DEBUG_FISHING=1` — phase 강제 전환·모델 debug 패널
- `VITE_FISHING_ROD_GLB=0` — GLB 낚싯대 off

---

### 3.3 AR 반려견 (`pet`)

| 항목 | 내용 |
|------|------|
| **상태** | beta — DB 연동 + HandLandmarker |
| **주요 파일** | `PetScenario.tsx`, `actions.ts` (getOrCreatePet, interactWithPet), `useHandTracker.ts` |

**게임플레이 loop**:

1. `getOrCreatePet` — 1유저 1펫 자동 생성  
2. 카메라 위 3D GLB 또는 🐶 fallback  
3. 액션: 쓰다듬기 / 먹이 / 놀기 / 훈련 → affinity, hunger, exp, level, mood 갱신  
4. 손바닥 펼침(`open_palm`) → 10초 쿨다운 자동 pet

**UI/3D/AR**:

- `ScenarioCameraShell` + `AssetPreview(kind="pet")`
- MediaPipe HandLandmarker (Worker, ~700ms 주기)

**API/DB**:

- `pets`, `pet_interactions` 테이블
- Server fn: `getOrCreatePet`, `interactWithPet`

**Auth**: route auth 필수

**알려진 이슈**:

- HandLandmarker 미지원 환경 silent no-op (버튼 상호작용만)
- 3D pet GLB 없으면 이모지 fallback

---

### 3.4 친구와 합체 (`coop`)

| 항목 | 내용 |
|------|------|
| **상태** | beta — 멀티플레이 **최소 단위** (presence + 축포 broadcast) |
| **주요 파일** | `CoopScenario.tsx`, `actions.ts` (create/join/end CoopPair) |

**Phase/state**: `lobby` → `waiting`(6자 코드) → `active`

**게임플레이 loop**:

1. Host: 코드 생성 → Guest: 코드 입력 → `coop_pairs.status='active'`  
2. Supabase Realtime channel `coop:{pair_id}` — presence sync  
3. 「축포!」 broadcast → 양쪽 toast + fx  
4. **실제 공동 사냥/낚시 동기화 없음** (UI 주석 명시)

**UI/3D/AR**: `ScenarioCameraShell` + 로비/대기/활성 카드 UI (3D 없음)

**API/DB**: `coop_pairs` + Supabase Realtime presence/broadcast

**Auth**: route auth 필수

---

### 3.5 키오스크 주문 실습 (`kiosk_order`)

| 항목 | 내용 |
|------|------|
| **상태** | beta / **WIP** — placeholder UI |
| **주요 파일** | `KioskScenario.tsx`, `StepRunner.tsx`, `registry.steps` (3단계) |

**단계** (`registry.ts`): `select_menu` → `options` → `checkout`

**UI/3D/AR**:

- 가상 키오스크 Card UI (하드코딩 MENU 3개)
- `AssetPreview(kind="kiosk")` 미니 3D
- `StepRunner` TTS 자막

**API/DB**: 단계마다 `markStepComplete` → `user_progress`

**추후 확장** (파일 주석): Object Detector 키오스크 정렬, Web Speech API

---

### 3.6 커피 만들기 (`coffee_making`)

| 항목 | 내용 |
|------|------|
| **상태** | beta / **WIP** |
| **주요 파일** | `CoffeeScenario.tsx`, 4단계 steps |

**단계** (`registry.ts`): `grind` → `tamp` → `extract` → `milk` — 내부 progress bar 후 「다음」

**UI/3D/AR**: placeholder Card + `AssetPreview(kind="coffee_machine")`

**API/DB**: `markStepComplete` per step

**추후 확장** (주석): HandLandmarker 제스처, Three.js 머신 GLB

---

### 3.7 포크레인 기본 조작 (`excavator_basics`)

| 항목 | 내용 |
|------|------|
| **상태** | beta / **WIP** |
| **주요 파일** | `ExcavatorScenario.tsx`, VirtualJoystick 2개 |

**단계** (`registry.ts`): `safety_check` → `ignition` → `basic_dig`

**UI/3D/AR**:

- 좌/우 VirtualJoystick → boomY, bucketRot (placeholder 수치)
- `AssetPreview(kind="excavator")` 또는 SVG 실루엣 fallback
- **물리 시뮬레이션 없음** (파일 주석)

**API/DB**: `markStepComplete` per step

---

## 4. 미구현 / Placeholder 요약

| 영역 | 현재 상태 |
|------|-----------|
| registry `status: "locked"` | 등록된 시나리오 없음 |
| registry `status: "ready"` | 없음 (전부 beta) |
| 서버 `scenarios` 테이블 기반 잠금 | 클라이언트 미연동 |
| Coop ↔ walk_monster/fishing 동기화 | 미구현 |
| Fishing 소셜/presence/인벤토리 | mock 또는 toast placeholder |
| Edu 3D 실습 (키오스크/커피/포크레인) | 2D UI + AssetPreview 미니뷰 |
| Walk monster AR.js 월드 트래킹 | 미구현 |
| `onScenarioComplete` 보상 토스트/리다이렉트 | route 주석 "추후" |

---

## 5. 환경 변수 (시나리오 관련)

| 변수 | 용도 | 적용 시나리오 |
|------|------|---------------|
| `VITE_SUPABASE_URL` | Supabase | 전체 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon | 전체 |
| `VITE_BETA_GAME_ENABLED` | `0`/`false` 시 베타 off | `/beta/walk-monster` only |
| `VITE_BETA_GAME_GATE` | `?key=` 필수 | `/beta/walk-monster` only |
| `VITE_DEBUG_FISHING` | `1` — debug UI | fishing |
| `VITE_FISHING_ROD_GLB` | `0` — GLB off | fishing |
| `VITE_GOOGLE_MAPS_STATIC_KEY` | 레이더 정적 지도 | walk_monster |

---

## 6. DB 스키마 참조

| 마이그레이션/SQL | 테이블 |
|------------------|--------|
| `supabase/migrations/20260528120000_scenarios_pets_coop.sql` | `scenarios`, `user_progress`, `pets`, `pet_interactions`, `coop_pairs` |
| `docs/schema/007_beta_walk_monster_game.sql` | `game_profiles`, `game_spawns`, `game_catches` |
| `docs/schema/008_game_inventory.sql` | `game_inventory` |
| `docs/schema/apply_beta_walk_monster.sql` | 위 game_* 일괄 적용 |

---

## 7. 개선 시 참고 기술 스택

| 계층 | 기술 |
|------|------|
| 프레임워크 | React, TanStack Router/Start, TanStack Query |
| 3D | Three.js, GLTFLoader, 커스텀 water shader |
| AR/센서 | getUserMedia, Geolocation, DeviceOrientation, MediaPipe (Hand/Object) |
| 실시간 | Supabase Realtime (presence, broadcast) |
| API | `createServerFn` + `requireSupabaseAuth` |
| 접근성 | Web Speech API TTS (`voice.ts`), 자막 overlay |
| 에셋 | Asset Forge (`getActiveAsset`), `asset-manifest.ts` |
| HUD 패턴 | `action-context.ts` → `blueprintFor()` → phase별 Primary/Secondary |

---

## 8. AI 개선 작업 시 우선순위 제안 (코드 근거)

1. **Fishing 모바일 낚싯대** — `fishingViewport.ts`, `rodScreenLayout.ts`, `rodGlbActivation.ts` tier 검증  
2. **Fishing 서버 연동** — 보상/인벤토리 DB, presence로 `nearbyPlayers` 교체  
3. **Coop 실게임 연동** — walk_monster/fishing session sync  
4. **Edu 3D/제스처** — HandLandmarker·Object Detector (각 Scenario 주석)  
5. **시나리오 허브 ↔ Auth** — 허브는 무인증, 실행은 인증 (UX 정리)  
6. **walk_monster 경로 통합** — `/beta/walk-monster` 게이트 vs `/scenario/walk_monster` 정책 정렬  

---

## 포함 시나리오 (7개)

`walk_monster`, `fishing`, `pet`, `coop`, `kiosk_order`, `coffee_making`, `excavator_basics`
