import { useQuery } from '@tanstack/react-query'
import { useAuthSession } from './useAuthSession'
import { useUiPermissions } from './useUiPermissions'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getFamilyGuardianMembers } from '../ontology/actions/getFamilyGuardianMembers'

export const familyGuardianMembersQueryKey = (
  userId: string | undefined,
  familyGroupId: string | undefined,
) => ['family_guardian_members', userId, familyGroupId] as const

export function useFamilyGuardianMembers(familyGroupId: string | undefined) {
  const { user, loading: sessionLoading } = useAuthSession()
  const perm = useUiPermissions()
  const configured = isSupabaseConfigured()

  return useQuery({
    queryKey: familyGuardianMembersQueryKey(user?.id, familyGroupId),
    queryFn: () =>
      getFamilyGuardianMembers({ familyGroupId: familyGroupId! }, user!.id, perm.rolesForUi),
    enabled:
      configured &&
      !sessionLoading &&
      Boolean(user) &&
      Boolean(familyGroupId) &&
      perm.canUseGuardianFamilyActions,
  })
}
