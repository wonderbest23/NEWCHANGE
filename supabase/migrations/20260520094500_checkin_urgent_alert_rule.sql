INSERT INTO public.anomaly_rules (code, name, severity, params, enabled, description)
VALUES (
  'R007',
  '안부전화 긴급 확인 표현',
  'critical',
  '{"source":"health_checkins","policy":"evidence_based_checkin_risk"}'::jsonb,
  true,
  '안부전화에서 쇼크, 흉통, 호흡곤란, 의식저하 등 출처 기반 긴급 확인 표현이 기록된 경우'
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  severity = EXCLUDED.severity,
  params = EXCLUDED.params,
  enabled = true,
  description = EXCLUDED.description;
