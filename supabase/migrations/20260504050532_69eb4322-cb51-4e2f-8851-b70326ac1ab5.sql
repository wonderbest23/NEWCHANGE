CREATE OR REPLACE FUNCTION public.accept_family_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  caller uuid := auth.uid();
  inviter_still_member boolean;
  caller_already_member boolean;
  mapped_user_role public.app_role;
BEGIN
  -- 1) 인증 필수
  IF caller IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다' USING ERRCODE = '28000';
  END IF;

  -- 2) 토큰 형식 기본 검증 (DoS 및 빈 토큰 방지)
  IF _token IS NULL OR length(_token) < 16 OR length(_token) > 256 THEN
    RAISE EXCEPTION '유효하지 않은 초대입니다' USING ERRCODE = '22023';
  END IF;

  -- 3) 초대 조회 (행 잠금)
  SELECT * INTO inv
  FROM public.family_invites
  WHERE token = _token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '유효하지 않은 초대입니다' USING ERRCODE = 'P0002';
  END IF;
  IF inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION '이미 사용된 초대입니다' USING ERRCODE = '22023';
  END IF;
  IF inv.expires_at < now() THEN
    RAISE EXCEPTION '만료된 초대입니다' USING ERRCODE = '22023';
  END IF;

  -- 4) 역할 화이트리스트 검증
  IF inv.role NOT IN ('primary_guardian', 'guardian', 'senior') THEN
    RAISE EXCEPTION '허용되지 않은 초대 역할입니다' USING ERRCODE = '22023';
  END IF;

  -- 5) 초대를 보낸 사용자가 여전히 해당 가족의 멤버여야 함 (소유권/유효성)
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = inv.family_id
      AND user_id   = inv.invited_by_user_id
  ) INTO inviter_still_member;

  IF NOT inviter_still_member THEN
    RAISE EXCEPTION '초대한 사용자가 더 이상 가족의 구성원이 아닙니다' USING ERRCODE = '22023';
  END IF;

  -- 6) 자기 자신을 초대한 경우 차단
  IF inv.invited_by_user_id = caller THEN
    RAISE EXCEPTION '자기 자신을 초대할 수 없습니다' USING ERRCODE = '22023';
  END IF;

  -- 7) 이미 멤버인 경우 초대만 소진하고 family_id 반환 (멱등)
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = inv.family_id
      AND user_id   = caller
  ) INTO caller_already_member;

  IF NOT caller_already_member THEN
    INSERT INTO public.family_members (family_id, user_id, role)
    VALUES (inv.family_id, caller, inv.role);
  END IF;

  -- 8) user_roles 매핑
  mapped_user_role := CASE
    WHEN inv.role IN ('primary_guardian', 'guardian') THEN 'guardian'::public.app_role
    WHEN inv.role = 'senior' THEN 'senior'::public.app_role
  END;

  IF mapped_user_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (caller, mapped_user_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- 9) 초대 소진
  UPDATE public.family_invites
     SET used_at = now(),
         used_by_user_id = caller
   WHERE id = inv.id;

  RETURN inv.family_id;
END;
$function$;

-- EXECUTE 권한 재확인: anon/public 차단, authenticated만 허용
REVOKE EXECUTE ON FUNCTION public.accept_family_invite(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_family_invite(text) TO authenticated;