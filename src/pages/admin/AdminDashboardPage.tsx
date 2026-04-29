import { useState } from 'react'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { careMockAdminRows } from '../../mocks/careMock'
import { useUiPermissions } from '../../hooks/useUiPermissions'
import { consumeActionPermission } from '../../lib/actionPermissionFeedback'
import {
  checkAdminAuditExportAction,
  checkAdminUserRolesBulkQueryAction,
} from '../../ontology/rules/permission.rules'
import { Shield, Activity } from 'lucide-react'

export function AdminDashboardPage() {
  const perm = useUiPermissions()
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">대시보드</h1>
        <p className="mt-1 text-slate-600">
          운영·위험 알림·사용자 관리는 RLS·백엔드와 연동 후 본격 사용합니다.
        </p>
        {actionNotice && (
          <p
            className="mt-2 text-sm text-amber-200"
            role="alert"
          >
            {actionNotice}
          </p>
        )}
      </div>
      {perm.canAccessAdminFeatures && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
            onClick={() => {
              if (
                !consumeActionPermission(
                  checkAdminAuditExportAction(perm.rolesForUi),
                  setActionNotice,
                )
              ) {
                return
              }
              setActionNotice('(뼈대) 감사 로그 요청은 서버 API 연동 후 실행됩니다.')
            }}
          >
            운영 감사 로그보내기(준비)
          </Button>
          <Button
            type="button"
            variant="primary"
            className="bg-rose-600 hover:bg-rose-700"
            onClick={() => {
              if (
                !consumeActionPermission(
                  checkAdminUserRolesBulkQueryAction(perm.rolesForUi),
                  setActionNotice,
                )
              ) {
                return
              }
              setActionNotice('(뼈대) 역할 일괄 조회는 서버 API 연동 후 실행됩니다.')
            }}
          >
            사용자 역할 일괄 조회(준비)
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: '오늘의 알림(뼈대)', value: '0', icon: Activity },
          { label: '오픈 이슈(뼈대)', value: '0', icon: Shield },
        ].map(({ label, value, icon: Icon }) => (
          <Card
            key={label}
            className="border-slate-700 bg-slate-800 p-4 text-slate-100"
          >
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Icon
                className="h-4 w-4"
                aria-hidden
              />
              {label}
            </div>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="border-slate-700 bg-slate-800 p-0 text-slate-100">
        <div className="p-4">
          <h2 className="text-sm font-medium text-slate-300">샘플 사용자(목)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">가족 요약(목)</caption>
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th
                  className="p-3 font-medium"
                  scope="col"
                >
                  식별
                </th>
                <th
                  className="p-3 font-medium"
                  scope="col"
                >
                  플랜
                </th>
                <th
                  className="p-3 font-medium"
                  scope="col"
                >
                  메모
                </th>
              </tr>
            </thead>
            <tbody>
              {careMockAdminRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-700/60 last:border-0"
                >
                  <th
                    className="p-3 font-medium text-slate-100"
                    scope="row"
                  >
                    {row.name}
                  </th>
                  <td className="p-3 text-slate-200">{row.level}</td>
                  <td className="p-3 text-slate-300">{row.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
