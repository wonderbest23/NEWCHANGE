-- =============================================================================
-- 산책 몬스터 베타 — Supabase SQL Editor에 전체 복사 후 Run
-- =============================================================================
-- 순서: 007(게임 코어) → 008(가방)
-- 이미 일부 테이블이 있어도 IF NOT EXISTS / DROP POLICY IF EXISTS 로 재실행 가능
-- 적용 확인:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'game_%';
-- =============================================================================

-- ─── 007 게임 코어 (profiles · spawns · catches) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  coins integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  total_catches integer NOT NULL DEFAULT 0 CHECK (total_catches >= 0),
  session_distance_m real NOT NULL DEFAULT 0 CHECK (session_distance_m >= 0),
  spawn_progress_m real NOT NULL DEFAULT 0 CHECK (spawn_progress_m >= 0),
  last_lat double precision,
  last_lng double precision,
  location_consent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.game_spawns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monster_key text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('common', 'rare', 'legendary')),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'caught', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_spawns_user_status
  ON public.game_spawns (user_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.game_catches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spawn_id uuid NOT NULL REFERENCES public.game_spawns(id) ON DELETE CASCADE,
  xp_gained integer NOT NULL CHECK (xp_gained >= 0),
  coins_gained integer NOT NULL CHECK (coins_gained >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (spawn_id)
);

CREATE INDEX IF NOT EXISTS idx_game_catches_user_created
  ON public.game_catches (user_id, created_at DESC);

ALTER TABLE public.game_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_spawns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_catches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_profiles_owner ON public.game_profiles;
CREATE POLICY game_profiles_owner ON public.game_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS game_spawns_owner ON public.game_spawns;
CREATE POLICY game_spawns_owner ON public.game_spawns
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS game_catches_owner ON public.game_catches;
CREATE POLICY game_catches_owner ON public.game_catches
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_spawns TO authenticated;
GRANT SELECT, INSERT ON public.game_catches TO authenticated;
GRANT ALL ON public.game_profiles TO service_role;
GRANT ALL ON public.game_spawns TO service_role;
GRANT ALL ON public.game_catches TO service_role;

-- ─── 008 가방 (inventory) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_game_inventory_user ON public.game_inventory (user_id);

ALTER TABLE public.game_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_inventory_owner ON public.game_inventory;
CREATE POLICY game_inventory_owner ON public.game_inventory
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_inventory TO authenticated;
GRANT ALL ON public.game_inventory TO service_role;

-- ─── 적용 확인 (선택: 아래만 따로 실행해도 됨) ─────────────────────────────

-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'game_%'
-- ORDER BY 1;
