
CREATE TABLE public.voice_psych_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id uuid NOT NULL,
  session_id uuid,
  analyzed_for_date date NOT NULL DEFAULT CURRENT_DATE,
  overall_tone text NOT NULL,
  -- 0-100 점수 (정수)
  energy_score smallint NOT NULL DEFAULT 50,
  fatigue_score smallint NOT NULL DEFAULT 50,
  depression_score smallint NOT NULL DEFAULT 50,
  anxiety_score smallint NOT NULL DEFAULT 50,
  anger_score smallint NOT NULL DEFAULT 50,
  -- 음성 파형 요약 (말 속도, 음높이, 떨림, 평균 볼륨 등)
  voice_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 텍스트 요약
  summary text NOT NULL,
  risk_flags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_voice_psych_recipient_date
  ON public.voice_psych_analyses (care_recipient_id, analyzed_for_date DESC);

ALTER TABLE public.voice_psych_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_psych_select
  ON public.voice_psych_analyses
  FOR SELECT
  TO authenticated
  USING (public.can_access_recipient(care_recipient_id));
