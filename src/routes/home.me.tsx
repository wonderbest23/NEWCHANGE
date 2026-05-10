import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { useAuth } from "@/lib/auth/mock-auth";
import { MyPageSections } from "@/components/settings/MyPageSections";
import { BadgesSection } from "@/components/settings/BadgesSection";
import { WalkCheckinCard } from "@/components/engagement/WalkCheckinCard";
import { listConversations } from "@/server/messages/messages.functions";
import { anonLabelForPair } from "@/lib/community/anon";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronRight,
  Users,
  Mail,
  HeartHandshake,
  Phone,
  FileText,
  Shield,
  MessageSquare,
  LogOut,
} from "lucide-react";

export const Route = createFileRoute("/home/me")({
  ssr: false,
  head: () => ({ meta: [{ title: "내 정보 — 곁" }] }),
  component: MyPage,
});

type Convo = Awaited<ReturnType<typeof listConversations>>[number];

function MyPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const initial = user?.nickname?.[0]?.toUpperCase() ?? "곁";

  // 보호자 연결 수
  const [guardianCount, setGuardianCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      const { data: fams } = await supabase
        .from("family_members")
        .select("family_id")
        .eq("user_id", user.id);
      const famIds = (fams ?? []).map((f: any) => f.family_id);
      if (famIds.length === 0) {
        if (active) setGuardianCount(0);
        return;
      }
      const { data: members } = await supabase
        .from("family_members")
        .select("user_id, role")
        .in("family_id", famIds);
      if (!active) return;
      const others = (members ?? []).filter((m: any) => m.user_id !== user.id).length;
      setGuardianCount(others);
    })();
    return () => { active = false; };
  }, [user?.id]);

  // 최근 쪽지 미리보기
  const [convos, setConvos] = useState<Convo[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const h = await authHeaders();
        const r = await listConversations({ headers: h });
        setConvos(r.slice(0, 3));
      } catch {
        setConvos([]);
      }
    })();
  }, []);

  const totalUnread = (convos ?? []).reduce((s, c) => s + (c.unread ?? 0), 0);

  return (
    <SeniorAppLayout>
      {/* ── 프로필 히어로 ── */}
      <div className="pb-6 pt-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/80 to-primary text-2xl font-bold text-primary-foreground shadow-soft">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold text-foreground">
              {user?.nickname ?? "안녕하세요"}
            </h1>
            {user?.email && (
              <p className="mt-0.5 truncate text-sm text-foreground/50">{user.email}</p>
            )}
          </div>
        </div>

        {/* 퀵 스탯 */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            to="/home/invite"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition hover:border-primary/40"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">연결된 가족</p>
              <p className="text-base font-bold text-foreground">
                {guardianCount === null ? "…" : `${guardianCount}명`}
              </p>
            </div>
          </Link>
          <Link
            to="/home/messages"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition hover:border-primary/40"
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-primary">
              <Mail className="h-5 w-5" />
              {totalUnread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {totalUnread}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">쪽지함</p>
              <p className="text-base font-bold text-foreground">
                {convos === null ? "…" : convos.length === 0 ? "없음" : `${convos.length}건`}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* ── 내 정보 / 알림 / 구매 섹션 ── */}
      <MyPageSections />

      {/* ── 산책 인증 ── */}
      <WalkCheckinCard />

      {/* ── 나의 칭호 ── */}
      <BadgesSection />

      {/* ── 쪽지함 미리보기 ── */}
      <section className="mt-8 rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold text-foreground">쪽지함</h2>
            {totalUnread > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                {totalUnread}
              </span>
            )}
          </div>
          <Link
            to="/home/messages"
            className="flex items-center gap-0.5 text-xs font-medium text-primary"
          >
            전체보기 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {convos === null ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">불러오는 중…</p>
        ) : convos.length === 0 ? (
          <p className="px-4 pb-5 text-sm text-muted-foreground">아직 주고받은 쪽지가 없어요.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {convos.map((c) => (
              <li key={c.partnerId}>
                <Link
                  to="/home/messages/$partnerId"
                  params={{ partnerId: c.partnerId }}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-soft text-sm font-semibold text-primary">
                    {anonLabelForPair(user?.id ?? "", c.partnerId).replace("익명 #", "").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {anonLabelForPair(user?.id ?? "", c.partnerId)}
                      </span>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.lastBody}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 보호자 연결 ── */}
      <section className="mt-4 rounded-2xl border border-border bg-card">
        <Link
          to="/home/invite"
          className="flex items-center gap-3 px-4 py-4 transition hover:bg-surface"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">가족 / 보호자 연결</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {guardianCount === null
                ? "불러오는 중…"
                : guardianCount > 0
                ? `${guardianCount}명과 연결됨 · 관리하기`
                : "보호자를 초대해 안부를 함께 나눠요"}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      {/* ── 고객센터 ── */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
        <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          고객센터
        </p>
        <ul className="divide-y divide-border/50">
          <li>
            <a
              href="tel:1588-0000"
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm text-foreground">전화 문의 · 1588-0000</span>
              <span className="text-xs text-muted-foreground">평일 9–18시</span>
            </a>
          </li>
          <li>
            <a
              href="mailto:help@gyeot.kr"
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface"
            >
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm text-foreground">1:1 이메일 문의</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </a>
          </li>
          <li>
            <Link
              to="/policy"
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm text-foreground">이용약관</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
          <li>
            <Link
              to="/policy/$slug"
              params={{ slug: "privacy" }}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface"
            >
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm text-foreground">개인정보처리방침</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        </ul>
      </section>

      {/* ── 로그아웃 ── */}
      <button
        type="button"
        className="mt-6 mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border/50 py-3.5 text-sm font-medium text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
        onClick={async () => {
          await signOut();
          navigate({ to: "/" });
        }}
      >
        <LogOut className="h-4 w-4" />
        로그아웃
      </button>
    </SeniorAppLayout>
  );
}
