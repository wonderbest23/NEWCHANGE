import type { CareRecipient } from '../objects/CareRecipient'
import { getSupabaseClient } from '../../lib/supabaseClient'

function notImplemented(): never {
  throw new Error('Not implemented')
}

type CareRecipientRow = {
  id: string
  profile_id: string | null
  family_group_id: string
  emergency_note: string | null
  primary_guardian_id: string
  recipient_display_name: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: CareRecipientRow): CareRecipient {
  return {
    id: row.id,
    profileId: row.profile_id,
    familyGroupId: row.family_group_id,
    emergencyNote: row.emergency_note,
    primaryGuardianId: row.primary_guardian_id,
    recipientDisplayName: row.recipient_display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getCareRecipientById(_id: string): Promise<CareRecipient> {
  notImplemented()
}

/** RLS: 그룹 멤버·관리자만 해당 그룹의 수급자 행을 조회 */
export async function listCareRecipientsForFamilyGroup(
  familyGroupId: string,
): Promise<CareRecipient[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('care_recipients')
    .select(
      'id, profile_id, family_group_id, emergency_note, primary_guardian_id, recipient_display_name, created_at, updated_at',
    )
    .eq('family_group_id', familyGroupId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message || '돌봄 대상 목록을 불러오지 못했어요.')
  }

  return ((data ?? []) as CareRecipientRow[]).map(mapRow)
}

/** 같은 그룹에서 created_at 기준 첫 번째 수급자(없으면 null). */
export async function getPrimaryCareRecipientForFamilyGroup(
  familyGroupId: string,
): Promise<CareRecipient | null> {
  const list = await listCareRecipientsForFamilyGroup(familyGroupId)
  return list[0] ?? null
}

/** @deprecated listCareRecipientsForFamilyGroup 사용 */
export async function listRecipientsInGroup(familyGroupId: string): Promise<CareRecipient[]> {
  return listCareRecipientsForFamilyGroup(familyGroupId)
}

export type CreateCareRecipientInput = {
  familyGroupId: string
  primaryGuardianId: string
  profileId: string | null
  recipientDisplayName: string | null
  emergencyNote?: string | null
}

function mapInsertPrimaryCareRecipientRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('primary_guardian_id must match caller')) {
    return '로그인한 계정과 등록 주체가 맞지 않아요. 로그아웃 후 올바른 계정으로 다시 로그인해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('not a guardian in this family group')) {
    return '이 가족 그룹의 보호자만 돌봄 대상을 등록할 수 있어요. Supabase의 family_members에 guardian 행이 있는지 확인해 주세요.'
  }
  if (m.includes('already has a care recipient')) {
    return '이 가족 그룹에는 이미 돌봄 대상이 있어요.'
  }
  if (m.includes('recipient_display_name required')) {
    return '이름(표시명)을 입력해 주세요.'
  }
  return message || '돌봄 대상을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * DB RPC insert_primary_care_recipient — 그룹당 첫 수급자 등록(SECURITY DEFINER, 014).
 * profile_id 없이 등록하려면 005(recipient_display_name)가 적용되어 있어야 함.
 */
export async function createCareRecipient(input: CreateCareRecipientInput): Promise<CareRecipient> {
  const supabase = getSupabaseClient()

  const { data: authData, error: authUserErr } = await supabase.auth.getUser()
  const authUser = authData?.user
  if (authUserErr || !authUser) {
    throw new Error(
      '로그인 정보를 확인하지 못했어요. 로그아웃 후 다시 로그인한 뒤 돌봄 대상 등록을 시도해 주세요.',
    )
  }
  if (authUser.id !== input.primaryGuardianId) {
    throw new Error(
      '로그인한 계정과 등록 주체가 맞지 않아요. 로그아웃 후 올바른 계정으로 다시 로그인해 주세요.',
    )
  }

  const { data: newId, error: rpcError } = await supabase.rpc('insert_primary_care_recipient', {
    p_family_group_id: input.familyGroupId,
    p_primary_guardian_id: input.primaryGuardianId,
    p_profile_id: input.profileId,
    p_recipient_display_name: input.recipientDisplayName ?? '',
    p_emergency_note: input.emergencyNote ?? null,
  })

  if (rpcError) {
    throw new Error(mapInsertPrimaryCareRecipientRpcMessage(rpcError.message))
  }
  if (typeof newId !== 'string' || newId.length === 0) {
    throw new Error(
      '돌봄 대상 등록 RPC 결과가 비어 있어요. Supabase에 마이그레이션 014(insert_primary_care_recipient)이 적용되었는지 확인해 주세요.',
    )
  }

  const { data, error } = await supabase
    .from('care_recipients')
    .select(
      'id, profile_id, family_group_id, emergency_note, primary_guardian_id, recipient_display_name, created_at, updated_at',
    )
    .eq('id', newId)
    .single()

  if (error) {
    throw new Error(error.message || '등록된 돌봄 대상을 불러오지 못했어요.')
  }

  return mapRow(data as CareRecipientRow)
}

function mapReassignPrimaryGuardianRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('not a guardian in this family group')) {
    return '이 가족 그룹의 보호자만 주 보호자를 바꿀 수 있어요.'
  }
  if (m.includes('care recipient not found')) {
    return '돌봄 대상을 찾을 수 없어요. 목록을 새로고침한 뒤 다시 시도해 주세요.'
  }
  if (m.includes('does not belong to this family group')) {
    return '이 가족 그룹의 돌봄 대상이 아니에요.'
  }
  if (m.includes('profile not found') || m.includes('new primary guardian profile not found')) {
    return '선택한 보호자 프로필을 찾을 수 없어요.'
  }
  if (m.includes('new primary must be a guardian')) {
    return '주 보호자는 같은 그룹에 등록된 보호자만 지정할 수 있어요.'
  }
  return message || '주 보호자를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export type ReassignPrimaryGuardianRepoInput = {
  familyGroupId: string
  careRecipientId: string
  newPrimaryGuardianId: string
}

/**
 * DB RPC reassign_care_recipient_primary_guardian — primary_guardian_id 갱신(동일 값이면 no-op).
 */
export async function reassignPrimaryGuardian(input: ReassignPrimaryGuardianRepoInput): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('reassign_care_recipient_primary_guardian', {
    p_family_group_id: input.familyGroupId,
    p_care_recipient_id: input.careRecipientId,
    p_new_primary_guardian_id: input.newPrimaryGuardianId,
  })

  if (error) {
    throw new Error(mapReassignPrimaryGuardianRpcMessage(error.message))
  }
}

function mapDeleteCareRecipientRpcMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not authenticated')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.'
  }
  if (m.includes('profile missing')) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.'
  }
  if (m.includes('not a guardian in this family group')) {
    return '이 가족 그룹의 보호자만 돌봄 대상을 삭제할 수 있어요.'
  }
  if (m.includes('care recipient not found')) {
    return '돌봄 대상을 찾을 수 없어요. 목록을 새로고침한 뒤 다시 시도해 주세요.'
  }
  if (m.includes('does not belong to this family group')) {
    return '이 가족 그룹의 돌봄 대상이 아니에요.'
  }
  if (m.includes('only the first care recipient')) {
    return '지금은 그룹에서 가장 먼저 등록된 돌봄 대상만 삭제할 수 있어요.'
  }
  return message || '돌봄 대상을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export type DeleteCareRecipientRepoInput = {
  familyGroupId: string
  careRecipientId: string
}

/**
 * DB RPC delete_care_recipient — 그룹 보호자만, 해당 그룹 소속·첫 수급자만 삭제.
 */
export async function deleteCareRecipient(input: DeleteCareRecipientRepoInput): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('delete_care_recipient', {
    p_family_group_id: input.familyGroupId,
    p_care_recipient_id: input.careRecipientId,
  })

  if (error) {
    throw new Error(mapDeleteCareRecipientRpcMessage(error.message))
  }
}

/**
 * RLS: care_recipients_update — 그룹 보호자·primary_guardian·profile 본인 등.
 * recipient_display_name / emergency_note 만 갱신.
 */
export async function updateCareRecipientDisplayById(input: {
  careRecipientId: string
  recipientDisplayName: string
  emergencyNote: string | null
}): Promise<CareRecipient> {
  const supabase = getSupabaseClient()
  const label = input.recipientDisplayName.trim()
  const { data, error } = await supabase
    .from('care_recipients')
    .update({
      recipient_display_name: label.length > 0 ? label : null,
      emergency_note: input.emergencyNote,
    })
    .eq('id', input.careRecipientId)
    .select(
      'id, profile_id, family_group_id, emergency_note, primary_guardian_id, recipient_display_name, created_at, updated_at',
    )
    .single()

  if (error) {
    throw new Error(error.message || '돌봄 대상 정보를 수정하지 못했어요.')
  }

  return mapRow(data as CareRecipientRow)
}
