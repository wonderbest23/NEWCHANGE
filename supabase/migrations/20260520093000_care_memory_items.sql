CREATE TABLE IF NOT EXISTS public.care_memory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  memory_type TEXT NOT NULL
    CHECK (memory_type IN ('meal', 'medicine', 'pain', 'mood', 'loneliness', 'dizziness')),
  normalized_key TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence_checkin_id UUID REFERENCES public.health_checkins(id) ON DELETE SET NULL,
  evidence_turn_id UUID REFERENCES public.health_checkin_turns(id) ON DELETE SET NULL,
  confidence REAL NOT NULL DEFAULT 0.6 CHECK (confidence >= 0 AND confidence <= 1),
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count >= 1),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed_at TIMESTAMPTZ,
  denied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT care_memory_items_unique_key UNIQUE (user_id, normalized_key)
);

CREATE INDEX IF NOT EXISTS idx_care_memory_items_user_active
  ON public.care_memory_items(user_id, denied_at, confidence DESC, last_observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_care_memory_items_evidence_checkin
  ON public.care_memory_items(evidence_checkin_id);

ALTER TABLE public.care_memory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "care_memory_items_owner_all"
  ON public.care_memory_items FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_care_memory_items_updated
  BEFORE UPDATE ON public.care_memory_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
