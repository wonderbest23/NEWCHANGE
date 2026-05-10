
-- 꿀팁(시니어 가이드) 카테고리
CREATE TABLE public.tip_categories (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text,
  tone text NOT NULL DEFAULT 'rose',
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.tip_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tip categories viewable by everyone"
  ON public.tip_categories FOR SELECT USING (true);

CREATE POLICY "Admins manage tip categories"
  ON public.tip_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 초기 카테고리 시드
INSERT INTO public.tip_categories (slug, name, description, icon, tone, sort_order) VALUES
  ('kiosk', '키오스크', '음식점·카페·무인점포 주문', 'monitor', 'rose', 1),
  ('travel', '여행·예매', 'KTX·항공·숙소 예약', 'plane', 'amber', 2),
  ('ai', 'AI·스마트폰', 'ChatGPT·카톡·사진', 'sparkles', 'sky', 3),
  ('public', '병원·관공서·금융', '진료 예약·정부24·뱅킹', 'building-2', 'emerald', 4);

-- 꿀팁 본문
CREATE TABLE public.tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug text NOT NULL REFERENCES public.tip_categories(slug) ON DELETE RESTRICT,
  title text NOT NULL,
  summary text NOT NULL,
  cover_image_url text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{order, text, image_url, tip}]
  tags text[] NOT NULL DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  views integer NOT NULL DEFAULT 0,
  like_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX idx_tips_category ON public.tips(category_slug, is_published, published_at DESC);
CREATE INDEX idx_tips_pinned ON public.tips(pinned, published_at DESC) WHERE is_published = true;

ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published tips viewable by everyone"
  ON public.tips FOR SELECT
  USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert tips"
  ON public.tips FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update tips"
  ON public.tips FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete tips"
  ON public.tips FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_tips_updated_at
  BEFORE UPDATE ON public.tips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 좋아요 (도움됐어요)
CREATE TABLE public.tip_likes (
  tip_id uuid NOT NULL REFERENCES public.tips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tip_id, user_id)
);

ALTER TABLE public.tip_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tip likes viewable by everyone"
  ON public.tip_likes FOR SELECT USING (true);

CREATE POLICY "Users like tips"
  ON public.tip_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users unlike tips"
  ON public.tip_likes FOR DELETE
  USING (auth.uid() = user_id);

-- 좋아요 카운트 동기화 트리거
CREATE OR REPLACE FUNCTION public.tg_tip_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.tips SET like_count = like_count + 1 WHERE id = NEW.tip_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.tips SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.tip_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_tip_likes_count
  AFTER INSERT OR DELETE ON public.tip_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_tip_likes_count();

-- 조회수 증가 함수
CREATE OR REPLACE FUNCTION public.increment_tip_views(_tip_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.tips SET views = views + 1 WHERE id = _tip_id AND is_published = true;
$$;
