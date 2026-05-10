
-- Reviews table for agencies
CREATE TABLE public.agency_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, user_id)
);

CREATE INDEX idx_agency_reviews_agency ON public.agency_reviews(agency_id);

ALTER TABLE public.agency_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews viewable by everyone"
  ON public.agency_reviews FOR SELECT USING (true);

CREATE POLICY "Auth users create own review"
  ON public.agency_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own review"
  ON public.agency_reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users or admin delete review"
  ON public.agency_reviews FOR DELETE
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_agency_reviews_updated_at
BEFORE UPDATE ON public.agency_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Aggregate view for ratings
CREATE OR REPLACE VIEW public.agency_rating_stats AS
SELECT agency_id,
       AVG(rating)::numeric(2,1) AS avg_rating,
       COUNT(*)::int AS review_count
FROM public.agency_reviews
GROUP BY agency_id;

GRANT SELECT ON public.agency_rating_stats TO anon, authenticated;
