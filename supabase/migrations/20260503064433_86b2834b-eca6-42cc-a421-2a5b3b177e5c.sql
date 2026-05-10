
-- Passkey credentials per user
CREATE TABLE public.user_passkeys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_user_passkeys_user_id ON public.user_passkeys(user_id);

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own passkeys"
  ON public.user_passkeys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own passkeys"
  ON public.user_passkeys FOR DELETE
  USING (auth.uid() = user_id);

-- Pending challenges (server-managed, no client access)
CREATE TABLE public.passkey_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge TEXT NOT NULL,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('registration','authentication')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX idx_passkey_challenges_challenge ON public.passkey_challenges(challenge);
CREATE INDEX idx_passkey_challenges_expires ON public.passkey_challenges(expires_at);

ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
-- No policies: only service role accesses this table.
