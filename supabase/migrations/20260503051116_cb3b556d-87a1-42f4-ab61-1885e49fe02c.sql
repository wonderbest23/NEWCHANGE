
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_bot ON public.profiles(is_bot) WHERE is_bot = true;
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON public.community_posts(created_at DESC);
