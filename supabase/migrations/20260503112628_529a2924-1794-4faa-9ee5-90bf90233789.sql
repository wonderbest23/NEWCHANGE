-- 1) community_posts 지역 컬럼
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS region_sido text,
  ADD COLUMN IF NOT EXISTS region_sigungu text,
  ADD COLUMN IF NOT EXISTS recommendation_tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS community_posts_region_sigungu_idx
  ON public.community_posts (region_sigungu);

-- 2) 동네지킴이 AI 봇 계정 시드 (고정 UUID)
INSERT INTO public.community_bot_authors (id, nickname, region_sido, region_sigungu, verified)
VALUES (
  '00000000-0000-0000-0000-0000000a1b1c',
  '동네지킴이 AI',
  NULL,
  NULL,
  true
)
ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, verified = true;