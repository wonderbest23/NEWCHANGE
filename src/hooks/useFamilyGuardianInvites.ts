import { useQuery } from '@tanstack/react-query'
import { useAuthSession } from './useAuthSession'
import { useUiPermissions } from './useUiPermissions'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getFamilyGuardianInvites } from '../ontology/actions/getFamilyGuardianInvites'

export const familyGuardianInvitesQueryKey = (
  userId: string | undefined,
  familyGroupId: string | undefined,
) => ['family_guardian_invites', userId, familyGroupId] as const

export function useFamilyGuardianInvites(familyGroupId: string | undefined) {
  const { user, loading: sessionLoading } = useAuthSession()
  const perm = useUiPermissions()
  const configured = isSupabaseConfigured()

  return useQuery({
    queryKey: familyGuardianInvitesQueryKey(user?.id, familyGroupId),
    queryFn: () =>
      getFamilyGuardianInvites({ familyGroupId: familyGroupId! }, user!.id, perm.rolesForUi),
    enabled:
      configured &&
      !sessionLoading &&
      Boolean(user) &&
      Boolean(familyGroupId) &&
      perm.canUseGuardianFamilyActions,
  })
}
