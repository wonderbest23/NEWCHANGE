
-- 1) family_invites 테이블
CREATE TABLE public.family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by_user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'guardian',
  display_label text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  used_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_invites_token ON public.family_invites(token);
CREATE INDEX idx_family_invites_family ON public.family_invites(family_id);

ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

-- 시니어(가족 멤버)만 자기 가족의 초대 조회/생성
CREATE POLICY family_invites_select ON public.family_invites
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.user_family_ids()));

CREATE POLICY family_invites_insert ON public.family_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by_user_id = auth.uid()
    AND family_id IN (SELECT public.user_family_ids())
  );

CREATE POLICY family_invites_delete ON public.family_invites
  FOR DELETE TO authenticated
  USING (invited_by_user_id = auth.uid());

-- 2) 가입 시 자동으로 본인 가족 + primary_senior 멤버십 + senior 역할 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_family_id uuid;
  new_nickname text;
BEGIN
  new_nickname := COALESCE(NEW.raw_user_meta_data ->> 'nickname', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, nickname, birth_year, region_sido, region_sigungu, verified)
  VALUES (
    NEW.id,
    new_nickname,
    NULLIF(NEW.raw_user_meta_data ->> 'birth_year', '')::INTEGER,
    NEW.raw_user_meta_data ->> 'region_sido',
    NEW.raw_user_meta_data ->> 'region_sigungu',
    COALESCE((NEW.raw_user_meta_data ->> 'verified')::BOOLEAN, false)
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');

  -- 초대 토큰 없이 가입한 경우(=시니어): 본인 가족 그룹 + 본인 시니어 멤버십 + senior 역할
  IF (NEW.raw_user_meta_data ->> 'invite_token') IS NULL
     OR (NEW.raw_user_meta_data ->> 'invite_token') = '' THEN

    INSERT INTO public.families (name)
    VALUES (new_nickname || '님의 가족')
    RETURNING id INTO new_family_id;

    INSERT INTO public.family_members (family_id, user_id, role, display_name, email)
    VALUES (new_family_id, NEW.id, 'primary_senior', new_nickname, NEW.email);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'senior')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF NEW.email = 'admin@gyeot.app' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- auth.users 트리거가 이미 있는지 확인하지 않으므로 안전하게 보장
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) 초대 수락 함수 (security definer로 RLS 우회)
CREATE OR REPLACE FUNCTION public.accept_family_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT * INTO inv FROM public.family_invites WHERE token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION '유효하지 않은 초대입니다';
  END IF;
  IF inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION '이미 사용된 초대입니다';
  END IF;
  IF inv.expires_at < now() THEN
    RAISE EXCEPTION '만료된 초대입니다';
  END IF;

  -- 멤버십 추가 (이미 멤버면 무시)
  INSERT INTO public.family_members (family_id, user_id, role, display_label_ignored)
  SELECT inv.family_id, caller, inv.role, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = inv.family_id AND user_id = caller
  );

  -- guardian 역할 부여
  INSERT INTO public.user_roles (user_id, role)
  VALUES (caller, 'guardian')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.family_invites
    SET used_at = now(), used_by_user_id = caller
    WHERE id = inv.id;

  RETURN inv.family_id;
END;
$$;
