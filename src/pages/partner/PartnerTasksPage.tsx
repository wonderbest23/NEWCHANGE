import { useState } from 'react'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { careMockTasks } from '../../mocks/careMock'
import { useUiPermissions } from '../../hooks/useUiPermissions'
import { consumeActionPermission } from '../../lib/actionPermissionFeedback'
import {
  checkPartnerAssignmentChangeRequestAction,
  checkPartnerTaskAcceptAction,
} from '../../ontology/rules/permission.rules'
import { ListChecks } from 'lucide-react'

export function PartnerTasksPage() {
  const perm = useUiPermissions()
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-care-ink sm:text-3xl">오늘의 업무</h1>
        <p className="mt-1 text-care-muted">
          파트너 전용 케어 태스크. 실제 배정·상태는 DB 연동 후 표시됩니다.
        </p>
        {actionNotice && (
          <p
            className="mt-2 text-sm text-rose-700"
            role="alert"
          >
            {actionNotice}
          </p>
        )}
      </div>
      {perm.canAccessPartnerFeatures && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (
                !consumeActionPermission(
                  checkPartnerAssignmentChangeRequestAction(perm.rolesForUi),
                  setActionNotice,
                )
              ) {
                return
              }
              setActionNotice('(뼈대) 배정 변경 요청은 서버 API 연동 후 전송됩니다.')
            }}
          >
            배정 변경 요청(준비)
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              if (
                !consumeActionPermission(
                  checkPartnerTaskAcceptAction(perm.rolesForUi),
                  setActionNotice,
                )
              ) {
                return
              }
              setActionNotice('(뼈대) 업무 수락은 서버 API 연동 후 처리됩니다.')
            }}
          >
            새 업무 수락(준비)
          </Button>
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <div className="min-w-[320px] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-stone-600">
            <ListChecks
              className="h-4 w-4"
              aria-hidden
            />
            배정된 방문/동행
          </div>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">업무 목록</caption>
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th
                  className="py-2 pr-2 font-medium"
                  scope="col"
                >
                  대상
                </th>
                <th
                  className="py-2 pr-2 font-medium"
                  scope="col"
                >
                  일시
                </th>
                <th
                  className="py-2 pr-2 font-medium"
                  scope="col"
                >
                  유형
                </th>
                <th
                  className="py-2 font-medium"
                  scope="col"
                >
                  상태
                </th>
              </tr>
            </thead>
            <tbody>
              {careMockTasks.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-stone-100 last:border-0"
                >
                  <th
                    className="py-3 pr-2 font-medium text-care-ink"
                    scope="row"
                  >
                    {r.person}
                  </th>
                  <td className="pr-2 text-care-muted">{r.time}</td>
                  <td className="pr-2">{r.type}</td>
                  <td className="text-rose-700">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
