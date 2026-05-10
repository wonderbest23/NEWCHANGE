GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_primary_guardian(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_recipient(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_senior_of_family(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_family_ids()               TO authenticated;