
-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  birth_year INTEGER,
  region_sido TEXT,
  region_sigungu TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============= USER_ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============= COMMUNITY CATEGORIES =============
CREATE TABLE public.community_categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'rose',
  sort_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories viewable by everyone" ON public.community_categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.community_categories FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.community_categories (slug, name, description, tone, sort_order) VALUES
  ('free',    '자유게시판', '일상·취미·소소한 이야기',          'rose',  1),
  ('jobs',    '구인구직',   '시니어 일자리·단기 알바',          'amber', 2),
  ('legal',   '법률자문',   '전문가 답변, 상담 후기',           'sage',  3),
  ('welfare', '복지혜택',   '정부·지자체 지원, 신청 후기',       'rose',  4),
  ('news',    '새로운소식', '지역 뉴스·생활 정보',              'sage',  5),
  ('agency',  '대행업체',   '신뢰할 만한 업체 추천·후기',        'amber', 6);

-- ============= COMMUNITY POSTS =============
CREATE TABLE public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug TEXT NOT NULL REFERENCES public.community_categories(slug),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_posts_category ON public.community_posts(category_slug, created_at DESC);
CREATE INDEX idx_community_posts_author ON public.community_posts(author_id);
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts viewable by everyone" ON public.community_posts FOR SELECT USING (true);
CREATE POLICY "Auth users create posts" ON public.community_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update own posts" ON public.community_posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors delete own posts" ON public.community_posts FOR DELETE USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));

-- ============= COMMUNITY COMMENTS =============
CREATE TABLE public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_comments_post ON public.community_comments(post_id, created_at);
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by everyone" ON public.community_comments FOR SELECT USING (true);
CREATE POLICY "Auth users create comments" ON public.community_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update own comments" ON public.community_comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors delete own comments" ON public.community_comments FOR DELETE USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));

-- ============= POST LIKES =============
CREATE TABLE public.community_post_likes (
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes viewable by everyone" ON public.community_post_likes FOR SELECT USING (true);
CREATE POLICY "Users like" ON public.community_post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unlike" ON public.community_post_likes FOR DELETE USING (auth.uid() = user_id);

-- ============= TIMESTAMP TRIGGERS =============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= NEW USER HANDLER =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, birth_year, region_sido, region_sigungu, verified)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nickname', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data ->> 'birth_year', '')::INTEGER,
    NEW.raw_user_meta_data ->> 'region_sido',
    NEW.raw_user_meta_data ->> 'region_sigungu',
    COALESCE((NEW.raw_user_meta_data ->> 'verified')::BOOLEAN, false)
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
