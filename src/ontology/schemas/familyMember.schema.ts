import { z } from 'zod'
import { uuidSchema } from './common'

const memberRole = z.enum(['guardian', 'senior'])

export const addFamilyMemberInputSchema = z.object({
  familyGroupId: uuidSchema,
  profileId: uuidSchema,
  memberRole,
  relationship: z.string().min(1).max(100).nullable().optional(),
})

export type AddFamilyMemberInput = z.infer<typeof addFamilyMemberInputSchema>

export const inviteGuardianInputSchema = z.object({
  familyGroupId: uuidSchema,
  email: z.string().email(),
  relationship: z.string().max(500).nullable().optional(),
})

export const acceptGuardianInviteInputSchema = z.object({
  inviteToken: z.string().min(1, '초대 링크가 올바르지 않아요.'),
})

export const getFamilyGuardianInvitesInputSchema = z.object({
  familyGroupId: uuidSchema,
})

export const getFamilyGuardianMembersInputSchema = z.object({
  familyGroupId: uuidSchema,
})

export const cancelFamilyGuardianInviteInputSchema = z.object({
  familyGroupId: uuidSchema,
  inviteId: uuidSchema,
})

export const removeFamilyGuardianMemberInputSchema = z.object({
  familyGroupId: uuidSchema,
  profileId: uuidSchema,
})

export const leaveFamilyGroupInputSchema = z.object({
  familyGroupId: uuidSchema,
})

export const deleteFamilyGroupInputSchema = z.object({
  familyGroupId: uuidSchema,
})

export type AcceptGuardianInviteInput = z.infer<typeof acceptGuardianInviteInputSchema>
export type GetFamilyGuardianInvitesInput = z.infer<typeof getFamilyGuardianInvitesInputSchema>
export type GetFamilyGuardianMembersInput = z.infer<typeof getFamilyGuardianMembersInputSchema>
export type CancelFamilyGuardianInviteInput = z.infer<typeof cancelFamilyGuardianInviteInputSchema>
export type RemoveFamilyGuardianMemberInput = z.infer<typeof removeFamilyGuardianMemberInputSchema>
export type LeaveFamilyGroupInput = z.infer<typeof leaveFamilyGroupInputSchema>
export type DeleteFamilyGroupInput = z.infer<typeof deleteFamilyGroupInputSchema>

export type InviteGuardianInput = z.infer<typeof inviteGuardianInputSchema>
