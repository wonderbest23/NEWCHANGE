ALTER TABLE public.anomaly_alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.anomaly_alerts;

CREATE POLICY "alerts_admin_select"
ON public.anomaly_alerts
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));