import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ZodError } from 'zod'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { Check } from 'lucide-react'
import { useAuthSession } from '../../hooks/useAuthSession'
import {
  myGuardianFamilyGroupQueryKey,
  useMyGuardianFamilyGroup,
} from '../../hooks/useMyGuardianFamilyGroup'
import { useMyPrimaryCareRecipient } from '../../hooks/useMyPrimaryCareRecipient'
import { useUiPermissions } from '../../hooks/useUiPermissions'
import { formatDateLabel } from '../../lib/date'
import { queryKeys } from '../../lib/queryKeys'
import { queryClient } from '../../lib/queryClient'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import type { FamilyGroup } from '../../ontology/objects/FamilyGroup'
import { createFamilyGroup } from '../../ontology/actions/createFamilyGroup'
import { registerCareRecipient } from '../../ontology/actions/registerCareRecipient'
import { updatePrimaryCareRecipient } from '../../ontology/actions/updateCareRecipient'

const steps = [
  '가족 그룹 만들기',
  '부모님 프로필',
  '돌봄 알림 설정',
] as const

export function OnboardingPage() {
  const { user, loading: sessionLoading } = useAuthSession()
  const perm = useUiPermissions()
  const {
    data: myGroup,
    isPending: familyLoading,
    isError: familyQueryError,
    error: familyQueryErr,
  } = useMyGuardianFamilyGroup()
  const [familyName, setFamilyName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optimisticGroup, setOptimisticGroup] = useState<FamilyGroup | null>(null)

  const configured = isSupabaseConfigured()
  const displayGroup = myGroup ?? optimisticGroup

  const {
    data: primaryRecipient,
    isPending: recipientLoading,
    isError: recipientQueryError,
    error: recipientQueryErr,
  } = useMyPrimaryCareRecipient(displayGroup?.id)

  const [recipientDisplayName, setRecipientDisplayName] = useState('')
  const [recipientEmergency, setRecipientEmergency] = useState('')
  const [recipientSubmitting, setRecipientSubmitting] = useState(false)
  const [recipientError, setRecipientError] = useState<string | null>(null)
  const [recipientEditing, setRecipientEditing] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editEmergency, setEditEmergency] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault()
    if (!configured || !user) return
    setError(null)
    setSubmitting(true)
    try {
      const group = await createFamilyGroup(
        {
          name: familyName,
          relationship: relationship || undefined,
        },
        perm.rolesForUi,
      )
      setOptimisticGroup(group)
      await queryClient.invalidateQueries({
        queryKey: myGuardianFamilyGroupQueryKey(user.id),
      })
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0]
        setError(first?.message ?? '입력을 확인해 주세요.')
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('처리 중 오류가 났어요.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRegisterRecipient(e: FormEvent) {
    e.preventDefault()
    if (!configured || !user || !displayGroup) return
    setRecipientError(null)
    setRecipientSubmitting(true)
    try {
      await registerCareRecipient(
        {
          familyGroupId: displayGroup.id,
          displayName: recipientDisplayName,
          emergencyNote: recipientEmergency.trim() ? recipientEmergency.trim() : undefined,
        },
        user.id,
        perm.rolesForUi,
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.primaryCareRecipient(displayGroup.id),
      })
    } catch (err) {
      if (err instanceof Error) {
        setRecipientError(err.message)
      } else {
        setRecipientError('처리 중 오류가 났어요.')
      }
    } finally {
      setRecipientSubmitting(false)
    }
  }

  function openRecipientEdit() {
    if (!primaryRecipient) return
    setEditDisplayName(primaryRecipient.recipientDisplayName ?? '')
    setEditEmergency(primaryRecipient.emergencyNote ?? '')
    setEditError(null)
    setRecipientEditing(true)
  }

  function cancelRecipientEdit() {
    setRecipientEditing(false)
    setEditError(null)
  }

  async function handleUpdateRecipient(e: FormEvent) {
    e.preventDefault()
    if (!configured || !user || !displayGroup) return
    setEditError(null)
    setEditSubmitting(true)
    try {
      await updatePrimaryCareRecipient(
        {
          familyGroupId: displayGroup.id,
          displayName: editDisplayName,
          emergencyNote: editEmergency.trim() ? editEmergency.trim() : null,
        },
        user.id,
        perm.rolesForUi,
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.primaryCareRecipient(displayGroup.id),
      })
      setRecipientEditing(false)
    } catch (err) {
      if (err instanceof Error) {
        setEditError(err.message)
      } else {
        setEditError('처리 중 오류가 났어요.')
      }
    } finally {
      setEditSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-care-ink sm:text-3xl">시작하기</h1>
        <p className="mt-2 text-care-muted">
          1단계에서 가족 그룹을 만들고, 2단계에서 돌봄 대상(부모님)을 등록해요. (다른 보호자 초대는
          다음 단계)
        </p>
      </div>

      {!configured && (
        <p className="text-sm text-rose-700">
          .env에 Supabase URL·anon 키를 넣은 뒤 다시 시도해 주세요.
        </p>
      )}

      {configured && sessionLoading && (
        <p className="text-sm text-care-muted">세션 확인 중…</p>
      )}

      {configured && !sessionLoading && !user && (
        <Card className="p-4 text-sm text-care-muted">
          가족 그룹을 만들려면{' '}
          <Link
            to="/auth"
            className="font-medium text-rose-700 hover:underline"
          >
            로그인
          </Link>
          이 필요해요.
        </Card>
      )}

      {configured && !sessionLoading && user && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-care-ink">1. 가족 그룹 이름</h2>
          {familyQueryError && (
            <p
              className="mt-2 text-sm text-rose-700"
              role="alert"
            >
              {familyQueryErr instanceof Error
                ? familyQueryErr.message
                : '가족 그룹 정보를 불러오지 못했어요.'}
            </p>
          )}
          {familyLoading && !displayGroup ? (
            <p className="mt-4 text-sm text-care-muted">가족 그룹 여부를 확인하는 중…</p>
          ) : null}
          {displayGroup ? (
            <div className="mt-4 space-y-3">
              <p
                className="text-sm text-emerald-800"
                role="status"
              >
                가족 그룹 생성이 완료됐어요. 이 계정은 이 그룹의 보호자로 등록되어 있어요.
              </p>
              <p className="text-base font-medium text-care-ink">{displayGroup.name}</p>
              <p className="text-xs text-care-muted">
                만든 날: {formatDateLabel(displayGroup.createdAt)}
              </p>
              <p className="text-xs text-care-muted break-all">그룹 ID: {displayGroup.id}</p>
              <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-3 text-sm text-care-muted">
                아래 2단계에서 돌봄 대상(부모님) 이름을 등록할 수 있어요. 다른 보호자 초대는 아직
                연결되지 않았어요.
              </div>
              <Button
                asChild
                variant="primary"
                className="w-full"
              >
                <Link to="/guardian/dashboard">보호자 대시보드로</Link>
              </Button>
            </div>
          ) : !familyLoading ? (
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => void handleCreateGroup(e)}
            >
              <div>
                <label
                  htmlFor="onboarding-family-name"
                  className="block text-sm font-medium text-care-ink"
                >
                  가족 이름
                </label>
                <input
                  id="onboarding-family-name"
                  name="familyName"
                  type="text"
                  autoComplete="organization"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  placeholder="예: 우리 가족"
                  maxLength={200}
                  required
                  disabled={submitting}
                />
              </div>
              <div>
                <label
                  htmlFor="onboarding-relationship"
                  className="block text-sm font-medium text-care-ink"
                >
                  나와의 관계 (선택)
                </label>
                <input
                  id="onboarding-relationship"
                  name="relationship"
                  type="text"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  placeholder="예: 딸"
                  maxLength={500}
                  disabled={submitting}
                />
              </div>
              {error && (
                <p className="text-sm text-rose-700" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={submitting || !perm.canUseGuardianFamilyActions}
              >
                {submitting ? '만드는 중…' : '가족 그룹 만들기'}
              </Button>
              {!perm.canUseGuardianFamilyActions && (
                <p className="text-xs text-care-muted">
                  가족 그룹 만들기는 보호자 역할이 있거나 역할이 아직 없는 계정에서만 할 수 있어요.
                </p>
              )}
            </form>
          ) : null}
        </Card>
      )}

      {configured && !sessionLoading && user && displayGroup && (
        <Card
          className="p-6"
          id="onboarding-care-recipient"
        >
          <h2 className="text-lg font-semibold text-care-ink">2. 부모님(돌봄 대상)</h2>
          {recipientQueryError && (
            <p
              className="mt-2 text-sm text-rose-700"
              role="alert"
            >
              {recipientQueryErr instanceof Error
                ? recipientQueryErr.message
                : '돌봄 대상 정보를 불러오지 못했어요.'}
            </p>
          )}
          {recipientLoading && !primaryRecipient ? (
            <p className="mt-4 text-sm text-care-muted">등록 여부를 확인하는 중…</p>
          ) : null}
          {primaryRecipient ? (
            recipientEditing ? (
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => void handleUpdateRecipient(e)}
              >
                <p className="text-sm text-care-muted">
                  표시 이름과 비고만 바꿀 수 있어요. (첫 번째 돌봄 대상만)
                </p>
                <div>
                  <label
                    htmlFor="onboarding-recipient-edit-name"
                    className="block text-sm font-medium text-care-ink"
                  >
                    부모님 표시 이름
                  </label>
                  <input
                    id="onboarding-recipient-edit-name"
                    name="editDisplayName"
                    type="text"
                    autoComplete="name"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    maxLength={200}
                    required
                    disabled={editSubmitting}
                  />
                </div>
                <div>
                  <label
                    htmlFor="onboarding-recipient-edit-emergency"
                    className="block text-sm font-medium text-care-ink"
                  >
                    비고·응급 메모 (선택)
                  </label>
                  <textarea
                    id="onboarding-recipient-edit-emergency"
                    name="editEmergencyNote"
                    rows={3}
                    value={editEmergency}
                    onChange={(e) => setEditEmergency(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    maxLength={5000}
                    disabled={editSubmitting}
                  />
                </div>
                {editError && (
                  <p
                    className="text-sm text-rose-700"
                    role="alert"
                  >
                    {editError}
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="submit"
                    variant="primary"
                    className="flex-1"
                    disabled={editSubmitting || !perm.canUseGuardianFamilyActions}
                  >
                    {editSubmitting ? '저장 중…' : '저장'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={editSubmitting}
                    onClick={cancelRecipientEdit}
                  >
                    취소
                  </Button>
                </div>
                {!perm.canUseGuardianFamilyActions && (
                  <p className="text-xs text-care-muted">
                    수정은 보호자 역할이 있거나 역할이 아직 없는 계정에서만 할 수 있어요.
                  </p>
                )}
              </form>
            ) : (
              <div className="mt-4 space-y-2">
                <p
                  className="text-sm text-emerald-800"
                  role="status"
                >
                  돌봄 대상 등록이 완료됐어요.
                </p>
                <p className="text-base font-medium text-care-ink">
                  {primaryRecipient.recipientDisplayName ?? '이름 없음'}
                </p>
                <p className="text-xs text-care-muted">
                  등록일 {formatDateLabel(primaryRecipient.createdAt)}
                </p>
                {primaryRecipient.emergencyNote ? (
                  <p className="text-xs text-care-muted">비고: {primaryRecipient.emergencyNote}</p>
                ) : null}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {perm.canUseGuardianFamilyActions ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={openRecipientEdit}
                    >
                      이름·비고 수정
                    </Button>
                  ) : (
                    <p className="text-xs text-care-muted">
                      정보 수정은 보호자(또는 역할 없음 기본) 계정에서만 할 수 있어요.
                    </p>
                  )}
                  <Button
                    asChild
                    variant="secondary"
                    className="flex-1"
                  >
                    <Link to="/guardian/dashboard">대시보드에서 확인</Link>
                  </Button>
                </div>
              </div>
            )
          ) : !recipientLoading ? (
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => void handleRegisterRecipient(e)}
            >
              <p className="text-sm text-care-muted">
                연결된 시니어 계정 없이, 우선 이 가족 그룹에서 부르는 이름만 저장해요.
              </p>
              <div>
                <label
                  htmlFor="onboarding-recipient-name"
                  className="block text-sm font-medium text-care-ink"
                >
                  부모님 표시 이름
                </label>
                <input
                  id="onboarding-recipient-name"
                  name="recipientDisplayName"
                  type="text"
                  autoComplete="name"
                  value={recipientDisplayName}
                  onChange={(e) => setRecipientDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  placeholder="예: 김영희"
                  maxLength={200}
                  required
                  disabled={recipientSubmitting}
                />
              </div>
              <div>
                <label
                  htmlFor="onboarding-recipient-emergency"
                  className="block text-sm font-medium text-care-ink"
                >
                  비고·응급 메모 (선택)
                </label>
                <textarea
                  id="onboarding-recipient-emergency"
                  name="emergencyNote"
                  rows={3}
                  value={recipientEmergency}
                  onChange={(e) => setRecipientEmergency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  placeholder="알레르기, 복용 약 등"
                  maxLength={5000}
                  disabled={recipientSubmitting}
                />
              </div>
              {recipientError && (
                <p
                  className="text-sm text-rose-700"
                  role="alert"
                >
                  {recipientError}
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={recipientSubmitting || !perm.canUseGuardianFamilyActions}
              >
                {recipientSubmitting ? '등록 중…' : '돌봄 대상 등록하기'}
              </Button>
              {!perm.canUseGuardianFamilyActions && (
                <p className="text-xs text-care-muted">
                  이 단계는 보호자 역할이 있거나 역할이 아직 없는 계정에서만 진행할 수 있어요.
                </p>
              )}
            </form>
          ) : null}
        </Card>
      )}

      <ol className="space-y-3">
        {steps.map((label, i) => (
          <li key={label}>
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-800">
                {i + 1}
              </span>
              <span className="font-medium text-care-ink">{label}</span>
              <Check
                className={`ml-auto h-5 w-5 ${
                  (i === 0 && displayGroup) || (i === 1 && primaryRecipient)
                    ? 'text-emerald-600'
                    : 'text-emerald-600/40'
                }`}
                aria-label={
                  (i === 0 && displayGroup) || (i === 1 && primaryRecipient)
                    ? `${i + 1}단계 완료`
                    : '완료 전'
                }
              />
            </Card>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          asChild
          variant="primary"
          className="flex-1"
        >
          <Link to="/auth">이미 계정이 있으면 로그인</Link>
        </Button>
        <Button
          asChild
          variant="secondary"
          className="flex-1"
        >
          <Link to="/guardian/dashboard">뼈대 대시보드 보기</Link>
        </Button>
      </div>
    </div>
  )
}
