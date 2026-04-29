import type { UserProfile } from '../objects/UserProfile'
import type { UserRole } from '../objects/UserRole'
import type { CreateUserProfileInput, UpdateUserProfileInput } from '../schemas/userProfile.schema'
import type { AssignUserRoleInput } from '../schemas/userRole.schema'

function notImplemented(): never {
  throw new Error('Not implemented')
}

export async function getProfileById(_id: string): Promise<UserProfile> {
  notImplemented()
}

export async function createProfile(
  _input: CreateUserProfileInput,
): Promise<UserProfile> {
  notImplemented()
}

export async function updateProfile(
  _input: UpdateUserProfileInput,
): Promise<UserProfile> {
  notImplemented()
}

export async function listRolesForUser(_userId: string): Promise<UserRole[]> {
  notImplemented()
}

export async function addUserRole(
  _input: AssignUserRoleInput,
): Promise<UserRole> {
  notImplemented()
}
