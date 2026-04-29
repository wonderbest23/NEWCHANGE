import { Link } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'

const plans = [
  { name: 'Basic', price: '9,900', unit: '원 / 월', blurb: '필수 알림' },
  { name: 'Care', price: '29,000', unit: '원 / 월', blurb: '가족 맞춤' },
  { name: 'Premium', price: '59,000', unit: '원 / 월', blurb: '높은 케어' },
] as const

export function PricingPage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-care-ink sm:text-3xl">요금제</h1>
        <p className="mt-2 text-care-muted">
          서비스 오픈에 맞춰 세부 옵션이 달라질 수 있어요.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        {plans.map((p) => (
          <Card
            key={p.name}
            className="flex flex-col p-6"
          >
            <p className="text-sm font-medium text-rose-600">{p.name}</p>
            <p className="mt-3 text-3xl font-bold text-care-ink">
              {p.price}
              <span className="text-base font-normal text-care-muted"> {p.unit}</span>
            </p>
            <p className="mt-2 text-sm text-care-muted">{p.blurb}</p>
            <div className="mt-6 flex-1" />
            <Button
              asChild
              variant="secondary"
              className="w-full"
            >
              <Link to="/onboarding">이 플랜으로 시작 (준비 중)</Link>
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
