import { useState, type FormEvent, type MouseEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/common/Card'
import { StatusBadge } from '../../components/common/StatusBadge'
import { Button } from '../../components/common/Button'
import { useAuthSession } from '../../hooks/useAuthSession'
import {
  familyGuardianInvitesQueryKey,
  useFamilyGuardianInvites,
} from '../../hooks/useFamilyGuardianInvites'
import { useFamilyGuardianMembers, familyGuardianMembersQueryKey } from '../../hooks/useFamilyGuardianMembers'
import { useMyGuardianFamilyGroup, myGuardianFamilyGroupQueryKey } from '../../hooks/useMyGuardianFamilyGroup'
import { useMyPrimaryCareRecipient } from '../../hooks/useMyPrimaryCareRecipient'
import { useUiPermissions } from '../../hooks/useUiPermissions'
import {
  careMockAlerts,
  careMockGuardian,
  careMockNextSteps,
  careMockToday,
} from '../../mocks/careMock'
import { consumeActionPermission } from '../../lib/actionPermissionFeedback'
import { DEFAULT_POST_LOGIN_PATH } from '../../lib/authPaths'
import { dayStartLabel, formatDateLabel } from '../../lib/date'
import { queryKeys } from '../../lib/queryKeys'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { SupabaseConnectionDevPanel } from '../../components/dev/SupabaseConnectionDevPanel'
import { buildGuardianInviteAcceptUrl } from '../../lib/guardianInviteLink'
import { inviteGuardian } from '../../ontology/actions/inviteGuardian'
import { cancelFamilyGuardianInvite } from '../../ontology/actions/cancelFamilyGuardianInvite'
import { removeFamilyGuardianMember } from '../../ontology/actions/removeFamilyGuardianMember'
import { leaveFamilyGroup } from '../../ontology/actions/leaveFamilyGroup'
import { deleteFamilyGroup } from '../../ontology/actions/deleteFamilyGroup'
import { deleteCareRecipient } from '../../ontology/actions/deleteCareRecipient'
import { reassignPrimaryGuardian } from '../../ontology/actions/reassignPrimaryGuardian'
import type { FamilyGuardianInviteSummary } from '../../ontology/objects/FamilyGuardianInvite'
import type { GuardianInviteResult } from '../../ontology/objects/GuardianInvite'
import { checkGuardianFamilyOnboardingNavigation } from '../../ontology/rules/permission.rules'
import {
  Bell,
  MapPin,
  Pill,
  UserPlus,
  HeartHandshake,
} from 'lucide-react'

function guardianInviteRowStatus(row: FamilyGuardianInviteSummary): 'accepted' | 'pending' | 'expired' {
  if (row.consumedAt != null) return 'accepted'
  const expiresMs = Date.parse(row.expiresAt)
  if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) return 'expired'
  return 'pending'
}

