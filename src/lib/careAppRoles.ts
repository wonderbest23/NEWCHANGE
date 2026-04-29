/**
 * public.user_roles.role CHECK 와 맞춤. 역할 기반 리다이렉트·가드는 후속 단계.
 */
export const CARE_APP_ROLES = [
  'guardian',
  'senior',
  'admin',
  'partner',
] as const

export type CareAppRole = (typeof CARE_APP_ROLES)[number]

export function isCareAppRole(x: string): x is CareAppRole {
  return (CARE_APP_ROLES as readonly string[]).includes(x)
}
