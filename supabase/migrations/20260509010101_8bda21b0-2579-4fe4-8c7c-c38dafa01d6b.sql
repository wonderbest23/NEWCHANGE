ALTER TABLE public.tips
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);

CREATE INDEX IF NOT EXISTS idx_tips_embedding
  ON public.tips USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 50);

CREATE OR REPLACE FUNCTION public.match_tips(
  query_embedding extensions.vector(1536),
  match_count int DEFAULT 3,
  min_similarity float DEFAULT 0.25
)
RETURNS TABLE (
  id uuid,
  category_slug text,
  title text,
  summary text,
  cover_image_url text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT t.id, t.category_slug, t.title, t.summary, t.cover_image_url,
         1 - (t.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM public.tips t
  WHERE t.is_published = true
    AND t.embedding IS NOT NULL
    AND 1 - (t.embedding OPERATOR(extensions.<=>) query_embedding) >= min_similarity
  ORDER BY t.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_tips(extensions.vector, int, float) TO anon, authenticated;