CREATE TABLE IF NOT EXISTS public.checkin_quality_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  checkin_id UUID REFERENCES public.health_checkins(id) ON DELETE SET NULL,
  status TEXT NOT NULL
    CHECK (status IN ('completed','failed','too_short','draft_saved','review_corrected')),
  duration_sec INTEGER NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
  expected_step_count INTEGER NOT NULL DEFAULT 6 CHECK (expected_step_count >= 0),
  completed_step_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_step_count >= 0),
  missing_step_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  transcript_turn_count INTEGER NOT NULL DEFAULT 0 CHECK (transcript_turn_count >= 0),
  user_turn_count INTEGER NOT NULL DEFAULT 0 CHECK (user_turn_count >= 0),
  assistant_turn_count INTEGER NOT NULL DEFAULT 0 CHECK (assistant_turn_count >= 0),
  correction_count INTEGER NOT NULL DEFAULT 0 CHECK (correction_count >= 0),
  urgent_detected BOOLEAN NOT NULL DEFAULT false,
  resumed_from_draft BOOLEAN NOT NULL DEFAULT false,
  draft_reason TEXT,
  issue_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  audio_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkin_quality_events_user_at
  ON public.checkin_quality_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkin_quality_events_checkin
  ON public.checkin_quality_events(checkin_id);

CREATE INDEX IF NOT EXISTS idx_checkin_quality_events_status_at
  ON public.checkin_quality_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkin_quality_events_audio_stats
  ON public.checkin_quality_events USING GIN(audio_stats);

ALTER TABLE public.checkin_quality_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkin_quality_events_insert_self"
  ON public.checkin_quality_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "checkin_quality_events_owner_select"
  ON public.checkin_quality_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "checkin_quality_events_admin_all"
  ON public.checkin_quality_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
