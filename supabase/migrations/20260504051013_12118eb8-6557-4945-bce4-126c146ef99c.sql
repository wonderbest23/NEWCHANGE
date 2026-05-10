-- 확장 전용 스키마 보장
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- vector 확장을 public → extensions 로 이동
-- (확장이 소유한 타입/연산자/함수가 함께 이동하며,
--  기존 컬럼(public.local_resources.embedding)의 타입 참조도 자동으로 갱신됩니다.)
ALTER EXTENSION vector SET SCHEMA extensions;

-- 새 세션에서 search_path 에 extensions 가 포함되도록 데이터베이스 기본값 갱신
DO $$
DECLARE
  db text := current_database();
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET search_path TO %L, %L, %L',
    db, '"$user"', 'public', 'extensions'
  );
END $$;