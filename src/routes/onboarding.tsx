import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  Heart,
  Loader2,
  RefreshCcw,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import { ensureFamily, createRecipient } from "@/lib/care/setup-actions";
import { setAccountRole } from "@/lib/auth/role-actions";
import { useAppState } from "@/lib/auth/use-app-state";
import { useAuth } from "@/lib/auth/mock-auth";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "시작하기 — 곁" },
      { name: "description", content: "가족 그룹과 돌봄 대상을 등록해 곁을 시작하세요." },
    ],
  }),
  component: OnboardingPage,
});

type StepKey = "group" | "recipient" | "alerts";
const STEPS: { key: StepKey; title: string; subtitle: string; icon: typeof Users }[] = [
  { key: "group", title: "가족 그룹", subtitle: "함께할 공간을 만들어요", icon: Users },
  { key: "recipient", title: "돌봄 대상", subtitle: "누구를 함께 돌볼까요", icon: Heart },
  { key: "alerts", title: "알림 설정", subtitle: "언제 어떻게 알릴까요", icon: Bell },
];

interface FormState {
  groupName: string;
  groupRel: string;
  recipientName: string;
  recipientNote: string;
  recipientEmergency: string;
}

function OnboardingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    groupName: "",
    groupRel: "",
    recipientName: "",
    recipientNote: "",
    recipientEmergency: "",
  });

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const stepValid = useMemo(() => {
    if (step === 0) return form.groupName.trim().length > 0;
    if (step === 1) return form.recipientName.trim().length > 0;
    return true;
  }, [step, form]);

  const progress = ((step + (stepValid ? 1 : 0.4)) / STEPS.length) * 100;

  const getHeaders = async () => {
    const { data } = await getSessionCached();
    const token = data.session?.access_token;
    if (!token) throw new Error("로그인이 필요합니다");
    return { Authorization: `Bearer ${token}` };
  };

  // 공유 캐시 사용 — 다른 페이지에서 이미 조회했으면 네트워크 호출 없음
  const bootstrap = useAppState();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate({ to: "/auth", search: { mode: "signup" } });
      return;
    }
    const state = bootstrap.data;
    if (!state) return;
    if (state.role === "senior") navigate({ to: "/community" });
    else if (state.role === "guardian" && state.hasRecipient)
      navigate({ to: "/guardian/dashboard" });
  }, [authLoading, isAuthenticated, bootstrap.data, navigate]);

  const finishMutation = useMutation({
    mutationFn: async () => {
      const headers = await getHeaders();
      await setAccountRole({ data: { role: "guardian" }, headers } as Parameters<typeof setAccountRole>[0]);
      await ensureFamily({
        data: { family_name: form.groupName.trim(), display_name: form.groupRel.trim() || undefined },
        headers,
      } as Parameters<typeof ensureFamily>[0]);
      await createRecipient({
        data: { display_name: form.recipientName.trim(), phone_e164: "+821000000000" },
        headers,
      } as Parameters<typeof createRecipient>[0]);
    },
    onSuccess: () => {
      toast.success("가족 등록이 저장되었어요");
      navigate({ to: "/guardian/dashboard" });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "저장에 실패했어요");
    },
  });

  const finishOnboarding = () => {
    if (!stepValid || finishMutation.isPending) return;
    finishMutation.mutate();
  };
  const saving = finishMutation.isPending;

  if (authLoading || bootstrap.isLoading) {
    return (
      <PublicLayout>
        <section className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center px-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중…
          </div>
        </section>
      </PublicLayout>
    );
  }

  if (bootstrap.error) {
    return (
      <PublicLayout>
        <section className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-base font-semibold text-foreground">정보를 불러오지 못했어요</p>
            <p className="mt-1 text-xs text-muted-foreground break-words">
              {(bootstrap.error as Error)?.message ?? "잠시 후 다시 시도해 주세요."}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => bootstrap.refetch()}
            disabled={bootstrap.isFetching}
          >
            {bootstrap.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            다시 시도
          </Button>
        </section>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <section className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        {/* App-style header card */}
        <div className="overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-soft">
          {/* Progress bar */}
          <div className="relative h-1 w-full bg-border/60">
            <div
              className="absolute inset-y-0 left-0 bg-foreground transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>

          {/* Step rail */}
          <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-5 sm:px-7">
            {STEPS.map((s, i) => {
              const done = i < step;
              const current = i === step;
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  disabled={i > step}
                  className={cn(
                    "group flex flex-1 items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-all",
                    i <= step ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                      done && "bg-sage text-background",
                      current && "bg-foreground text-background ring-4 ring-foreground/10",
                      !done && !current && "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Icon className="h-4 w-4" />}
                    {current && (
                      <span className="absolute -inset-1 -z-10 animate-ping rounded-full bg-foreground/10" />
                    )}
                  </span>
                  <span className="hidden min-w-0 flex-col sm:flex">
                    <span
                      className={cn(
                        "truncate text-[11px] font-medium uppercase tracking-[0.12em]",
                        current ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")} · {s.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{s.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div className="px-5 pb-7 pt-2 sm:px-8 sm:pb-10">
            <div className="mb-6 flex items-baseline justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="text-primary">*</span> 필수
              </p>
            </div>

            <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {step === 0 && <StepGroup form={form} update={update} />}
              {step === 1 && <StepRecipient form={form} update={update} />}
              {step === 2 && <StepAlerts />}
            </div>

            {/* Footer actions */}
            <div className="mt-8 flex items-center justify-between gap-3 border-t border-border/60 pt-5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" /> 이전
              </Button>

              {step < STEPS.length - 1 ? (
                <Button
                  type="button"
                  variant="hero"
                  size="lg"
                  className="gap-2"
                  disabled={!stepValid}
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                >
                  다음 단계 <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="hero"
                  size="lg"
                  className="gap-2"
                  disabled={saving || !stepValid}
                  onClick={finishOnboarding}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> 저장 중…
                    </>
                  ) : finishMutation.isError ? (
                    <>
                      <RefreshCcw className="h-4 w-4" /> 다시 시도
                    </>
                  ) : (
                    <>
                      완료하고 시작하기 <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>

            {finishMutation.isError && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="break-words">
                  {(finishMutation.error as Error)?.message ?? "저장 중 오류가 발생했어요."}
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          언제든지 다시 수정할 수 있어요. 입력한 내용은 가족만 볼 수 있습니다.
        </p>
      </section>
    </PublicLayout>
  );
}

/* ---------- Field primitives ---------- */

function FieldLabel({
  htmlFor,
  children,
  required,
  hint,
  filled,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  filled?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {children}
        {required ? (
          <span className="ml-1 text-primary">*</span>
        ) : (
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            선택
          </span>
        )}
      </Label>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {filled && (
          <span className="inline-flex items-center gap-1 text-sage">
            <Check className="h-3 w-3" strokeWidth={3} /> 입력됨
          </span>
        )}
        {!filled && hint && <span>{hint}</span>}
      </span>
    </div>
  );
}

function StepHeader({
  step,
  total,
  title,
  desc,
}: {
  step: number;
  total: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-[28px] leading-tight tracking-tight text-foreground sm:text-[32px]">
        {title}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{desc}</p>
    </div>
  );
}

/* ---------- Steps ---------- */

function StepGroup({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <>
      <StepHeader
        step={1}
        total={3}
        title="우리 가족의 이름을 정해주세요"
        desc="가족 그룹은 보호자, 부모님, 돌봄 파트너가 함께 모이는 공간이에요."
      />

      <div className="flex flex-col gap-5">
        <div>
          <FieldLabel htmlFor="group" required filled={form.groupName.trim().length > 0}>
            가족 그룹 이름
          </FieldLabel>
          <Input
            id="group"
            placeholder="예) 김씨 가족, 우리집"
            className="h-12 rounded-xl text-[15px]"
            value={form.groupName}
            onChange={(e) => update("groupName", e.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">2~20자 사이를 권장해요.</p>
        </div>

        <div>
          <FieldLabel htmlFor="rel" filled={form.groupRel.trim().length > 0}>
            나와 부모님의 관계
          </FieldLabel>
          <Input
            id="rel"
            placeholder="예) 큰딸, 둘째 아들"
            className="h-12 rounded-xl text-[15px]"
            value={form.groupRel}
            onChange={(e) => update("groupRel", e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

function StepRecipient({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <>
      <StepHeader
        step={2}
        total={3}
        title="누구를 함께 돌볼까요?"
        desc="부모님이나 돌봄이 필요한 가족 한 분을 등록해주세요. 나중에 더 추가할 수 있어요."
      />

      <div className="flex flex-col gap-5">
        <div>
          <FieldLabel htmlFor="name" required filled={form.recipientName.trim().length > 0}>
            표시 이름
          </FieldLabel>
          <Input
            id="name"
            placeholder="예) 어머니, 아버지, 김순자"
            className="h-12 rounded-xl text-[15px]"
            value={form.recipientName}
            onChange={(e) => update("recipientName", e.target.value)}
          />
        </div>

        <div>
          <FieldLabel htmlFor="note" filled={form.recipientNote.trim().length > 0}>
            평소 일과 · 좋아하시는 것
          </FieldLabel>
          <Textarea
            id="note"
            placeholder="예) 아침 7시에 산책, 저녁엔 트로트 듣기를 좋아하세요"
            className="min-h-[88px] rounded-xl text-[15px]"
            value={form.recipientNote}
            onChange={(e) => update("recipientNote", e.target.value)}
          />
        </div>

        <div>
          <FieldLabel htmlFor="emergency" filled={form.recipientEmergency.trim().length > 0}>
            응급 메모
          </FieldLabel>
          <Textarea
            id="emergency"
            placeholder="알레르기, 복용 중인 약, 응급 연락처"
            className="min-h-[88px] rounded-xl text-[15px]"
            value={form.recipientEmergency}
            onChange={(e) => update("recipientEmergency", e.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            응급 상황에서 보호자와 파트너에게만 공개돼요.
          </p>
        </div>
      </div>
    </>
  );
}

function StepAlerts() {
  return (
    <>
      <StepHeader
        step={3}
        total={3}
        title="알림은 다음에 켤 수 있어요"
        desc="안부, 약, 위치 알림은 곧 출시됩니다. 지금은 가족 그룹과 돌봄 대상 등록만 마쳐도 충분해요."
      />

      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-surface p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-soft text-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">준비 중인 기능</p>
          <p className="mt-1 text-sm text-muted-foreground">
            알림 종류와 시간, 받을 보호자를 곧 선택할 수 있어요. 출시되면 알려드릴게요.
          </p>
        </div>
      </div>
    </>
  );
}
