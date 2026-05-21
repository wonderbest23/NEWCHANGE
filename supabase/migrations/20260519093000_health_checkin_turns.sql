CREATE TABLE IF NOT EXISTS public.health_checkin_turns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkin_id UUID NOT NULL REFERENCES public.health_checkins(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  step_label TEXT NOT NULL,
  ai_question TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  risk_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_transcript_index INTEGER,
  corrected_answer TEXT,
  corrected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT health_checkin_turns_unique_step UNIQUE (checkin_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_health_checkin_turns_checkin
  ON public.health_checkin_turns(checkin_id, turn_index);

CREATE INDEX IF NOT EXISTS idx_health_checkin_turns_risk_matches
  ON public.health_checkin_turns USING GIN(risk_matches);

ALTER TABLE public.health_checkin_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "turns_via_checkin_select"
  ON public.health_checkin_turns FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.health_checkins c
    WHERE c.id = checkin_id
      AND (c.senior_user_id = auth.uid()
           OR (c.caregiver_shared AND c.family_id IN (SELECT user_family_ids())))
  ));

CREATE POLICY "turns_via_checkin_write"
  ON public.health_checkin_turns FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.health_checkins c
    WHERE c.id = checkin_id
      AND c.senior_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.health_checkins c
    WHERE c.id = checkin_id
      AND c.senior_user_id = auth.uid()
  ));

CREATE TRIGGER trg_health_checkin_turns_updated
  BEFORE UPDATE ON public.health_checkin_turns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
