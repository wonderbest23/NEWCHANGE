-- 1) health_checkins
CREATE TABLE public.health_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  senior_user_id UUID NOT NULL,
  family_id UUID,
  checkin_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_transcript TEXT,
  summary TEXT,
  condition_level TEXT NOT NULL DEFAULT 'normal'
    CHECK (condition_level IN ('good','normal','caution','urgent')),
  meal_status TEXT,
  sleep_status TEXT,
  medicine_status TEXT,
  pain_status TEXT,
  mood_status TEXT,
  loneliness_detected BOOLEAN NOT NULL DEFAULT false,
  dizziness_detected BOOLEAN NOT NULL DEFAULT false,
  urgent_detected BOOLEAN NOT NULL DEFAULT false,
  caregiver_shared BOOLEAN NOT NULL DEFAULT false,
  duration_sec INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_checkins_user ON public.health_checkins(senior_user_id, checkin_at DESC);
CREATE INDEX idx_health_checkins_family ON public.health_checkins(family_id, checkin_at DESC);

ALTER TABLE public.health_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkins_owner_all"
  ON public.health_checkins FOR ALL
  TO authenticated
  USING (senior_user_id = auth.uid())
  WITH CHECK (senior_user_id = auth.uid());

CREATE POLICY "checkins_family_shared_select"
  ON public.health_checkins FOR SELECT
  TO authenticated
  USING (caregiver_shared = true AND family_id IN (SELECT user_family_ids()));

CREATE TRIGGER trg_health_checkins_updated
  BEFORE UPDATE ON public.health_checkins
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) health_checkin_tags
CREATE TABLE public.health_checkin_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkin_id UUID NOT NULL REFERENCES public.health_checkins(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  confidence REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_checkin_tags_checkin ON public.health_checkin_tags(checkin_id);
CREATE INDEX idx_health_checkin_tags_tag ON public.health_checkin_tags(tag_name);

ALTER TABLE public.health_checkin_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_via_checkin_select"
  ON public.health_checkin_tags FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.health_checkins c
    WHERE c.id = checkin_id
      AND (c.senior_user_id = auth.uid()
           OR (c.caregiver_shared AND c.family_id IN (SELECT user_family_ids())))
  ));

CREATE POLICY "tags_via_checkin_write"
  ON public.health_checkin_tags FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.health_checkins c WHERE c.id = checkin_id AND c.senior_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.health_checkins c WHERE c.id = checkin_id AND c.senior_user_id = auth.uid()));

-- 3) health_reports
CREATE TABLE public.health_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkin_id UUID NOT NULL UNIQUE REFERENCES public.health_checkins(id) ON DELETE CASCADE,
  senior_report_text TEXT NOT NULL,
  caregiver_report_text TEXT,
  recommendation_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_reports_checkin ON public.health_reports(checkin_id);

ALTER TABLE public.health_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_via_checkin_select"
  ON public.health_reports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.health_checkins c
    WHERE c.id = checkin_id
      AND (c.senior_user_id = auth.uid()
           OR (c.caregiver_shared AND c.family_id IN (SELECT user_family_ids())))
  ));

CREATE POLICY "reports_via_checkin_write"
  ON public.health_reports FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.health_checkins c WHERE c.id = checkin_id AND c.senior_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.health_checkins c WHERE c.id = checkin_id AND c.senior_user_id = auth.uid()));

-- 4) local_resources (서울 동네 정보)
CREATE TABLE public.local_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL
    CHECK (resource_type IN ('welfare_center','senior_center','public_health','program','event','meal','smartphone_class','health_class','job')),
  region_sido TEXT NOT NULL DEFAULT '서울특별시',
  region_sigungu TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  opening_hours TEXT,
  cost TEXT,
  application_method TEXT,
  description TEXT,
  source_name TEXT,
  source_url TEXT,
  recommendation_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  verified_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_local_resources_region ON public.local_resources(region_sigungu) WHERE is_active;
CREATE INDEX idx_local_resources_tags ON public.local_resources USING GIN(recommendation_tags);

ALTER TABLE public.local_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "local_resources_select_all"
  ON public.local_resources FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "local_resources_admin_write"
  ON public.local_resources FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_local_resources_updated
  BEFORE UPDATE ON public.local_resources
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();