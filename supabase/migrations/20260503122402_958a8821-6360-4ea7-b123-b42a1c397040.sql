-- 1) direct_messages
CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id),
  CHECK (char_length(body) BETWEEN 1 AND 500)
);

CREATE INDEX idx_dm_recipient_created ON public.direct_messages(recipient_id, created_at DESC);
CREATE INDEX idx_dm_sender_created ON public.direct_messages(sender_id, created_at DESC);
CREATE INDEX idx_dm_pair ON public.direct_messages(LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DM participants can read"
  ON public.direct_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Sender can insert own DM"
  ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Recipient can mark read"
  ON public.direct_messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "Sender can delete own DM"
  ON public.direct_messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- 2) dm_blocks
CREATE TABLE public.dm_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.dm_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own blocks"
  ON public.dm_blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users create own blocks"
  ON public.dm_blocks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users delete own blocks"
  ON public.dm_blocks FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

-- 3) dm_reports
CREATE TABLE public.dm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dm_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters see own reports"
  ON public.dm_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users create own reports"
  ON public.dm_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Admins manage reports"
  ON public.dm_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));