import { createFileRoute, Link } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { useState } from "react";
import { AppLayout } from "@/components/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { ArrowLeft, Check, Pill, Plus, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/guardian/medications")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "오늘의 약 — 곁" },
      { name: "description", content: "복용 일정과 누락 여부를 가족이 함께 확인합니다." },
    ],
  }),
  component: MedicationsPage,
});

type Status = "taken" | "missed" | "unknown" | "pending";

type Med = {
  id: string;
  name: string;
  dose: string;
  time: string;
  note?: string;
  status: Status;
};

const initialMeds: Med[] = [
  { id: "1", name: "암로디핀 5mg", dose: "1정", time: "오전 8:30", note: "혈압", status: "taken" },
  { id: "2", name: "메트포르민 500mg", dose: "1정", time: "오후 12:30", note: "당뇨", status: "taken" },
  { id: "3", name: "아토르바스타틴 10mg", dose: "1정", time: "오후 7:00", note: "콜레스테롤", status: "pending" },
  { id: "4", name: "비타민 D", dose: "1정", time: "오후 7:00", status: "pending" },
];

const tones: Record<Status, "sage" | "rose" | "amber" | "muted"> = {
  taken: "sage",
  missed: "rose",
  unknown: "amber",
  pending: "muted",
};

const labels: Record<Status, string> = {
  taken: "복용함",
  missed: "누락",
  unknown: "모름",
  pending: "대기",
};

function MedicationsPage() {
  const [meds, setMeds] = useState(initialMeds);

  const setStatus = (id: string, status: Status) => {
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
  };

  const taken = meds.filter((m) => m.status === "taken").length;
  const total = meds.length;
  const pct = Math.round((taken / total) * 100);

  return (
    <AppLayout context="guardian">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          to="/guardian/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 홈으로
        </Link>

        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-muted-foreground">오늘의 약</p>
            <h1 className="font-display text-[28px] leading-tight tracking-tight sm:text-[32px]">
              {taken}/{total} 복용
            </h1>
            <p className="text-[14px] text-muted-foreground">
              저녁약이 곧 시작돼요. 알림 시간 30분 전까지 미복용이면 자동 재확인.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full">
            <Plus className="h-3.5 w-3.5" /> 약 추가
          </Button>
        </header>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full rounded-full bg-foreground transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <ul className="mt-6 space-y-3">
          {meds.map((m) => (
            <li
              key={m.id}
              className="rounded-3xl border border-border/60 bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-soft text-primary">
                    <Pill className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-foreground">{m.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {m.time} · {m.dose}
                      {m.note && <> · {m.note}</>}
                    </p>
                  </div>
                </div>
                <StatusBadge tone={tones[m.status]} dot={m.status !== "pending"}>
                  {labels[m.status]}
                </StatusBadge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <ActionBtn
                  active={m.status === "taken"}
                  onClick={() => setStatus(m.id, "taken")}
                  icon={<Check className="h-3.5 w-3.5" />}
                >
                  복용
                </ActionBtn>
                <ActionBtn
                  active={m.status === "missed"}
                  onClick={() => setStatus(m.id, "missed")}
                  icon={<X className="h-3.5 w-3.5" />}
                >
                  누락
                </ActionBtn>
                <ActionBtn
                  active={m.status === "unknown"}
                  onClick={() => setStatus(m.id, "unknown")}
                  icon={<HelpCircle className="h-3.5 w-3.5" />}
                >
                  모름
                </ActionBtn>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 px-2 text-[12px] leading-relaxed text-muted-foreground">
          ⓘ 의약품 정보는 식약처 ‘e약은요’ 기준입니다. 곁은 진단·처방을 하지 않으며,
          기록은 가족 공유와 리마인더 용도로만 사용됩니다.
        </p>
      </div>
    </AppLayout>
  );
}

function ActionBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[13px] font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface/50 text-foreground/70 hover:border-foreground/30",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
