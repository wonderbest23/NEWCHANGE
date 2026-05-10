import { createFileRoute, Link } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { AppLayout } from "@/components/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/brand/StatusBadge";
import {
  ArrowLeft,
  Bell,
  Copy,
  Crown,
  MoreHorizontal,
  Send,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

export const Route = createFileRoute("/guardian/settings")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "함께 관리 — 곁" },
      { name: "description", content: "보호자 초대, 권한, 그룹 설정." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppLayout context="guardian">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/guardian/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 홈으로
        </Link>

        <header className="space-y-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">함께 관리</p>
          <h1 className="font-display text-[28px] leading-tight tracking-tight sm:text-[32px]">
            가족과 함께 돌봐요
          </h1>
          <p className="text-[14px] text-muted-foreground">
            보호자 초대 · 권한 · 그룹 설정. 핵심 돌봄 화면(홈/안부/약/알림)과 분리되어 있어요.
          </p>
        </header>

        <Section title="함께하는 보호자" hint="3명 활성 · 1명 대기">
          <MembersList />
        </Section>

        <Section title="보호자 초대" hint="이메일 · 7일 유효">
          <InviteForm />
        </Section>

        <Section title="공유 범위" hint="언제든 변경·중지할 수 있어요">
          <SharePrefs />
        </Section>

        <DangerZone />
      </div>
    </AppLayout>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="font-display text-[18px] tracking-tight text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function MembersList() {
  const members = [
    { name: "김지원", rel: "큰딸", lead: true, status: "온라인" },
    { name: "김민호", rel: "둘째 아들", status: "30분 전" },
    { name: "김서연", rel: "막내", status: "어제" },
    { name: "jisoo@example.com", rel: "큰언니 · 초대 대기", pending: true },
  ];

  return (
    <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      {members.map((m, idx) => (
        <li
          key={m.name}
          className={`flex items-center gap-3 px-4 py-3.5 ${
            idx !== members.length - 1 ? "border-b border-border/60" : ""
          }`}
        >
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full font-display text-[14px] ${
              m.pending ? "bg-amber-soft text-foreground" : "bg-rose-soft text-primary"
            }`}
          >
            {m.pending ? <Bell className="h-4 w-4" /> : m.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[14px] font-medium text-foreground">{m.name}</p>
              {m.lead && <Crown className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="truncate text-[12px] text-muted-foreground">{m.rel}</p>
          </div>
          {m.pending ? (
            <div className="flex items-center gap-1">
              <StatusBadge tone="amber" dot>
                대기
              </StatusBadge>
              <Button variant="ghost" size="icon" aria-label="링크 복사" className="h-8 w-8">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="hidden text-[12px] text-muted-foreground sm:inline">
                {m.status}
              </span>
              <Button variant="ghost" size="icon" aria-label="더보기" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function InviteForm() {
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <UserPlus className="h-4 w-4" /> 형제·자매를 초대해 함께 돌봐요.
      </div>
      <Input
        type="email"
        placeholder="이메일 주소"
        className="h-11 rounded-xl border-border/80 bg-surface/50"
      />
      <Input
        placeholder="관계 (예: 둘째 아들)"
        className="h-11 rounded-xl border-border/80 bg-surface/50"
      />
      <Button variant="hero" className="h-11 w-full gap-1.5 rounded-xl">
        <Send className="h-4 w-4" /> 초대 보내기
      </Button>
    </form>
  );
}

function SharePrefs() {
  const items = [
    { k: "안부 응답", v: "전체 보호자" },
    { k: "약 복용 기록", v: "전체 보호자" },
    { k: "위치 정보", v: "주 보호자만" },
    { k: "AI 통화 원본 음성", v: "30일 후 자동 삭제" },
  ];
  return (
    <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      {items.map((it, idx) => (
        <li
          key={it.k}
          className={`flex items-center justify-between gap-3 px-5 py-4 ${
            idx !== items.length - 1 ? "border-b border-border/60" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-sage" />
            <p className="text-[14px] text-foreground">{it.k}</p>
          </div>
          <button className="text-[13px] font-medium text-foreground/70 transition-colors hover:text-foreground">
            {it.v} ›
          </button>
        </li>
      ))}
    </ul>
  );
}

function DangerZone() {
  return (
    <section className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[13px] font-medium text-foreground">그룹 관리</p>
        <p className="text-[12px] text-muted-foreground">신중하게 결정해주세요.</p>
      </div>
      <div className="flex items-center gap-2">
        <button className="text-[12px] text-muted-foreground transition-colors hover:text-foreground">
          그룹 나가기
        </button>
        <span className="h-3 w-px bg-border" />
        <button className="text-[12px] text-destructive/80 transition-colors hover:text-destructive">
          그룹 삭제
        </button>
      </div>
    </section>
  );
}
