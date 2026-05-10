import { createFileRoute, Link } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { useState } from "react";
import { AppLayout } from "@/components/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  HeartPulse,
  Soup,
  Pill,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/guardian/check-in")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "빠른 안부체크 — 곁" },
      { name: "description", content: "1분 안에 부모님의 오늘을 기록하세요." },
    ],
  }),
  component: CheckInPage,
});

type Mood = "good" | "soso" | "bad";
type Triple = "yes" | "no" | "unknown";
type Symptom = "통증" | "어지럼" | "기침" | "낙상" | "기타";

function CheckInPage() {
  const [mood, setMood] = useState<Mood | null>(null);
  const [meal, setMeal] = useState<Triple | null>(null);
  const [med, setMed] = useState<Triple | null>(null);
  const [symptoms, setSymptoms] = useState<Set<Symptom>>(new Set());
  const [memo, setMemo] = useState("");

  const canSubmit = mood !== null && meal !== null && med !== null;

  const submit = () => {
    if (!canSubmit) return;
    toast.success("오늘의 안부가 기록되었어요", {
      description: "가족에게도 공유됩니다.",
    });
  };

  return (
    <AppLayout context="guardian">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          to="/guardian/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 홈으로
        </Link>

        <header className="space-y-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">
            빠른 안부체크 · 약 1분
          </p>
          <h1 className="font-display text-[28px] leading-tight tracking-tight sm:text-[32px]">
            오늘 어머니는 어떠셨어요?
          </h1>
          <p className="text-[14px] text-muted-foreground">
            의료 진단이 아닌, 가족이 함께 보는 일상 기록입니다.
          </p>
        </header>

        <div className="mt-8 space-y-5">
          <Field label="오늘 상태" icon={<HeartPulse className="h-4 w-4" />} required>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { v: "good" as const, label: "좋음", tone: "sage" as const },
                  { v: "soso" as const, label: "보통", tone: "amber" as const },
                  { v: "bad" as const, label: "안 좋음", tone: "rose" as const },
                ]
              ).map((opt) => (
                <ChoiceTile
                  key={opt.v}
                  active={mood === opt.v}
                  onClick={() => setMood(opt.v)}
                >
                  {opt.label}
                </ChoiceTile>
              ))}
            </div>
          </Field>

          <Field label="식사" icon={<Soup className="h-4 w-4" />} required>
            <TripleToggle value={meal} onChange={setMeal} labels={["드심", "거름", "모름"]} />
          </Field>

          <Field label="약 복용" icon={<Pill className="h-4 w-4" />} required>
            <TripleToggle value={med} onChange={setMed} labels={["복용", "누락", "모름"]} />
          </Field>

          <Field label="증상 (해당되는 항목 선택)" icon={<AlertCircle className="h-4 w-4" />}>
            <div className="flex flex-wrap gap-2">
              {(["통증", "어지럼", "기침", "낙상", "기타"] as Symptom[]).map((s) => {
                const active = symptoms.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      const next = new Set(symptoms);
                      if (active) next.delete(s);
                      else next.add(s);
                      setSymptoms(next);
                    }}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground/80 hover:bg-accent",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="메모">
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="오늘 통화 내용, 작은 변화 등을 적어두세요."
              className="min-h-[96px] rounded-2xl border-border/80 bg-card"
            />
          </Field>

          {symptoms.size > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-warm/30 bg-amber-soft/40 p-4">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
              <p className="text-[13px] leading-relaxed text-foreground/80">
                <span className="font-medium">참고</span> · 증상이 2회 연속 기록되면 알림함에
                재확인 카드가 자동으로 만들어져요. 진단 목적이 아닙니다.
              </p>
            </div>
          )}
        </div>

        <div className="sticky bottom-20 mt-8 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/95 p-3 backdrop-blur md:bottom-4">
          <div className="flex items-center gap-2 pl-2 text-[12px] text-muted-foreground">
            {canSubmit ? (
              <>
                <Check className="h-3.5 w-3.5 text-sage" /> 저장 준비 완료
              </>
            ) : (
              <>필수 항목을 모두 선택해주세요</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-full">
              임시 저장
            </Button>
            <Button
              variant="hero"
              size="sm"
              className="rounded-full"
              disabled={!canSubmit}
              onClick={submit}
            >
              기록 완료
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Field({
  label,
  icon,
  required,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-foreground/70">
            {icon}
          </span>
        )}
        <p className="text-[14px] font-medium text-foreground">{label}</p>
        {required ? (
          <span className="text-[11px] text-primary">*필수</span>
        ) : (
          <StatusBadge tone="muted" className="text-[10px]">
            선택
          </StatusBadge>
        )}
      </div>
      {children}
    </div>
  );
}

function ChoiceTile({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-4 py-3 text-[14px] font-medium transition-all",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface/50 text-foreground/80 hover:border-foreground/40",
      )}
    >
      {children}
    </button>
  );
}

function TripleToggle({
  value,
  onChange,
  labels,
}: {
  value: Triple | null;
  onChange: (v: Triple) => void;
  labels: [string, string, string];
}) {
  const opts: { v: Triple; label: string }[] = [
    { v: "yes", label: labels[0] },
    { v: "no", label: labels[1] },
    { v: "unknown", label: labels[2] },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => (
        <ChoiceTile key={o.v} active={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </ChoiceTile>
      ))}
    </div>
  );
}
