CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_family_id uuid;
  new_nickname text;
  meta_phone text;
BEGIN
  new_nickname := COALESCE(NEW.raw_user_meta_data ->> 'nickname', split_part(NEW.email, '@', 1));
  meta_phone := NULLIF(NEW.raw_user_meta_data ->> 'phone', '');

  INSERT INTO public.profiles (id, nickname, birth_year, region_sido, region_sigungu, verified, phone, phone_verified_at)
  VALUES (
    NEW.id,
    new_nickname,
    NULLIF(NEW.raw_user_meta_data ->> 'birth_year', '')::INTEGER,
    NEW.raw_user_meta_data ->> 'region_sido',
    NEW.raw_user_meta_data ->> 'region_sigungu',
    COALESCE((NEW.raw_user_meta_data ->> 'verified')::BOOLEAN, false),
    meta_phone,
    CASE WHEN meta_phone IS NOT NULL THEN now() ELSE NULL END
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');

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
$function$;