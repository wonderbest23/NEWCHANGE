-- health_checkins: 어르신별 최신순 + 기간 필터 조회
CREATE INDEX IF NOT EXISTS idx_health_checkins_senior_checkin_at
  ON public.health_checkins (senior_user_id, checkin_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_checkins_checkin_at
  ON public.health_checkins (checkin_at DESC);

-- anomaly_alerts: status='open' 카운트
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_status
  ON public.anomaly_alerts (status)
  WHERE status = 'open';

-- tips: 발행된 글 카테고리별 최신순
CREATE INDEX IF NOT EXISTS idx_tips_published_category_created
  ON public.tips (category_slug, created_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_tips_published_created
  ON public.tips (created_at DESC)
  WHERE is_published = true;

-- community posts: 카테고리별 최신순 (테이블 존재 시에만)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='community_posts') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_community_posts_category_created ON public.community_posts (category_slug, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_community_posts_created ON public.community_posts (created_at DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='community_comments') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_community_comments_post_created ON public.community_comments (post_id, created_at)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ask_logs') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ask_logs_user_created ON public.ask_logs (user_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ask_logs_created ON public.ask_logs (created_at DESC)';
  END IF;
END $$;