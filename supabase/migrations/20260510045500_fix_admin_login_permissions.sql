-- Fix admin login/routing prerequisites.
-- 1) Restore required privileges for role lookup table.
-- 2) Ensure has_role can be executed in RLS contexts.
-- 3) Guarantee admin@test.com has admin app role.

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'admin@test.com'
ON CONFLICT (user_id, role) DO NOTHING;
