-- 실제 업체 디렉터리 테이블
CREATE TABLE IF NOT EXISTS public.agencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- moving | nursing_hospital | hospital | caregiver | cleaning | funeral | hearing_aid | legal_tax
  sido TEXT NOT NULL DEFAULT '서울특별시',
  sigungu TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  hours TEXT,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  verified BOOLEAN NOT NULL DEFAULT false,
  source_name TEXT,
  source_url TEXT,
  rating NUMERIC(2,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agencies_category ON public.agencies(category);
CREATE INDEX IF NOT EXISTS idx_agencies_sigungu ON public.agencies(sigungu);

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

-- 모든 사용자(비로그인 포함)가 조회 가능
CREATE POLICY "Agencies are viewable by everyone"
ON public.agencies FOR SELECT
USING (true);

-- 관리자만 추가/수정/삭제
CREATE POLICY "Admins can insert agencies"
ON public.agencies FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update agencies"
ON public.agencies FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete agencies"
ON public.agencies FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_agencies_updated_at
BEFORE UPDATE ON public.agencies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
