-- Revoke EXECUTE on internal SECURITY DEFINER helpers (used only inside RLS / triggers)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_primary_guardian(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_recipient(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_senior_of_family(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_family_ids() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- accept_family_invite is called via RPC by logged-in users — keep authenticated only
REVOKE EXECUTE ON FUNCTION public.accept_family_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_family_invite(text) TO authenticated;