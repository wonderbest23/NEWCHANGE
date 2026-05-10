CREATE TABLE public.phone_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_phone_verifications_phone ON public.phone_verifications(phone);
CREATE INDEX idx_phone_verifications_expires ON public.phone_verifications(expires_at);

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- 클라이언트 직접 접근 차단 (서버 라우트에서 service role로만 접근)
CREATE POLICY "no client access phone_verifications"
ON public.phone_verifications
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- profiles에 phone_verified 추가 (없을 때만)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;