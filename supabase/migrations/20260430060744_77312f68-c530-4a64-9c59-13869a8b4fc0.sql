
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

  -- 데모 어드민 자동 부여
  IF NEW.email = 'admin@gyeot.app' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
