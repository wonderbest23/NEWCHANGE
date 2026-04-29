import { useQuery } from '@tanstack/react-query'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient'
import { useAuthSession } from './useAuthSession'
import { type CareAppRole, isCareAppRole } from '../lib/careAppRoles'

function parseRoles(rows: { role: string }[] | null): CareAppRole[] {
  if (!rows) return []
  return rows
    .map((r) => r.role)
    .filter((r): r is CareAppRole => isCareAppRole(r))
}

/** 세션·역할 조회 단계(역할별 리다이렉트는 붙이지 않음) */
export type UserRolesStatus =
  | 'session_loading'
  | 'unauthenticated'
  | 'roles_loading'
  | 'roles_ready'

/**
 * public.user_roles 읽기 전용(본인 행, RLS user_roles_select). insert/update 없음.
 * 역할 리다이렉트·가드는 이후 단계—여기서는 데이터만 조회.
 */
export function useUserRoles() {
  const { user, loading: sessionLoading } = useAuthSession()
  const configured = isSupabaseConfigured()
  const rolesQueryEnabled =
    configured && !sessionLoading && user != null

  const query = useQuery({
    queryKey: ['user_roles', user?.id],
    enabled: rolesQueryEnabled,
    queryFn: async () => {
      if (!user) return [] as CareAppRole[]
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
      if (error) throw error
      return parseRoles(data)
    },
  })

  const isRolesLoading =
    rolesQueryEnabled &&
    !query.isSuccess &&
    !query.isError &&
    (query.fetchStatus === 'fetching' || query.fetchStatus === 'idle')

  let status: UserRolesStatus
  if (!configured) {
    status = 'unauthenticated'
  } else if (sessionLoading) {
    status = 'session_loading'
  } else if (!user) {
    status = 'unauthenticated'
  } else if (isRolesLoading) {
    status = 'roles_loading'
  } else {
    status = 'roles_ready'
  }

  const roles: CareAppRole[] = query.isSuccess && query.data != null ? query.data : []

  const hasAnyRole = roles.length > 0
  const hasResolvedNoRoles =
    rolesQueryEnabled && query.isSuccess && roles.length === 0

  return {
    status,
    roles,
    hasAnyRole,
    hasResolvedNoRoles,
    isRolesLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
