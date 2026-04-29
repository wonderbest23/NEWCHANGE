import type { FamilyGuardianMemberSummary } from '../objects/FamilyGuardianMember'
import type { FamilyGuardianInviteSummary } from '../objects/FamilyGuardianInvite'
import type { FamilyGroup } from '../objects/FamilyGroup'
import type { FamilyMember } from '../objects/FamilyMember'
import type { AddFamilyMemberInput, InviteGuardianInput } from '../schemas/familyMember.schema'
import type { CreateFamilyGroupBootstrapInput } from '../schemas/familyGroup.schema'
import type { CreateFamilyGroupInput, UpdateFamilyGroupInput } from '../schemas/familyGroup.schema'
import { getSupabaseClient } from '../../lib/supabaseClient'

function notImplemented(): never {
  throw new Error('Not implemented')
}

function mapRpcErrorMessage(message: string): string {
  if (message.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (message.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도하거나 고객 지원에 문의해 주세요.'
  }
  if (message.includes('name required')) {
    return '가족 이름을 입력해 주세요.'
  }
  if (message.includes('name too long')) {
    return '가족 이름은 200자 이하로 입력해 주세요.'
  }
  if (message.includes('relationship too long')) {
    return '관계 설명은 500자 이하로 입력해 주세요.'
  }
  return message || '가족 그룹을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function mapGuardianInviteCreateRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('not a guardian')) {
    return '이 가족 그룹에서 보호자만 초대를 만들 수 있어요.'
  }
  if (m.includes('invited email required') || m.includes('invalid email')) {
    return '초대할 이메일 주소를 확인해 주세요.'
  }
  if (m.includes('cannot invite your own')) {
    return '본인 이메일로는 초대를 보낼 수 없어요.'
  }
  if (m.includes('already a guardian in this group')) {
    return '이미 이 그룹 보호자로 등록된 이메일이에요.'
  }
  if (m.includes('pending invite already exists')) {
    return '같은 이메일로 아직 유효한 초대가 있어요. 만료되기 전까지 기다리거나 운영에 문의해 주세요.'
  }
  if (m.includes('duplicate key') || m.includes('unique')) {
    return '같은 이메일로 이미 초대가 있거나 충돌이 났어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('relationship too long')) {
    return '관계 설명은 500자 이하로 입력해 주세요.'
  }
  return message || '초대 링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function mapGuardianInviteAcceptRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('token required')) {
    return '초대 링크가 올바르지 않아요.'
  }
  if (m.includes('invalid or unknown token')) {
    return '초대 링크가 잘못됐거나 찾을 수 없어요.'
  }
  if (m.includes('already used')) {
    return '이미 사용된 초대예요. 새 초대를 요청해 주세요.'
  }
  if (m.includes('expired')) {
    return '초대가 만료됐어요. 새 초대를 요청해 주세요.'
  }
  if (m.includes('email does not match')) {
    return '지금 로그인한 계정 이메일이 초대받은 주소와 달라요. 초대받은 이메일로 로그인해 주세요.'
  }
  if (m.includes('already a guardian in this group')) {
    return '이미 이 가족 그룹의 보호자로 등록되어 있어요.'
  }
  return message || '초대를 수락하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function mapGuardianInviteCancelRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('not found')) {
    return '초대를 찾을 수 없어요. 목록을 새로고침한 뒤 다시 시도해 주세요.'
  }
  if (m.includes('not a guardian')) {
    return '이 가족 그룹의 보호자만 초대를 취소할 수 있어요.'
  }
  if (m.includes('already used') || m.includes('finalized')) {
    return '이미 수락된 초대는 취소할 수 없어요.'
  }
  return message || '초대를 취소하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function mapRemoveFamilyGuardianMemberRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('target is not a guardian')) {
    return '이 보호자를 이 그룹에서 찾을 수 없어요. 목록을 새로고침한 뒤 다시 시도해 주세요.'
  }
  if (m.includes('not a guardian in this family group')) {
    return '이 가족 그룹의 보호자만 멤버를 제거할 수 있어요.'
  }
  if (m.includes('cannot remove self')) {
    return '본인은 이 화면에서 그룹에서 빼지 못해요.'
  }
  if (m.includes('at least two guardians')) {
    return '보호자가 두 명 이상일 때만 다른 보호자를 그룹에서 뺄 수 있어요.'
  }
  if (m.includes('primary guardian')) {
    return '이 보호자는 돌봄 대상의 주 보호자로 지정되어 있어서 뺄 수 없어요. 먼저 주 보호자를 바꾼 뒤 시도해 주세요.'
  }
  return message || '보호자를 그룹에서 빼지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export type CreateFamilyGuardianInviteRepoInput = {
  familyGroupId: string
  invitedEmail: string
  relationship?: string | null
}

/**
 * DB RPC create_family_guardian_invite — invite_id + invite_token 1회 반환.
 */
