-- pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- local_resources 확장
ALTER TABLE public.local_resources
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS evidence_level smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS license text DEFAULT '공공누리 제1유형',
  ADD COLUMN IF NOT EXISTS last_fetched_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 자치구 기본값 백필
UPDATE public.local_resources
SET district = region_sigungu
WHERE district IS NULL AND region_sigungu IS NOT NULL;

UPDATE public.local_resources
SET category = resource_type
WHERE category IS NULL AND resource_type IS NOT NULL;

-- 중복 방지용 고유키 (source_name + source_external_id)
CREATE UNIQUE INDEX IF NOT EXISTS local_resources_source_unique
  ON public.local_resources(source_name, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_local_resources_district ON public.local_resources(district);
CREATE INDEX IF NOT EXISTS idx_local_resources_category ON public.local_resources(category);
CREATE INDEX IF NOT EXISTS idx_local_resources_start_date ON public.local_resources(start_date);

-- content_tags
CREATE TABLE IF NOT EXISTS public.content_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.local_resources(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(resource_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_content_tags_tag ON public.content_tags(tag);
CREATE INDEX IF NOT EXISTS idx_content_tags_resource ON public.content_tags(resource_id);

ALTER TABLE public.content_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_tags_select_all ON public.content_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY content_tags_admin_write ON public.content_tags
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ingest_runs
CREATE TABLE IF NOT EXISTS public.ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  district text,
  status text NOT NULL,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_started ON public.ingest_runs(started_at DESC);

ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ingest_runs_admin ON public.ingest_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- rss_sources
CREATE TABLE IF NOT EXISTS public.rss_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district text NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  category text NOT NULL DEFAULT '공지',
  enabled boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(district, url)
);
CREATE INDEX IF NOT EXISTS idx_rss_sources_district ON public.rss_sources(district);

ALTER TABLE public.rss_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY rss_sources_admin ON public.rss_sources
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY rss_sources_select_all ON public.rss_sources
  FOR SELECT TO authenticated USING (true);

-- saved_resources
CREATE TABLE IF NOT EXISTS public.saved_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resource_id uuid NOT NULL REFERENCES public.local_resources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_resources_user ON public.saved_resources(user_id);

ALTER TABLE public.saved_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_resources_owner ON public.saved_resources
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());