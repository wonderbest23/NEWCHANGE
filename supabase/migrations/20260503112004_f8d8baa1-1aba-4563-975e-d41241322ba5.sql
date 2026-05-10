ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_range text,
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}'::text[];