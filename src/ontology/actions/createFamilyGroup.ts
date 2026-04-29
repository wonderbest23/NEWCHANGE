import type { FamilyGroup } from '../objects/FamilyGroup'
import type { CareAppRole } from '../../lib/careAppRoles'
import {
  createFamilyGroupBootstrapInputSchema,
  type CreateFamilyGroupBootstrapInput,
} from '../schemas/familyGroup.schema'
import { checkGuardianFamilyOnboardingNavigation } from '../rules/permission.rules'
import { createFamilyGroupBootstrap } from '../repositories/family.repository'

/**
 * 가족 그룹 부트스트랩(RPC). 수급자·초대는 포함하지 않음.
 */
export async function createFamilyGroup(
  raw: unknown,
  roles: readonly CareAppRole[],
): Promise<FamilyGroup> {
  const perm = checkGuardianFamilyOnboardingNavigation(roles)
  if (!perm.ok) {
    throw new Error(perm.userMessage)
  }

  const input: CreateFamilyGroupBootstrapInput =
    createFamilyGroupBootstrapInputSchema.parse(raw)

  return createFamilyGroupBootstrap(input)
}
