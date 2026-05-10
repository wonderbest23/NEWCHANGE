
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

  INSERT INTO public.family_members (family_id, user_id, role)
  SELECT inv.family_id, caller, inv.role
  WHERE NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = inv.family_id AND user_id = caller
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (caller, 'guardian')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.family_invites
    SET used_at = now(), used_by_user_id = caller
    WHERE id = inv.id;

  RETURN inv.family_id;
END;
$$;