export async function createFamilyGuardianInvite(
  input: CreateFamilyGuardianInviteRepoInput,
): Promise<{ inviteId: string; inviteToken: string }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('create_family_guardian_invite', {
    p_family_group_id: input.familyGroupId,
    p_invited_email: input.invitedEmail.trim(),
    p_relationship: input.relationship ?? null,
  })

  if (error) {
    throw new Error(mapGuardianInviteCreateRpcMessage(error.message))
  }

  const row = Array.isArray(data) ? data[0] : data
  const inviteId = row?.invite_id ?? row?.inviteId
  const inviteToken = row?.invite_token ?? row?.inviteToken
  if (inviteId == null || typeof inviteId !== 'string' || inviteToken == null || typeof inviteToken !== 'string') {
    throw new Error('초대 응답이 올바르지 않아요.')
  }

  return { inviteId, inviteToken }
}

/**
 * DB RPC accept_family_guardian_invite — 수락 후 family_group_id 반환.
 */
export async function acceptFamilyGuardianInvite(inviteToken: string): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('accept_family_guardian_invite', {
    p_invite_token: inviteToken.trim(),
  })

  if (error) {
    throw new Error(mapGuardianInviteAcceptRpcMessage(error.message))
  }

  if (data == null || typeof data !== 'string') {
    throw new Error('초대 수락 응답이 올바르지 않아요.')
  }

  return data
}

/**
 * DB RPC cancel_family_guardian_invite — 대기 중(consumed_at null) 초대 행 삭제.
 */
export async function cancelFamilyGuardianInvite(inviteId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('cancel_family_guardian_invite', {
    p_invite_id: inviteId,
  })

  if (error) {
    throw new Error(mapGuardianInviteCancelRpcMessage(error.message))
  }
}

export type RemoveFamilyGuardianMemberRepoInput = {
  familyGroupId: string
  profileId: string
}

/**
 * DB RPC remove_family_guardian_member — family_members guardian 삭제, 필요 시 user_roles 정리.
 */
export async function removeFamilyGuardianMember(input: RemoveFamilyGuardianMemberRepoInput): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('remove_family_guardian_member', {
    p_family_group_id: input.familyGroupId,
    p_profile_id: input.profileId,
  })

  if (error) {
    throw new Error(mapRemoveFamilyGuardianMemberRpcMessage(error.message))
  }
}

function mapLeaveFamilyGroupRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('not a guardian in this family group')) {
    return '이 가족 그룹의 보호자만 나갈 수 있어요.'
  }
  if (m.includes('cannot leave as last guardian')) {
    return '다른 보호자가 더 있어야 이 그룹에서 나갈 수 있어요.'
  }
  if (m.includes('primary guardian')) {
    return '주 보호자로 지정된 상태에서는 나갈 수 없어요. 먼저 주 보호자를 넘긴 뒤 시도해 주세요.'
  }
  return message || '그룹에서 나가지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * DB RPC leave_family_group — 본인 guardian family_members 행 삭제, 필요 시 user_roles 정리.
 */
export async function leaveFamilyGroup(familyGroupId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('leave_family_group', {
    p_family_group_id: familyGroupId,
  })

  if (error) {
    throw new Error(mapLeaveFamilyGroupRpcMessage(error.message))
  }
}

function mapDeleteFamilyGroupRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('not a guardian in this family group')) {
    return '이 가족 그룹의 보호자만 그룹을 삭제할 수 있어요.'
  }
  if (m.includes('exactly one guardian')) {
    return '보호자가 본인만 남았을 때만 가족 그룹을 삭제할 수 있어요.'
  }
  if (m.includes('sole guardian')) {
    return '마지막 보호자만 그룹을 삭제할 수 있어요.'
  }
  if (m.includes('care recipients exist')) {
    return '돌봄 대상이 등록된 그룹은 삭제할 수 없어요.'
  }
  return message || '가족 그룹을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * DB RPC delete_family_group — 마지막 보호자만, 수급자 없을 때 그룹 삭제; 필요 시 user_roles 정리.
 */
export async function deleteFamilyGroup(familyGroupId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('delete_family_group', {
    p_family_group_id: familyGroupId,
  })

  if (error) {
    throw new Error(mapDeleteFamilyGroupRpcMessage(error.message))
  }
}

type FamilyInviteRow = {
  id: string
  invited_email: string
  relationship: string | null
  expires_at: string
  consumed_at: string | null
  consumed_by_profile_id: string | null
  created_at: string
}

/**
 * RLS: 동일 그룹 보호자·초대 생성자·admin 만 조회.
 * token_hash 등 민감 필드는 select 하지 않음.
 */
