-- =============================================================================
-- Seed: anomaly_rules (R001 ~ R009)
-- =============================================================================

insert into public.anomaly_rules (code, name, severity, params, description) values
('R001','48시간 미응답','critical',
 '{"window_hours":48,"min_no_answer":3}'::jsonb,
 '성공 통화 0건 + no_answer ≥ 3 인 경우'),
('R002','이틀 연속 식사 미확인','warning',
 '{"window_days":2}'::jsonb,
 'extracted(meal) = skipped 가 2일 연속'),
('R003','약 누락 반복','warning',
 '{"window_days":7,"min_missed":3}'::jsonb,
 '7일 중 missed ≥ 3'),
('R004','낙상 언급','critical',
 '{"keywords":["넘어졌","쓰러졌","미끄러졌","낙상"]}'::jsonb,
 '오늘 통화 turn 에서 낙상 키워드 매칭'),
('R005','응급 증상 호소','critical',
 '{"keywords":["가슴이 아파","숨이 차","숨쉬기 힘","머리가 깨질","말이 안 나","한쪽이 안 움직","의식이"]}'::jsonb,
 '호흡곤란/가슴통증/의식혼미 등 응급 키워드'),
('R006','우울/불안 표현 반복','warning',
 '{"window_days":14,"min_days":5}'::jsonb,
 '부정 정서 키워드 ≥ 5일/14일'),
('R007','수면 악화 지속','info',
 '{"window_days":7,"min_poor":5}'::jsonb,
 'sleep=poor ≥ 5/7일'),
('R008','본인확인 실패','warning',
 '{}'::jsonb,
 'wrong_person_flag=true 인 통화'),
('R009','약 부작용 의심','warning',
 '{}'::jsonb,
 'Q3a=side_effect 응답')
on conflict (code) do update
set name = excluded.name,
    severity = excluded.severity,
    params = excluded.params,
    description = excluded.description,
    updated_at = now();
