-- pg_cron / pg_net 활성화 (이미 있으면 무시)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 기존 같은 이름의 작업이 있으면 제거 (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('ingest-daily-openapi');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('ingest-weekly-firecrawl');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 매일 KST 04:00 = UTC 19:00 (전날) → '0 19 * * *'
SELECT cron.schedule(
  'ingest-daily-openapi',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9ba8150a-7373-4385-86ff-9c69e7e2800b.lovable.app/api/public/ingest/run',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYWZlZHhtZ2lseHhzamRhemRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MjQ5NjQsImV4cCI6MjA5MzEwMDk2NH0.akcOD9nc09GqlGbYNjGdJ0eYj3jJjXq9xa9q6Itgir0'
    ),
    body := jsonb_build_object('task','daily')
  ) AS request_id;
  $$
);

-- 매주 월요일 KST 05:00 = UTC 일요일 20:00 → '0 20 * * 0'
SELECT cron.schedule(
  'ingest-weekly-firecrawl',
  '0 20 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://project--9ba8150a-7373-4385-86ff-9c69e7e2800b.lovable.app/api/public/ingest/run',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYWZlZHhtZ2lseHhzamRhemRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MjQ5NjQsImV4cCI6MjA5MzEwMDk2NH0.akcOD9nc09GqlGbYNjGdJ0eYj3jJjXq9xa9q6Itgir0'
    ),
    body := jsonb_build_object('task','weekly')
  ) AS request_id;
  $$
);