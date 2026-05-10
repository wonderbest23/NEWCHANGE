-- 1) analytics_events
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  user_role TEXT NULL,
  event_name TEXT NOT NULL,
  target_type TEXT NULL,
  target_id UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name_created_at
  ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id_created_at
  ON public.analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_target
  ON public.analytics_events (target_type, target_id);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- 로그인 사용자는 자기 자신(user_id=auth.uid()) 또는 익명(user_id IS NULL) 이벤트 기록 가능
CREATE POLICY "analytics_events_insert_self"
  ON public.analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 관리자만 전체 조회
CREATE POLICY "analytics_events_admin_select"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 관리자 전체 관리 (수정/삭제)
CREATE POLICY "analytics_events_admin_all"
  ON public.analytics_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));


-- 2) organization_pipeline
CREATE TABLE IF NOT EXISTS public.organization_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT NOT NULL,
  organization_type TEXT NULL,
  region TEXT NULL,
  contact_name TEXT NULL,
  contact_phone TEXT NULL,
  contact_email TEXT NULL,
  status TEXT NOT NULL DEFAULT '접촉 전',
  interest_level TEXT NULL,
  expected_users INTEGER NULL,
  meeting_date DATE NULL,
  next_action TEXT NULL,
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_pipeline_status
  ON public.organization_pipeline (status);
CREATE INDEX IF NOT EXISTS idx_organization_pipeline_meeting_date
  ON public.organization_pipeline (meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_organization_pipeline_created_at
  ON public.organization_pipeline (created_at DESC);

ALTER TABLE public.organization_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_pipeline_admin_all"
  ON public.organization_pipeline FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_organization_pipeline_updated
  BEFORE UPDATE ON public.organization_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- 3) investor_kpi_targets
CREATE TABLE IF NOT EXISTS public.investor_kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL DEFAULT '30d',
  target_senior_users INTEGER NOT NULL DEFAULT 20,
  target_caregiver_links INTEGER NOT NULL DEFAULT 10,
  target_voice_checkins INTEGER NOT NULL DEFAULT 100,
  target_voice_completion_rate NUMERIC NOT NULL DEFAULT 60,
  target_report_view_rate NUMERIC NOT NULL DEFAULT 70,
  target_organization_meetings INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investor_kpi_targets_admin_all"
  ON public.investor_kpi_targets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_investor_kpi_targets_updated
  BEFORE UPDATE ON public.investor_kpi_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 기본 30일 목표 1행 시드
INSERT INTO public.investor_kpi_targets (period_type)
SELECT '30d'
WHERE NOT EXISTS (SELECT 1 FROM public.investor_kpi_targets WHERE period_type = '30d');
