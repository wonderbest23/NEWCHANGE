import { useState } from 'react'
import { Mic, Pill, Phone, LifeBuoy } from 'lucide-react'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { useUiPermissions } from '../../hooks/useUiPermissions'
import { consumeActionPermission } from '../../lib/actionPermissionFeedback'
import { checkSeniorHomeWriteAction } from '../../ontology/rules/permission.rules'

const actions = [
  { key: 'checkin', label: '오늘 상태 말하기', icon: Mic, hint: '간단한 안부' },
  { key: 'meds', label: '약 먹었어요', icon: Pill, hint: '기록' },
  { key: 'help', label: '도움이 필요해요', icon: LifeBuoy, hint: '응급/도움' },
  { key: 'call', label: '자녀에게 연락하기', icon: Phone, hint: '전화' },
] as const

type DoneKey = (typeof actions)[number]['key'] | null

export function SeniorHomePage() {
  const [message, setMessage] = useState(
    '눌러서 요청해보세요. (실제 저장은 다음 단계)',
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [done, setDone] = useState<DoneKey>(null)
  const perm = useUiPermissions()
  const readOnlyGuardian = perm.canViewSeniorHome && !perm.canWriteSeniorHome

  return (
    <div className="space-y-8">
      <div className="text-center">
        <p
          className="text-2xl font-semibold text-stone-800 sm:text-3xl"
          id="greeting"
        >
          부모님, 안녕하세요
        </p>
        <p
          className="mt-2 text-xl text-stone-600 sm:text-2xl"
          aria-describedby="greeting"
        >
          {readOnlyGuardian
            ? '가족 미리보기입니다. 실제 요청은 부모님 기기에서 해 주세요.'
            : '버튼을 크게 눌러주세요'}
        </p>
      </div>

      {readOnlyGuardian && (
        <Card className="border-amber-200 bg-amber-50/80 p-4 text-center text-sm text-amber-950">
          보호자 계정으로는 읽기·미리보기만 가능해요. 기록·도움 요청은 시니어 역할에서만
          보낼 수 있어요.
        </Card>
      )}

      {done && (
        <p
          className="text-center text-xl text-emerald-800"
          role="status"
        >
          요청이 접수됐어요(뼈대)
        </p>
      )}

      <ul className="grid gap-4" aria-label="주요 동작">
        {actions.map(({ key, label, icon: Icon, hint }) => (
          <li key={key}>
            <Button
              type="button"
              className="h-[72px] min-h-[72px] w-full !justify-center !gap-4 !px-4 !text-left !text-2xl !font-semibold"
              variant={key === 'help' ? 'primary' : 'secondary'}
              onClick={() => {
                if (
                  !consumeActionPermission(
                    checkSeniorHomeWriteAction(perm.rolesForUi, key),
                    setMessage,
                  )
                ) {
                  return
                }
                if (readOnlyGuardian) return
                if (key === 'help') {
                  setDialogOpen(true)
                  return
                }
                if (key === 'call') {
                  setMessage('곧 이어서 자녀에게 연락할 수 있어요(뼈대).')
                  setDone('call')
                  return
                }
                setMessage(`「${label}」요청(뼈대)`)
                setDone(key)
              }}
              disabled={readOnlyGuardian}
              aria-disabled={readOnlyGuardian}
              aria-label={hint ? `${label} — ${hint}` : label}
            >
              <Icon
                className="h-8 w-8 shrink-0"
                aria-hidden
              />
              {label}
            </Button>
          </li>
        ))}
      </ul>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-dialog-title"
        >
          <Card className="w-full max-w-md p-6">
            <h2
              id="help-dialog-title"
              className="text-xl font-bold text-care-ink"
            >
              도움 요청
            </h2>
            <p
              className="mt-3 text-lg text-stone-700"
              id="help-dialog-body"
            >
              정말로 도움이 필요하신가요? 가족에게 전달돼요.
            </p>
            <p className="mt-4 text-sm text-care-muted">
              실제 전송·저장은 다음 단계에서 액션·RLS로 연동합니다.
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                type="button"
                className="flex-1"
                variant="secondary"
                onClick={() => setDialogOpen(false)}
                aria-label="취소"
              >
                취소
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="primary"
                disabled={readOnlyGuardian}
                onClick={() => {
                  if (
                    !consumeActionPermission(
                      checkSeniorHomeWriteAction(perm.rolesForUi, 'help'),
                      setMessage,
                    )
                  ) {
                    return
                  }
                  if (readOnlyGuardian) return
                  setDialogOpen(false)
                  setDone('help')
                  setMessage('가족에게 전달이 준비돼 있어요(뼈대).')
                }}
                aria-label="가족에게 보내기"
                aria-describedby="help-dialog-body"
              >
                보내기
              </Button>
            </div>
          </Card>
        </div>
      )}

      <p className="text-center text-base text-stone-500">
        {message}
      </p>
    </div>
  )
}
