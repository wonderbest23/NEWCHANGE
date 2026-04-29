import { useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { useAuthSession } from '../../hooks/useAuthSession'
import { myGuardianFamilyGroupQueryKey } from '../../hooks/useMyGuardianFamilyGroup'
import { DEFAULT_POST_LOGIN_PATH } from '../../lib/authPaths'
import { acceptGuardianInvite } from '../../ontology/actions/acceptGuardianInvite'

/**
 * 쿼리 `?token=` 으로 받은 보호자 초대를 수락합니다. 로그인은 상위 RequireAuth 가 담당합니다.
 */
export function AcceptGuardianInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthSession()

  const mutation = useMutation({
    mutationFn: async () => acceptGuardianInvite({ inviteToken: token }),
    onSuccess: async () => {
      if (user?.id) {
        await queryClient.invalidateQueries({ queryKey: ['user_roles', user.id] })
        await queryClient.invalidateQueries({ queryKey: myGuardianFamilyGroupQueryKey(user.id) })
        await queryClient.invalidateQueries({ queryKey: ['family_guardian_members'] })
      }
      void navigate(DEFAULT_POST_LOGIN_PATH, { replace: true })
    },
  })

  const handleAccept = useCallback(() => {
    if (!token) return
    mutation.mutate()
  }, [mutation, token])

  const errMsg =
    mutation.error instanceof Error ? mutation.error.message : mutation.isError ? '오류가 났어요.' : null

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center bg-stone-100 px-4 py-10">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-care-ink">가족 그룹 초대</h1>
        <p className="mt-2 text-sm text-care-muted">
          아래 버튼을 누르면 이 계정이 보호자로 가족 그룹에 합류해요. 로그인한 이메일이 초대받은
          주소와 같아야 해요.
        </p>
        {!token ? (
          <p
            className="mt-4 text-sm text-rose-700"
            role="alert"
          >
            초대 링크가 올바르지 않아요. 초대를 다시 보내 달라고 요청해 주세요.
          </p>
        ) : null}
        {errMsg ? (
          <p
            className="mt-4 text-sm text-rose-700"
            role="alert"
          >
            {errMsg}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={!token || mutation.isPending}
            onClick={handleAccept}
          >
            {mutation.isPending ? '처리 중…' : '초대 수락하기'}
          </Button>
          <Button
            asChild
            variant="secondary"
            className="w-full"
          >
            <Link to={DEFAULT_POST_LOGIN_PATH}>대시보드로 돌아가기</Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}
