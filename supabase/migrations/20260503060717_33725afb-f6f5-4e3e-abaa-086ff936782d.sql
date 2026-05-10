ALTER TABLE public.family_members DROP CONSTRAINT IF EXISTS family_members_role_check;
ALTER TABLE public.family_members ADD CONSTRAINT family_members_role_check
  CHECK (role = ANY (ARRAY['primary_guardian','secondary_guardian','partner','primary_senior','senior','guardian']));