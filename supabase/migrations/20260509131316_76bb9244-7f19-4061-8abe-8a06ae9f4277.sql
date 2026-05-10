CREATE TABLE public.walk_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  family_id UUID,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m REAL,
  checkin_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_walk_checkins_user_at ON public.walk_checkins(user_id, checkin_at DESC);

ALTER TABLE public.walk_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "walk_checkins_owner_all"
ON public.walk_checkins
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "walk_checkins_family_select"
ON public.walk_checkins
FOR SELECT
TO authenticated
USING (family_id IS NOT NULL AND family_id IN (SELECT user_family_ids()));