export function GuardianDashboardPage() {
  const today = new Date()
  const { user } = useAuthSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const perm = useUiPermissions()
  const configured = isSupabaseConfigured()
  const {
    data: myFamilyGroup,
    isPending: familyGroupLoading,
    isError: familyGroupError,
    error: familyGroupErr,
  } = useMyGuardianFamilyGroup()
  const invitesQuery = useFamilyGuardianInvites(myFamilyGroup?.id)
  const guardianMembersQuery = useFamilyGuardianMembers(myFamilyGroup?.id)
  const {
    data: primaryCareRecipient,
    isPending: primaryRecipientLoading,
    isError: primaryRecipientError,
    error: primaryRecipientErr,
  } = useMyPrimaryCareRecipient(myFamilyGroup?.id)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRelationship, setInviteRelationship] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteErr, setInviteErr] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<GuardianInviteResult | null>(null)
  const [inviteCopyOk, setInviteCopyOk] = useState(false)
  const [inviteCancelBusyId, setInviteCancelBusyId] = useState<string | null>(null)
  const [inviteCancelErr, setInviteCancelErr] = useState<string | null>(null)
  const [memberRemoveBusyProfileId, setMemberRemoveBusyProfileId] = useState<string | null>(null)
  const [memberRemoveErr, setMemberRemoveErr] = useState<string | null>(null)
  const [primaryReassignSelectedProfileId, setPrimaryReassignSelectedProfileId] = useState('')
  const [primaryReassignBusy, setPrimaryReassignBusy] = useState(false)
  const [primaryReassignErr, setPrimaryReassignErr] = useState<string | null>(null)
  const [leaveGroupBusy, setLeaveGroupBusy] = useState(false)
  const [leaveGroupErr, setLeaveGroupErr] = useState<string | null>(null)
  const [deleteGroupBusy, setDeleteGroupBusy] = useState(false)
  const [deleteGroupErr, setDeleteGroupErr] = useState<string | null>(null)
  const [deleteRecipientBusy, setDeleteRecipientBusy] = useState(false)
  const [deleteRecipientErr, setDeleteRecipientErr] = useState<string | null>(null)

  async function handleCancelGuardianInvite(inviteId: string) {
    if (!user || !myFamilyGroup) return
    setInviteCancelErr(null)
    setInviteCancelBusyId(inviteId)
    try {
      await cancelFamilyGuardianInvite(
        { familyGroupId: myFamilyGroup.id, inviteId },
        user.id,
        perm.rolesForUi,
      )
      void queryClient.invalidateQueries({
        queryKey: familyGuardianInvitesQueryKey(user.id, myFamilyGroup.id),
      })
    } catch (err) {
      setInviteCancelErr(err instanceof Error ? err.message : '초대를 취소하지 못했어요.')
    } finally {
      setInviteCancelBusyId(null)
    }
  }

  async function handleRemoveGuardianMember(profileId: string, label: string) {
    if (!user || !myFamilyGroup) return
    const ok = window.confirm(
      `「${label}」 보호자를 이 가족 그룹에서 뺄까요? 되돌리려면 다시 초대해야 해요.`,
    )
    if (!ok) return
    setMemberRemoveErr(null)
    setMemberRemoveBusyProfileId(profileId)
    try {
      await removeFamilyGuardianMember(
        { familyGroupId: myFamilyGroup.id, profileId },
        user.id,
        perm.rolesForUi,
      )
      void queryClient.invalidateQueries({
        queryKey: familyGuardianMembersQueryKey(user.id, myFamilyGroup.id),
      })
    } catch (err) {
      setMemberRemoveErr(err instanceof Error ? err.message : '보호자를 그룹에서 빼지 못했어요.')
    } finally {
      setMemberRemoveBusyProfileId(null)
    }
  }

  async function handlePrimaryReassignSubmit() {
    if (!user || !myFamilyGroup || !primaryCareRecipient) return
    setPrimaryReassignErr(null)
    if (!primaryReassignSelectedProfileId) {
      setPrimaryReassignErr('변경할 보호자를 선택해 주세요.')
      return
    }
    setPrimaryReassignBusy(true)
    try {
      await reassignPrimaryGuardian(
        {
          familyGroupId: myFamilyGroup.id,
          careRecipientId: primaryCareRecipient.id,
          newPrimaryGuardianId: primaryReassignSelectedProfileId,
        },
        user.id,
        perm.rolesForUi,
      )
      setPrimaryReassignSelectedProfileId('')
      void queryClient.invalidateQueries({
        queryKey: queryKeys.primaryCareRecipient(myFamilyGroup.id),
      })
      void queryClient.invalidateQueries({
        queryKey: familyGuardianMembersQueryKey(user.id, myFamilyGroup.id),
      })
    } catch (err) {
      setPrimaryReassignErr(
        err instanceof Error ? err.message : '주 보호자를 바꾸지 못했어요.',
      )
    } finally {
      setPrimaryReassignBusy(false)
    }
  }

  async function handleLeaveFamilyGroup() {
    if (!user || !myFamilyGroup) return
    const ok = window.confirm(
      '이 가족 그룹에서 나갈까요? 나간 뒤에는 다시 초대받거나 온보딩으로 들어와야 해요.',
    )
    if (!ok) return
    setLeaveGroupErr(null)
    setDeleteGroupErr(null)
    setLeaveGroupBusy(true)
    try {
      await leaveFamilyGroup({ familyGroupId: myFamilyGroup.id }, user.id, perm.rolesForUi)
      void queryClient.invalidateQueries({ queryKey: myGuardianFamilyGroupQueryKey(user.id) })
      void queryClient.invalidateQueries({ queryKey: ['user_roles', user.id] })
      void queryClient.invalidateQueries({
        queryKey: familyGuardianInvitesQueryKey(user.id, myFamilyGroup.id),
      })
      void queryClient.invalidateQueries({
        queryKey: familyGuardianMembersQueryKey(user.id, myFamilyGroup.id),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.primaryCareRecipient(myFamilyGroup.id),
      })
      void navigate(DEFAULT_POST_LOGIN_PATH, { replace: true })
    } catch (err) {
      setLeaveGroupErr(err instanceof Error ? err.message : '그룹에서 나가지 못했어요.')
    } finally {
      setLeaveGroupBusy(false)
    }
  }

  async function handleDeleteFamilyGroup() {
    if (!user || !myFamilyGroup) return
    const ok = window.confirm(
      '가족 그룹을 완전히 삭제할까요? 되돌릴 수 없으며, 초대·멤버십·그룹 정보가 모두 사라져요. 돌봄 대상이 없고 보호자가 본인만일 때만 가능해요.',
    )
    if (!ok) return
    setDeleteGroupErr(null)
    setLeaveGroupErr(null)
    setDeleteGroupBusy(true)
    try {
      await deleteFamilyGroup({ familyGroupId: myFamilyGroup.id }, user.id, perm.rolesForUi)
      void queryClient.invalidateQueries({ queryKey: myGuardianFamilyGroupQueryKey(user.id) })
      void queryClient.invalidateQueries({ queryKey: ['user_roles', user.id] })
      void queryClient.invalidateQueries({
        queryKey: familyGuardianInvitesQueryKey(user.id, myFamilyGroup.id),
      })
      void queryClient.invalidateQueries({
        queryKey: familyGuardianMembersQueryKey(user.id, myFamilyGroup.id),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.primaryCareRecipient(myFamilyGroup.id),
      })
      void navigate(DEFAULT_POST_LOGIN_PATH, { replace: true })
    } catch (err) {
      setDeleteGroupErr(err instanceof Error ? err.message : '가족 그룹을 삭제하지 못했어요.')
    } finally {
      setDeleteGroupBusy(false)
    }
  }

  async function handleDeleteCareRecipient() {
    if (!user || !myFamilyGroup || !primaryCareRecipient) return
    const ok = window.confirm(
      '등록된 돌봄 대상을 삭제할까요? 되돌릴 수 없으며, 이 대상에 연결된 기록이 있으면 함께 정리될 수 있어요.',
    )
    if (!ok) return
    setDeleteRecipientErr(null)
    setDeleteRecipientBusy(true)
    try {
      await deleteCareRecipient(
        {
          familyGroupId: myFamilyGroup.id,
          careRecipientId: primaryCareRecipient.id,
        },
        user.id,
        perm.rolesForUi,
      )
      setPrimaryReassignErr(null)
      setPrimaryReassignSelectedProfileId('')
      void queryClient.invalidateQueries({
        queryKey: queryKeys.primaryCareRecipient(myFamilyGroup.id),
      })
    } catch (err) {
      setDeleteRecipientErr(
        err instanceof Error ? err.message : '돌봄 대상을 삭제하지 못했어요.',
      )
    } finally {
      setDeleteRecipientBusy(false)
    }
  }

  function handlePrefillInviteFromRow(row: FamilyGuardianInviteSummary) {
    setInviteEmail(row.invitedEmail)
    setInviteRelationship(row.relationship?.trim() ? row.relationship.trim() : '')
    setInviteErr(null)
    setInviteCancelErr(null)
    setInviteResult(null)
    setInviteCopyOk(false)
  }

  async function handleCreateGuardianInvite(e: FormEvent) {
    e.preventDefault()
    if (!user || !myFamilyGroup) return
    setInviteErr(null)
    setInviteCopyOk(false)
    setInviteCancelErr(null)
    setMemberRemoveErr(null)
    setPrimaryReassignErr(null)
    setLeaveGroupErr(null)
    setDeleteGroupErr(null)
    setDeleteRecipientErr(null)
    setInviteBusy(true)
    try {
      const r = await inviteGuardian(
        {
          familyGroupId: myFamilyGroup.id,
          email: inviteEmail,
          relationship: inviteRelationship.trim() ? inviteRelationship.trim() : undefined,
        },
        user.id,
        perm.rolesForUi,
      )
      setInviteResult(r)
      void queryClient.invalidateQueries({
        queryKey: familyGuardianInvitesQueryKey(user.id, myFamilyGroup.id),
      })
    } catch (err) {
      setInviteErr(err instanceof Error ? err.message : '초대 링크를 만들지 못했어요.')
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleCopyInviteLink() {
    if (!inviteResult) return
    const url = buildGuardianInviteAcceptUrl(inviteResult.inviteToken)
    try {
      await navigator.clipboard.writeText(url)
      setInviteCopyOk(true)
      setInviteErr(null)
    } catch {
      setInviteCopyOk(false)
      setInviteErr('클립보드 복사에 실패했어요. 링크를 직접 선택해 복사해 주세요.')
    }
  }

  function guardOnboardingNav(e: MouseEvent) {
    const r = checkGuardianFamilyOnboardingNavigation(perm.rolesForUi)
    if (!consumeActionPermission(r, setActionNotice)) {
      e.preventDefault()
    }
  }

  const guardiansCount = guardianMembersQuery.data?.length ?? 0
  const isPrimaryForRecipient = Boolean(
    primaryCareRecipient && user?.id && primaryCareRecipient.primaryGuardianId === user.id,
  )
  const canLeaveFamilyGroup =
    perm.canUseGuardianFamilyActions &&
    !guardianMembersQuery.isPending &&
    guardiansCount >= 2 &&
    !isPrimaryForRecipient

  const canDeleteFamilyGroup =
    perm.canUseGuardianFamilyActions &&
    !guardianMembersQuery.isPending &&
    !primaryRecipientLoading &&
    guardiansCount === 1 &&
    primaryCareRecipient == null

  const pendingInviteCount =
    invitesQuery.data?.filter((row) => guardianInviteRowStatus(row) === 'pending').length ?? 0

  const groupStatusLine = familyGroupLoading
    ? '불러오는 중…'
    : familyGroupError
      ? '불러오지 못함'
      : myFamilyGroup
        ? `있음 · ${myFamilyGroup.name}`
        : '없음'

  const recipientStatusLine =
    !myFamilyGroup || familyGroupLoading
      ? '—'
      : primaryRecipientLoading
        ? '불러오는 중…'
        : primaryRecipientError
          ? '불러오지 못함'
          : primaryCareRecipient
            ? `있음 · ${
                primaryCareRecipient.recipientDisplayName?.trim() ||
                (primaryCareRecipient.profileId ? '등록됨' : '이름 미입력')
              }`
            : '없음'

  const guardiansStatusLine =
    !myFamilyGroup || familyGroupLoading
      ? '—'
      : guardianMembersQuery.isPending
        ? '불러오는 중…'
        : guardianMembersQuery.isError
          ? '불러오지 못함'
          : `${guardiansCount}명`

  const primaryGuardianStatusLine = (() => {
    if (!myFamilyGroup || familyGroupLoading) return '—'
    if (primaryRecipientLoading) return '불러오는 중…'
    if (primaryRecipientError) return '불러오지 못함'
    if (!primaryCareRecipient) return '돌봄 대상 없음'
    if (guardianMembersQuery.isPending) return '불러오는 중…'
    const m = guardianMembersQuery.data?.find(
      (r) => r.profileId === primaryCareRecipient.primaryGuardianId,
    )
    const n = m?.displayName?.trim()
    if (n && n.length > 0) return n
    if (m) return '이름 미등록'
    return '목록에 없음'
  })()

  const groupDeleteStatusLine = familyGroupLoading
    ? '확인 중…'
    : familyGroupError || !myFamilyGroup
      ? '—'
      : canDeleteFamilyGroup
        ? '예 · 아래 카드에서 삭제 가능'
        : '아니오'

  const collaborationRecommendedAction = ((): string => {
    if (familyGroupLoading) {
      return '잠시만요, 가족 그룹 정보를 불러오는 중이에요.'
    }
    if (familyGroupError) {
      return '가족 그룹을 불러오지 못했어요. 아래 「내 가족 그룹」카드의 안내를 확인해 주세요.'
    }
    if (!myFamilyGroup) {
      return perm.canUseGuardianFamilyActions
        ? '가족 그룹이 없어요. 온보딩에서 가족 그룹을 만들면 협업을 시작할 수 있어요.'
        : '보호자 권한이 있으면 가족 그룹을 만들 수 있어요.'
    }
    if (guardianMembersQuery.isPending) {
      return '함께하는 보호자 수를 확인하는 중이에요.'
    }
    if (primaryRecipientLoading) {
      return '돌봄 대상 정보를 확인하는 중이에요.'
    }
    if (canDeleteFamilyGroup) {
      return '가족 그룹을 완전히 삭제할 수 있는 상태예요. 아래 「내 가족 그룹」카드 맨 아래에서 진행해 주세요.'
    }
    if (!primaryCareRecipient && perm.canUseGuardianFamilyActions) {
      return '돌봄 대상이 없어요. 온보딩에서 등록하면 돌봄 준비를 이어갈 수 있어요.'
    }
    if (guardiansCount === 1 && perm.canUseGuardianFamilyActions && pendingInviteCount > 0) {
      return '보낸 초대가 수락되기를 기다리는 중이에요. 아래에서 초대 현황을 확인해 주세요.'
    }
    if (guardiansCount === 1 && perm.canUseGuardianFamilyActions) {
      return '다른 보호자를 초대하면 함께 돌볼 수 있어요. 아래에서 초대 링크를 만들 수 있어요.'
    }
    return '가족 협업 설정이 갖춰진 편이에요. 필요하면 아래 카드에서 세부 작업을 이어가 주세요.'
  })()

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-care-muted">
          {dayStartLabel(today)} · {careMockGuardian.parentDisplayName}님
        </p>
        <h1 className="mt-1 text-2xl font-bold text-care-ink sm:text-3xl">
          오늘의 돌봄 한눈에
        </h1>
        {actionNotice && (
          <p
            className="mt-2 text-sm text-rose-700"
            role="alert"
          >
            {actionNotice}
          </p>
        )}
      </div>

      {configured && (
        <>
          <Card className="border-stone-200 bg-stone-50/90 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-care-ink">가족 협업 · 현재 상태</h2>
            <p className="mt-1 text-xs text-care-muted">
              아래 상세 카드와 같은 데이터를 요약했어요. 버튼은 기존 위치에서 그대로 사용하면 돼요.
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-stone-200/80 bg-white/80 px-3 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-care-muted">
                  가족 그룹
                </dt>
                <dd className="mt-0.5 font-medium text-care-ink">{groupStatusLine}</dd>
              </div>
              <div className="rounded-lg border border-stone-200/80 bg-white/80 px-3 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-care-muted">
                  돌봄 대상(첫 등록)
                </dt>
                <dd className="mt-0.5 font-medium text-care-ink">{recipientStatusLine}</dd>
              </div>
              <div className="rounded-lg border border-stone-200/80 bg-white/80 px-3 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-care-muted">
                  함께하는 보호자
                </dt>
                <dd className="mt-0.5 font-medium text-care-ink">{guardiansStatusLine}</dd>
              </div>
              <div className="rounded-lg border border-stone-200/80 bg-white/80 px-3 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-care-muted">
                  주 보호자
                </dt>
                <dd className="mt-0.5 font-medium text-care-ink">{primaryGuardianStatusLine}</dd>
              </div>
              <div className="rounded-lg border border-stone-200/80 bg-white/80 px-3 py-2.5 sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-care-muted">
                  그룹 완전 삭제 가능
                </dt>
                <dd className="mt-0.5 font-medium text-care-ink">{groupDeleteStatusLine}</dd>
                <p className="mt-1 text-xs text-care-muted">
                  보호자가 본인만 있고 돌봄 대상이 없을 때만 가능해요.
                </p>
              </div>
              <div className="rounded-lg border border-rose-100/80 bg-rose-50/40 px-3 py-2.5 sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-rose-900/80">
                  다음으로 하면 좋아요
                </dt>
                <dd className="mt-1 text-sm text-care-ink">{collaborationRecommendedAction}</dd>
              </div>
            </dl>
          </Card>
          <Card className="border-stone-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-care-ink">내 가족 그룹</h2>
          {familyGroupLoading && (
            <p className="mt-2 text-sm text-care-muted">불러오는 중…</p>
          )}
          {familyGroupError && (
            <p
              className="mt-2 text-sm text-rose-700"
              role="alert"
            >
              {familyGroupErr instanceof Error
                ? familyGroupErr.message
                : '가족 그룹을 불러오지 못했어요.'}
            </p>
          )}
          {!familyGroupLoading && !familyGroupError && myFamilyGroup && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-medium text-care-ink">{myFamilyGroup.name}</p>
                <StatusBadge tone="success">생성 완료</StatusBadge>
              </div>
              <p className="text-sm text-care-muted">
                등록일 {formatDateLabel(myFamilyGroup.createdAt)} · 아래에서 다른 보호자를 초대할 수
                있어요(링크 복사).
              </p>
              {leaveGroupErr ? (
                <p
                  className="text-sm text-rose-700"
                  role="alert"
                >
                  {leaveGroupErr}
                </p>
              ) : null}
              {deleteGroupErr ? (
                <p
                  className="text-sm text-rose-700"
                  role="alert"
                >
                  {deleteGroupErr}
                </p>
              ) : null}
              {perm.canUseGuardianFamilyActions ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  {canLeaveFamilyGroup ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full border-amber-200 text-amber-900 sm:w-auto"
                      disabled={leaveGroupBusy}
                      onClick={() => void handleLeaveFamilyGroup()}
                    >
                      {leaveGroupBusy ? '처리 중…' : '이 가족 그룹에서 나가기'}
                    </Button>
                  ) : null}
                  {perm.canUseGuardianFamilyActions &&
                  !guardianMembersQuery.isPending &&
                  guardianMembersQuery.data &&
                  !canLeaveFamilyGroup ? (
                    <p className="text-xs text-care-muted sm:max-w-md sm:text-right">
                      {guardiansCount < 2
                        ? '다른 보호자가 더 있어야 이 그룹에서 나갈 수 있어요.'
                        : '주 보호자로 지정된 상태에서는 먼저 주 보호자를 넘긴 뒤 나갈 수 있어요.'}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 border-t border-stone-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-care-muted">
                  돌봄 대상(첫 등록)
                </p>
                {primaryRecipientLoading && (
                  <p className="mt-1 text-sm text-care-muted">불러오는 중…</p>
                )}
                {primaryRecipientError && (
                  <p
                    className="mt-1 text-sm text-rose-700"
                    role="alert"
                  >
                    {primaryRecipientErr instanceof Error
                      ? primaryRecipientErr.message
                      : '돌봄 대상을 불러오지 못했어요.'}
                  </p>
                )}
                {!primaryRecipientLoading && !primaryRecipientError && primaryCareRecipient && (
                  <div className="mt-2 space-y-2">
                    {deleteRecipientErr ? (
                      <p
                        className="text-sm text-rose-700"
                        role="alert"
                      >
                        {deleteRecipientErr}
                      </p>
                    ) : null}
                    <p className="text-sm text-care-ink">
                      <span className="font-medium">{primaryCareRecipient.recipientDisplayName}</span>
                      <span className="text-care-muted"> · 등록됨</span>
                    </p>
                    <p className="text-xs text-care-muted">
                      주 보호자:{' '}
                      <span className="font-medium text-care-ink">
                        {(() => {
                          const m = guardianMembersQuery.data?.find(
                            (r) => r.profileId === primaryCareRecipient.primaryGuardianId,
                          )
                          const n = m?.displayName?.trim()
                          if (n && n.length > 0) return n
                          if (m) return '이름 미등록'
                          return '목록에 없음'
                        })()}
                      </span>
                    </p>
                    {primaryCareRecipient.emergencyNote ? (
                      <p className="text-xs text-care-muted line-clamp-2">
                        비고: {primaryCareRecipient.emergencyNote}
                      </p>
                    ) : null}
                    {perm.canUseGuardianFamilyActions &&
                    guardianMembersQuery.data &&
                    guardianMembersQuery.data.length >= 2 &&
                    !guardianMembersQuery.isPending ? (
                      <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                        <p className="text-xs font-medium text-care-ink">주 보호자 변경</p>
                        <p className="mt-1 text-xs text-care-muted">
                          보호자가 두 명 이상일 때만 바꿀 수 있어요. 변경 후에는 이전 주 보호자를 그룹에서
                          뺄 수 있어요.
                        </p>
                        {primaryReassignErr ? (
                          <p
                            className="mt-2 text-xs text-rose-700"
                            role="alert"
                          >
                            {primaryReassignErr}
                          </p>
                        ) : null}
                        <label
                          htmlFor="primary-reassign-guardian"
                          className="mt-2 block text-xs font-medium text-care-ink"
                        >
                          새 주 보호자
                        </label>
                        <select
                          id="primary-reassign-guardian"
                          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          value={primaryReassignSelectedProfileId}
                          disabled={primaryReassignBusy}
                          onChange={(e) => {
                            setPrimaryReassignErr(null)
                            setPrimaryReassignSelectedProfileId(e.target.value)
                          }}
                        >
                          <option value="">선택…</option>
                          {guardianMembersQuery.data
                            .filter((r) => r.profileId !== primaryCareRecipient.primaryGuardianId)
                            .map((r) => (
                              <option
                                key={r.profileId}
                                value={r.profileId}
                              >
                                {r.displayName?.trim() ? r.displayName.trim() : '이름 미등록'}
                              </option>
                            ))}
                        </select>
                        <Button
                          type="button"
                          variant="secondary"
                          className="mt-2 w-full sm:w-auto"
                          disabled={
                            primaryReassignBusy ||
                            guardianMembersQuery.data.filter(
                              (r) => r.profileId !== primaryCareRecipient.primaryGuardianId,
                            ).length === 0
                          }
                          onClick={() => void handlePrimaryReassignSubmit()}
                        >
                          {primaryReassignBusy ? '처리 중…' : '주 보호자로 적용'}
                        </Button>
                      </div>
                    ) : null}
                    {perm.canUseGuardianFamilyActions ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          asChild
                          variant="secondary"
                          className="w-full sm:w-auto"
                        >
                          <Link
                            to="/onboarding#onboarding-care-recipient"
                            onClick={guardOnboardingNav}
                          >
                            이름·비고 수정
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full border-rose-300 text-rose-900 sm:w-auto"
                          disabled={deleteRecipientBusy}
                          onClick={() => void handleDeleteCareRecipient()}
                        >
                          {deleteRecipientBusy ? '처리 중…' : '돌봄 대상 삭제'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
                {!primaryRecipientLoading && !primaryRecipientError && !primaryCareRecipient && (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-care-muted">아직 돌봄 대상이 없어요.</p>
                    {perm.canUseGuardianFamilyActions ? (
                      <Button
                        asChild
                        variant="secondary"
                      >
                        <Link
                          to="/onboarding"
                          onClick={guardOnboardingNav}
                        >
                          온보딩에서 등록
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="mt-3 border-t border-stone-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-care-muted">
                  함께하는 보호자
                </p>
                <p className="mt-1 text-xs text-care-muted">
                  이 가족 그룹에 등록된 보호자예요. 초대를 수락한 분도 여기에 표시돼요.
                </p>
                {memberRemoveErr ? (
                  <p
                    className="mt-2 text-sm text-rose-700"
                    role="alert"
                  >
                    {memberRemoveErr}
                  </p>
                ) : null}
                {perm.canUseGuardianFamilyActions ? (
                  guardianMembersQuery.isPending ? (
                    <p className="mt-2 text-sm text-care-muted">불러오는 중…</p>
                  ) : guardianMembersQuery.isError ? (
                    <p
                      className="mt-2 text-sm text-rose-700"
                      role="alert"
                    >
                      {guardianMembersQuery.error instanceof Error
                        ? guardianMembersQuery.error.message
                        : '보호자 목록을 불러오지 못했어요.'}
                    </p>
                  ) : (guardianMembersQuery.data?.length ?? 0) === 0 ? (
                    <p className="mt-2 text-sm text-care-muted">
                      아직 함께하는 보호자가 없어요. 가족 그룹이 막 만들어졌다면 잠시 후 다시 확인해
                      주세요.
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-stone-50/50">
                      {guardianMembersQuery.data!.map((row) => {
                        const isSelf = Boolean(user?.id && row.profileId === user.id)
                        const nameLine = isSelf
                          ? '나'
                          : row.displayName && row.displayName.length > 0
                            ? row.displayName
                            : '이름 미등록'
                        const canOfferRemoveOther =
                          (guardianMembersQuery.data?.length ?? 0) >= 2 && !isSelf
                        return (
                          <li
                            key={row.id}
                            className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-2 text-care-ink">
                                <span className="font-medium">{nameLine}</span>
                                {isSelf ? (
                                  <StatusBadge tone="neutral">본인</StatusBadge>
                                ) : null}
                              </p>
                              <p className="text-xs text-care-muted">
                                관계: {row.relationship?.trim() ? row.relationship : '—'} · 합류{' '}
                                {formatDateLabel(row.createdAt)}
                              </p>
                            </div>
                            {canOfferRemoveOther ? (
                              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="whitespace-nowrap text-xs"
                                  disabled={memberRemoveBusyProfileId !== null}
                                  onClick={() =>
                                    void handleRemoveGuardianMember(row.profileId, nameLine)
                                  }
                                >
                                  {memberRemoveBusyProfileId === row.profileId
                                    ? '처리 중…'
                                    : '그룹에서 빼기'}
                                </Button>
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )
                ) : (
                  <p className="mt-2 text-xs text-care-muted">
                    보호자 목록은 보호자 역할이 있거나 역할이 아직 없는 계정에서만 볼 수 있어요.
                  </p>
                )}
              </div>
              <div className="mt-3 border-t border-stone-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-care-muted">
                  다른 보호자 초대
                </p>
                <p className="mt-1 text-xs text-care-muted">
                  이메일 자동 발송은 하지 않아요. 링크를 복사해 카톡·문자 등으로 보내 주세요. 초대받은
                  분은 그 이메일로 가입/로그인한 뒤 링크를 열어야 해요. 취소한 초대는 목록에서 사라지며,
                  같은 이메일로 다시 만들 수 있어요. 만료된 초대는 아래에서 「폼에 넣기」로
                  이메일만 채운 뒤 링크를 다시 만들면 돼요.
                </p>
                {perm.canUseGuardianFamilyActions ? (
                  inviteResult ? (
                    <div className="mt-3 space-y-2">
                      <p
                        className="text-sm text-emerald-800"
                        role="status"
                      >
                        초대 링크가 만들어졌어요.
                      </p>
                      <label
                        htmlFor="guardian-invite-url"
                        className="block text-xs font-medium text-care-ink"
                      >
                        수락 링크
                      </label>
                      <textarea
                        id="guardian-invite-url"
                        readOnly
                        rows={3}
                        className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-xs text-care-ink"
                        value={buildGuardianInviteAcceptUrl(inviteResult.inviteToken)}
                      />
                      {inviteCopyOk ? (
                        <p className="text-xs text-emerald-700">클립보드에 복사했어요.</p>
                      ) : null}
                      {inviteErr ? (
                        <p
                          className="text-xs text-rose-700"
                          role="alert"
                        >
                          {inviteErr}
                        </p>
                      ) : null}
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="primary"
                          className="flex-1"
                          onClick={() => void handleCopyInviteLink()}
                        >
                          링크 복사
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="flex-1"
                          onClick={() => {
                            setInviteResult(null)
                            setInviteErr(null)
                            setInviteCopyOk(false)
                          }}
                        >
                          다시 만들기
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={(e) => void handleCreateGuardianInvite(e)}
                    >
                      <div>
                        <label
                          htmlFor="guardian-invite-email"
                          className="block text-sm font-medium text-care-ink"
                        >
                          초대할 보호자 이메일
                        </label>
                        <input
                          id="guardian-invite-email"
                          name="inviteEmail"
                          type="email"
                          autoComplete="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          placeholder="예: sibling@example.com"
                          required
                          disabled={inviteBusy}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="guardian-invite-relationship"
                          className="block text-sm font-medium text-care-ink"
                        >
                          나와의 관계 (선택)
                        </label>
                        <input
                          id="guardian-invite-relationship"
                          name="inviteRelationship"
                          type="text"
                          value={inviteRelationship}
                          onChange={(e) => setInviteRelationship(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          placeholder="예: 오빠"
                          maxLength={500}
                          disabled={inviteBusy}
                        />
                      </div>
                      {inviteErr ? (
                        <p
                          className="text-sm text-rose-700"
                          role="alert"
                        >
                          {inviteErr}
                        </p>
                      ) : null}
                      <Button
                        type="submit"
                        variant="primary"
                        className="w-full"
                        disabled={inviteBusy}
                      >
                        {inviteBusy ? '만드는 중…' : '초대 링크 만들기'}
                      </Button>
                    </form>
                  )
                ) : (
                  <p className="mt-2 text-xs text-care-muted">
                    초대는 보호자 역할이 있거나 역할이 아직 없는 계정에서만 만들 수 있어요.
                  </p>
                )}
                {perm.canUseGuardianFamilyActions ? (
                  <div className="mt-4 border-t border-stone-100 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-care-muted">
                      보호자 초대 현황
                    </p>
                    {inviteCancelErr ? (
                      <p
                        className="mt-2 text-sm text-rose-700"
                        role="alert"
                      >
                        {inviteCancelErr}
                      </p>
                    ) : null}
                    {invitesQuery.isPending ? (
                      <p className="mt-2 text-sm text-care-muted">불러오는 중…</p>
                    ) : invitesQuery.isError ? (
                      <p
                        className="mt-2 text-sm text-rose-700"
                        role="alert"
                      >
                        {invitesQuery.error instanceof Error
                          ? invitesQuery.error.message
                          : '초대 목록을 불러오지 못했어요.'}
                      </p>
                    ) : (invitesQuery.data?.length ?? 0) === 0 ? (
                      <p className="mt-2 text-sm text-care-muted">
                        아직 초대한 보호자가 없어요. 위에서 링크를 만들면 여기에 표시돼요.
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-stone-50/50">
                        {invitesQuery.data!.map((row) => {
                          const st = guardianInviteRowStatus(row)
                          return (
                            <li
                              key={row.id}
                              className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-care-ink">{row.invitedEmail}</p>
                                <p className="text-xs text-care-muted">
                                  관계: {row.relationship?.trim() ? row.relationship : '—'} · 초대일{' '}
                                  {formatDateLabel(row.createdAt)} · 만료{' '}
                                  {formatDateLabel(row.expiresAt)}
                                </p>
                              </div>
                              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                                {st === 'accepted' ? (
                                  <StatusBadge tone="success">수락됨</StatusBadge>
                                ) : null}
                                {st === 'pending' ? (
                                  <>
                                    <StatusBadge tone="neutral">대기중</StatusBadge>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      className="whitespace-nowrap text-xs"
                                      disabled={inviteCancelBusyId !== null}
                                      onClick={() => void handleCancelGuardianInvite(row.id)}
                                    >
                                      {inviteCancelBusyId === row.id ? '취소 중…' : '취소'}
                                    </Button>
                                  </>
                                ) : null}
                                {st === 'expired' ? (
                                  <>
                                    <StatusBadge tone="warning">만료됨</StatusBadge>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      className="whitespace-nowrap text-xs"
                                      disabled={inviteBusy || inviteCancelBusyId !== null}
                                      onClick={() => handlePrefillInviteFromRow(row)}
                                    >
                                      폼에 넣기
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      className="whitespace-nowrap text-xs"
                                      disabled={inviteCancelBusyId !== null}
                                      onClick={() => void handleCancelGuardianInvite(row.id)}
                                    >
                                      {inviteCancelBusyId === row.id ? '취소 중…' : '목록에서 지우기'}
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
              {perm.canUseGuardianFamilyActions ? (
                <div className="mt-4 border-t border-rose-200/80 pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-rose-900/90">
                    가족 그룹 삭제
                  </p>
                  <p className="mt-1 text-xs text-care-muted">
                    보호자가 본인만 있고 돌봄 대상이 없을 때만 그룹 전체를 없앨 수 있어요. 삭제하면 되돌릴 수
                    없으며, 초대·멤버십·그룹 정보가 함께 사라져요.
                  </p>
                  {canDeleteFamilyGroup ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-2 w-full border-rose-400 bg-white text-rose-950 sm:w-auto"
                      disabled={deleteGroupBusy}
                      onClick={() => void handleDeleteFamilyGroup()}
                    >
                      {deleteGroupBusy ? '처리 중…' : '가족 그룹 완전히 삭제'}
                    </Button>
                  ) : null}
                  {perm.canUseGuardianFamilyActions &&
                  !guardianMembersQuery.isPending &&
                  myFamilyGroup &&
                  !canDeleteFamilyGroup &&
                  guardianMembersQuery.data ? (
                    <p className="mt-2 text-xs text-care-muted">
                      {guardiansCount !== 1
                        ? '보호자가 본인만 남았을 때만 그룹을 삭제할 수 있어요. 다른 분은 먼저 그룹에서 나가게 해 주세요.'
                        : primaryRecipientLoading
                          ? '돌봄 대상 등록 여부를 확인하는 중이에요.'
                          : primaryCareRecipient
                            ? '돌봄 대상이 등록된 그룹은 삭제할 수 없어요.'
                            : null}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {!familyGroupLoading && !familyGroupError && !myFamilyGroup && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-care-muted">
                아직 가족 그룹이 없어요. 온보딩에서 이름을 정하면 그룹이 만들어져요.
              </p>
              {perm.canUseGuardianFamilyActions ? (
                <Button
                  asChild
                  variant="primary"
                >
                  <Link
                    to="/onboarding"
                    onClick={guardOnboardingNav}
                  >
                    가족 그룹 만들기
                  </Link>
                </Button>
              ) : (
                <p className="text-xs text-care-muted">
                  가족 그룹 만들기는 보호자 역할이 있거나 역할이 아직 없는 계정에서 할 수 있어요.
                </p>
              )}
            </div>
          )}
        </Card>
        </>
      )}

      <Card className="border-rose-100 bg-gradient-to-br from-rose-50/80 to-white p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-care-ink">오늘 부모님 상태</h2>
            <ul className="mt-3 space-y-2 text-care-muted">
              <li>
                안부:{' '}
                {careMockToday.checkInDone ? (
                  <StatusBadge tone="success">응답 완료</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">대기</StatusBadge>
                )}
              </li>
              <li>기분: {careMockToday.mood}</li>
              <li>오전 약: {careMockToday.morningMeds === 'complete' ? '완료' : '—'}</li>
              <li>최근 위치(동의 시): {careMockToday.lastLocation}</li>
              <li>
                위험 알림:{' '}
                {careMockToday.risk === 'none' ? (
                  <StatusBadge tone="success">없음</StatusBadge>
                ) : (
                  <StatusBadge tone="danger">확인 필요</StatusBadge>
                )}
              </li>
            </ul>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {perm.canUseGuardianFamilyActions ? (
              <Button
                asChild
                variant="primary"
              >
                <Link
                  to="/onboarding"
                  onClick={guardOnboardingNav}
                >
                  부모님 등록/추가
                </Link>
              </Button>
            ) : (
              <p className="max-w-xs text-right text-xs text-care-muted">
                가족 등록은 보호자 역할이 있을 때 이용할 수 있어요.
              </p>
            )}
            <p className="text-xs text-care-muted">
              실제 기록·위치는 추후 RLS·동의 흐름에서 연동합니다.
            </p>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-care-ink">빠른 메뉴</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {perm.canUseGuardianFamilyActions ? (
            <Link
              to="/onboarding"
              className="block h-full min-h-[120px]"
              onClick={guardOnboardingNav}
            >
              <Card className="flex h-full flex-col p-4 transition hover:border-rose-200">
                <HeartHandshake
                  className="h-6 w-6 text-rose-600"
                  aria-hidden
                />
                <span className="mt-2 font-medium text-care-ink">가족 온보딩</span>
              </Card>
            </Link>
          ) : (
            <div className="min-h-[120px]">
              <Card className="flex h-full flex-col p-4 opacity-75">
                <HeartHandshake
                  className="h-6 w-6 text-stone-400"
                  aria-hidden
                />
                <span className="mt-2 text-sm text-care-muted">온보딩은 보호자 전용이에요</span>
              </Card>
            </div>
          )}
          {perm.showGuardianExtendedUi ? (
            <>
              <div className="min-h-[120px]">
                <Card className="flex h-full flex-col p-4 opacity-90">
                  <Pill
                    className="h-6 w-6 text-rose-600"
                    aria-hidden
                  />
                  <span className="mt-2 font-medium text-care-ink">약 일정 (준비 중)</span>
                </Card>
              </div>
              <div className="min-h-[120px]">
                <Card className="flex h-full flex-col p-4 opacity-90">
                  <MapPin
                    className="h-6 w-6 text-rose-600"
                    aria-hidden
                  />
                  <span className="mt-2 font-medium text-care-ink">위치 (준비 중)</span>
                </Card>
              </div>
              <div className="min-h-[120px]">
                <Card className="flex h-full flex-col p-4 opacity-90">
                  <Bell
                    className="h-6 w-6 text-rose-600"
                    aria-hidden
                  />
                  <span className="mt-2 font-medium text-care-ink">알림 (준비 중)</span>
                </Card>
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 lg:col-span-3">
              <Card className="p-4 text-sm text-care-muted">
                <p>
                  역할이 아직 없거나 보호자 역할만 없을 때는 기본 화면만 표시해요. 운영에서 보호자
                  역할을 붙이면 약·위치 등 확장 메뉴가 보입니다.
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-care-ink">최근 메시지</h2>
          <ul className="mt-3 space-y-2">
            {careMockAlerts.map((a) => (
              <li key={a.id}>
                <Card className="p-4 text-sm text-care-muted">
                  {a.message}
                </Card>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-care-ink">다음 할 일</h2>
          <ul className="mt-3 space-y-2">
            {careMockNextSteps.map((s) => (
              <li key={s.id}>
                <Card className="p-4 text-sm text-care-ink">{s.label}</Card>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-care-ink">다른 가족 구성원을 추가할까요?</p>
          <p className="text-sm text-care-muted">초대 흐름은 다음 단계에서 온톨로지와 연결됩니다.</p>
        </div>
        {perm.canUseGuardianFamilyActions ? (
          <Button
            asChild
            variant="secondary"
          >
            <Link
              to="/onboarding"
              onClick={guardOnboardingNav}
            >
              <UserPlus
                className="h-5 w-5"
                aria-hidden
              />
              부모님 등록
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled
            aria-disabled
          >
            <UserPlus
              className="h-5 w-5"
              aria-hidden
            />
            부모님 등록
          </Button>
        )}
      </Card>

      {(perm.canAccessAdminFeatures || perm.canAccessPartnerFeatures) && (
        <Card className="border-stone-200 bg-white p-4">
          <p className="text-sm font-medium text-care-ink">다른 역할 화면으로</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {perm.canAccessPartnerFeatures && (
              <Button
                asChild
                variant="secondary"
              >
                <Link to="/partner/tasks">파트너 업무</Link>
              </Button>
            )}
            {perm.canAccessAdminFeatures && (
              <Button
                asChild
                variant="secondary"
              >
                <Link to="/admin">운영 콘솔</Link>
              </Button>
            )}
          </div>
        </Card>
      )}

      {import.meta.env.DEV && <SupabaseConnectionDevPanel />}
      {import.meta.env.DEV && (
        <p
          className="text-xs text-care-muted"
          data-testid="user-roles-dev"
        >
          [DEV] user_roles 상태: {perm.status}
          {perm.rolesForUi.length > 0 ? ` · ${perm.rolesForUi.join(', ')}` : ''}
        </p>
      )}
    </div>
  )
}
