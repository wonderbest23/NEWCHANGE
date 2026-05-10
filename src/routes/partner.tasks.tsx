import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { Calendar, MapPin, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/partner/tasks")({
  head: () => ({
    meta: [
      { title: "파트너 업무 — 곁" },
      { name: "description", content: "오늘의 방문 일정과 업무를 확인하세요." },
    ],
  }),
  component: PartnerTasks,
});

const tasks = [
  { id: 1, name: "김순자 어머니 방문", time: "오전 10:00 – 11:30", place: "서울 송파구 자택", status: "예정", tone: "amber" as const },
  { id: 2, name: "혈압 측정 & 안부 기록", time: "오전 11:00", place: "방문 중", status: "진행", tone: "rose" as const },
  { id: 3, name: "박영수 아버지 방문", time: "오후 2:00 – 3:00", place: "서울 마포구 자택", status: "예정", tone: "amber" as const },
  { id: 4, name: "주간 보고서 작성", time: "오후 5:00", place: "원격", status: "완료", tone: "sage" as const },
];

function PartnerTasks() {
  return (
    <AppLayout context="partner">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">2026년 4월 29일 · 수요일</p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            오늘의 업무
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => toast.info("배정 변경 요청 기능은 곧 출시됩니다.")}
        >
          <RefreshCw className="h-4 w-4" /> 배정 변경 요청
        </Button>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="오늘 일정" value="3건" />
        <Stat label="완료" value="1건" />
        <Stat label="이번 주" value="14건" />
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
          <ul className="divide-y divide-border/60">
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-soft">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {t.time}</span>
                      <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {t.place}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <StatusBadge tone={t.tone} dot>{t.status}</StatusBadge>
                  <Button variant="outline" size="sm">상세</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        목 데이터입니다 — 실 DB 연동은 다음 릴리즈에 포함됩니다.
      </p>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl text-foreground">{value}</p>
    </div>
  );
}
