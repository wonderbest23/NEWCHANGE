
CREATE TABLE public.ask_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  question text NOT NULL,
  risk_category text,
  answer_title text,
  answer_summary text,
  caution text,
  related_tip_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ask_logs_created_at ON public.ask_logs (created_at DESC);
CREATE INDEX idx_ask_logs_risk ON public.ask_logs (risk_category) WHERE risk_category IS NOT NULL;

ALTER TABLE public.ask_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ask_logs_admin_all"
ON public.ask_logs FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ask_logs_owner_select"
ON public.ask_logs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "ask_logs_owner_insert"
ON public.ask_logs FOR INSERT TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());
