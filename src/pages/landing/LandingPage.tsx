import { Link } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { Sparkles, Phone, MapPin, Bell } from 'lucide-react'

export function LandingPage() {
  return (
    <div className="space-y-16 sm:space-y-24">
      <section className="text-center">
        <p className="text-sm font-medium text-rose-600">가족 케어</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-care-ink sm:text-4xl md:text-5xl">
          매일 찾아뵙지 못해도,
          <br />
          <span className="text-rose-700">매일 돌볼 수는 있습니다</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-care-muted sm:text-lg">
          안부, 약, 위치 확인을 한곳에서. 가족과 함께하는 돌봄 파트너, 곁입니다.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild variant="primary" className="w-full min-w-[200px] sm:w-auto">
            <Link to="/onboarding">부모님 등록하기</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full min-w-[200px] sm:w-auto">
            <Link to="/pricing">요금제 보기</Link>
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-center text-xl font-semibold text-care-ink sm:text-2xl">
          이런 고민, 있으신가요?
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            '혼자 계신 부모님 걱정',
            '전화를 못 드릴 때의 죄책감',
            '약·병원·위급상황 불안',
          ].map((t) => (
            <Card key={t} className="p-5 text-center">
              <p className="text-care-ink">{t}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-center text-xl font-semibold text-care-ink sm:text-2xl">
          곁이 돕는 방법
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: Sparkles,
              title: 'AI 안부 체크 (예정)',
              body: '부모님의 오늘 상태를 가볍게 확인',
            },
            { icon: Phone, title: '건강·약 알림', body: '잊지 않도록 부드럽게 돌봄' },
            { icon: MapPin, title: '위치 기반 안심 (동의 시)', body: '최근 위치로 마음이 놓이게' },
            { icon: Bell, title: '이상 징후 알림', body: '보호자에게 빠르게 전달' },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Card className="flex h-full flex-col gap-2 p-5 sm:flex-row sm:items-start">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                  <Icon
                    className="h-5 w-5"
                    aria-hidden
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-care-ink">{title}</h3>
                  <p className="mt-1 text-sm text-care-muted">{body}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
