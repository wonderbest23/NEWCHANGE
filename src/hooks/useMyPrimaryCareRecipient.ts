import { useQuery } from '@tanstack/react-query'
import { useAuthSession } from './useAuthSession'
import { queryKeys } from '../lib/queryKeys'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getPrimaryCareRecipientForFamilyGroup } from '../ontology/repositories/careRecipient.repository'

/**
 * 지정한 가족 그룹에서 가장 먼저 등록된 care_recipient 1건(없으면 null).
 * RLS로 본인이 볼 수 있는 행만 반환.
 */
export function useMyPrimaryCareRecipient(familyGroupId: string | undefined) {
  const { user, loading: sessionLoading } = useAuthSession()
  const configured = isSupabaseConfigured()

  return useQuery({
    queryKey: queryKeys.primaryCareRecipient(familyGroupId),
    queryFn: () => getPrimaryCareRecipientForFamilyGroup(familyGroupId!),
    enabled:
      configured && !sessionLoading && Boolean(user) && Boolean(familyGroupId),
  })
}