export async function listFamilyGuardianInvites(
  familyGroupId: string,
): Promise<FamilyGuardianInviteSummary[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('family_invites')
    .select(
      'id, invited_email, relationship, expires_at, consumed_at, consumed_by_profile_id, created_at',
    )
    .eq('family_group_id', familyGroupId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message || '보호자 초대 목록을 불러오지 못했어요.')
  }

  const rows = (data ?? []) as FamilyInviteRow[]
  return rows.map((row) => ({
    id: row.id,
    invitedEmail: row.invited_email,
    relationship: row.relationship,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    consumedByProfileId: row.consumed_by_profile_id,
    createdAt: row.created_at,
  }))
}

type GuardianMemberRow = {
  id: string
  profile_id: string
  member_role: string
  relationship: string | null
  created_at: string
  profiles: { display_name: string | null } | { display_name: string | null }[] | null
}

/**
 * RLS: 동일 그룹 family_member 면 조회 가능. profiles 는 같은 그룹이면 select 허용.
 */
export async function listGuardianMembersForFamilyGroup(
  familyGroupId: string,
): Promise<FamilyGuardianMemberSummary[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('family_members')
    .select(
      `id,
      profile_id,
      member_role,
      relationship,
      created_at,
      profiles ( display_name )`,
    )
    .eq('family_group_id', familyGroupId)
    .eq('member_role', 'guardian')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message || '보호자 멤버 목록을 불러오지 못했어요.')
  }

  const rows = (data ?? []) as GuardianMemberRow[]
  return rows.map((row) => {
    const embedded = row.profiles
    const prof = Array.isArray(embedded) ? embedded[0] : embedded
    const rawName = prof?.display_name?.trim()
    return {
      id: row.id,
      profileId: row.profile_id,
      memberRole: 'guardian' as const,
      relationship: row.relationship,
      displayName: rawName && rawName.length > 0 ? rawName : null,
      createdAt: row.created_at,
    }
  })
}

export async function createFamilyGroupBootstrap(
  input: CreateFamilyGroupBootstrapInput,
): Promise<FamilyGroup> {
  const supabase = getSupabaseClient()
  const { data: groupId, error: rpcError } = await supabase.rpc(
    'create_family_group_bootstrap',
    {
      p_name: input.name,
      p_relationship: input.relationship ?? null,
    },
  )

  if (rpcError) {
    throw new Error(mapRpcErrorMessage(rpcError.message))
  }

  if (groupId == null || typeof groupId !== 'string') {
    throw new Error('가족 그룹 생성 응답이 올바르지 않아요.')
  }

  const { data: row, error: fetchError } = await supabase
    .from('family_groups')
    .select('id, name, created_by, created_at, updated_at')
    .eq('id', groupId)
    .single()

  if (fetchError || !row) {
    throw new Error(
      fetchError?.message
        ? `그룹은 생성됐지만 정보를 불러오지 못했어요: ${fetchError.message}`
        : '그룹은 생성됐지만 정보를 불러오지 못했어요.',
    )
  }

  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getFamilyGroupById(_id: string): Promise<FamilyGroup> {
  notImplemented()
}

type FamilyGroupRow = {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
}

type FamilyMemberWithGroupRow = {
  family_group_id: string
  family_groups: FamilyGroupRow | FamilyGroupRow[] | null
}

/**
 * RLS: family_members / family_groups select 정책으로 본인이 속한 행만 반환.
 * guardian 역할 멤버십으로 연결된 family_groups 목록(중복 그룹 id 제거, created_at 내림차순).
 */
export async function listGuardianFamilyGroupsForProfile(
  profileId: string,
): Promise<FamilyGroup[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('family_members')
    .select(
      `family_group_id,
      family_groups (
        id,
        name,
        created_by,
        created_at,
        updated_at
      )`,
    )
    .eq('profile_id', profileId)
    .eq('member_role', 'guardian')

  if (error) {
    throw new Error(error.message || '가족 그룹 목록을 불러오지 못했어요.')
  }

  const rows = (data ?? []) as FamilyMemberWithGroupRow[]
  const byId = new Map<string, FamilyGroup>()

  for (const row of rows) {
    const embedded = row.family_groups
    const g = Array.isArray(embedded) ? embedded[0] : embedded
    if (!g) continue
    byId.set(g.id, {
      id: g.id,
      name: g.name,
      createdBy: g.created_by,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    })
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export async function listFamilyGroupsForUser(userId: string): Promise<FamilyGroup[]> {
  return listGuardianFamilyGroupsForProfile(userId)
}

export async function createGroup(
  _input: CreateFamilyGroupInput,
): Promise<FamilyGroup> {
  notImplemented()
}

export async function updateGroup(
  _input: UpdateFamilyGroupInput,
): Promise<FamilyGroup> {
  notImplemented()
}

export async function listMembers(
  _familyGroupId: string,
): Promise<FamilyMember[]> {
  notImplemented()
}

export async function addMember(
  _input: AddFamilyMemberInput,
): Promise<FamilyMember> {
  notImplemented()
}

/** @deprecated createFamilyGuardianInvite 사용 */
export async function sendGuardianInvite(
  _input: InviteGuardianInput,
): Promise<void> {
  notImplemented()
}
