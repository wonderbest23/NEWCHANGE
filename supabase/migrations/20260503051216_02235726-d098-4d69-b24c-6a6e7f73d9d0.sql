
CREATE TABLE IF NOT EXISTS public.community_bot_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text NOT NULL,
  birth_year integer,
  region_sido text,
  region_sigungu text,
  verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_bot_authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot authors viewable by everyone"
  ON public.community_bot_authors FOR SELECT
  USING (true);

CREATE POLICY "Admins manage bot authors"
  ON public.community_bot_authors FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- profiles.is_bot은 더 이상 안 씀 (제거하지는 않음)
