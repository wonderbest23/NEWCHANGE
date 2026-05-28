-- 감정 기반 권고 피드백 (도움 됨/안 됨)

CREATE TABLE IF NOT EXISTS public.emotion_rec_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_id uuid REFERENCES public.health_checkins(id) ON DELETE SET NULL,
  emotion_key text NOT NULL,
  cache_key text,
  source text,
  helpful boolean NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_rec_feedback_user_created
  ON public.emotion_rec_feedback (user_id, created_at DESC);

ALTER TABLE public.emotion_rec_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emotion_rec_feedback_insert_own ON public.emotion_rec_feedback;
CREATE POLICY emotion_rec_feedback_insert_own ON public.emotion_rec_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS emotion_rec_feedback_select_own ON public.emotion_rec_feedback;
CREATE POLICY emotion_rec_feedback_select_own ON public.emotion_rec_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.emotion_rec_feedback TO authenticated;
GRANT ALL ON public.emotion_rec_feedback TO service_role;
