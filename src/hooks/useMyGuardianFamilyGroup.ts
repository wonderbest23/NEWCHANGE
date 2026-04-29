import { useQuery } from '@tanstack/react-query'
import { useAuthSession } from './useAuthSession'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getMyFamilyGroup } from '../ontology/actions/getMyFamilyGroup'

export const myGuardianFamilyGroupQueryKey = (userId: string | undefined) =>
  ['my_guardian_family_group', userId] as const

export function useMyGuardianFamilyGroup() {
  const { user, loading: sessionLoading } = useAuthSession()
  const configured = isSupabaseConfigured()

  return useQuery({
    queryKey: myGuardianFamilyGroupQueryKey(user?.id),
    queryFn: () => getMyFamilyGroup(user!.id),
    enabled: configured && !sessionLoading && Boolean(user),
  })
}
