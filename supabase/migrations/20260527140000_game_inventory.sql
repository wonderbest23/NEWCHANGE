CREATE TABLE public.game_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_key)
);

CREATE INDEX idx_game_inventory_user ON public.game_inventory (user_id);

ALTER TABLE public.game_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_inventory_owner ON public.game_inventory
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_inventory TO authenticated;
GRANT ALL ON public.game_inventory TO service_role;
