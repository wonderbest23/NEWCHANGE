import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { useAuth } from "@/lib/auth/mock-auth";
import { MyPageSections } from "@/components/settings/MyPageSections";
import { listConversations } from "@/server/messages/messages.functions";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { recordWalkCheckin, getWalkStats } from "@/lib/engagement/walk-actions";
import { getMyBadges, type Badge as UserBadge } from "@/lib/engagement/badges-actions";
import { denyCareMemoryItem, listCareMemoryItems } from "@/lib/checkin/checkin-actions";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronLeft,
  Users,
  Mail,
  HeartHandshake,
  Phone,
  FileText,
  Shield,
  MessageSquare,
  LogOut,
  User as UserIcon,
  Bell,
  Footprints,
  Award,
  CheckCircle2,
  Loader2,
  Brain,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/home/me")({
  ssr: false,
  head: () => ({ meta: [{ title: "내 정보 — 곁" }] }),
  component: MyPage,
});

const NOTIF_KEY = "gyeot.notif.settings.v1";
type NotifSettings = {
  enabled: boolean;
  checkinTime: string;
  meal: boolean;
  medicine: boolean;
  shareToGuardian: boolean;
};
const DEFAULT_NOTIF: NotifSettings = {
  enabled: true,
  checkinTime: "09:00",
  meal: true,
  medicine: true,
  shareToGuardian: true,
};

function MyPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // 편집 모드 — "내 정보 수정" 카드 클릭 시 활성화
  const [editing, setEditing] = useState(false);

  // 핵심 데이터 — 가족 인원 / 미읽은 쪽지 / 산책 / 칭호
  const [guardianCount, setGuardianCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      const { data: fams } = await supabase
        .from("family_members").select("family_id").eq("user_id", user.id);
      const famIds = (fams ?? []).map((f: any) => f.family_id);
      if (famIds.length === 0) { if (active) setGuardianCount(0); return; }
      const { data: members } = await supabase
        .from("family_members").select("user_id, role").in("family_id", famIds);
      if (!active) return;
      setGuardianCount((members ?? []).filter((m: any) => m.user_id !== user.id).length);
    })();
    return () => { active = false; };
  }, [user?.id]);

  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const h = await authHeaders();
        const r = await listConversations({ headers: h });
        setUnreadCount(r.reduce((s, c) => s + (c.unread ?? 0), 0));
      } catch { setUnreadCount(0); }
    })();
  }, []);

  const { data: walk } = useQuery({
    queryKey: ["walk-stats"],
    queryFn: async () => getWalkStats({ headers: await authHeaders() } as any),
    staleTime: 30_000,
  });
  const { data: badges } = useQuery({
    queryKey: ["my-badges"],
    queryFn: async () => getMyBadges({ headers: await authHeaders() } as any),
    staleTime: 60_000,
  });
  const { data: careMemories, isLoading: memoriesLoading } = useQuery({
    queryKey: ["care-memory-items"],
    queryFn: async () => listCareMemoryItems({ headers: await authHeaders() } as any),
    staleTime: 30_000,
  });
  const forgetMemoryMutation = useMutation({
    mutationFn: async (memoryId: string) =>
      denyCareMemoryItem({ data: { memoryId }, headers: await authHeaders() } as any),
    onSuccess: () => {
      toast.success("이 기억은 다음 안부전화에 쓰지 않을게요.");
      qc.invalidateQueries({ queryKey: ["care-memory-items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "기억 삭제에 실패했어요"),
  });
  const earnedCount = badges?.badges.filter((b) => b.earned).length ?? 0;
  const totalBadges = badges?.badges.length ?? 0;

  // 산책 인증
  const [walkBusy, setWalkBusy] = useState(false);
  const walkMutation = useMutation({
    mutationFn: async (coords: { latitude: number; longitude: number; accuracy_m: number | null }) =>
      recordWalkCheckin({ data: coords, headers: await authHeaders() } as any),
    onSuccess: (res) => {
      if ((res as any)?.alreadyDone) toast.info("오늘은 이미 산책을 인증하셨어요");
      else toast.success("산책 인증 완료! 칭호가 한 발짝 가까워졌어요 🌳");
      qc.invalidateQueries({ queryKey: ["walk-stats"] });
      qc.invalidateQueries({ queryKey: ["my-badges"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장에 실패했어요"),
  });
  const handleWalkCheckin = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("이 기기는 위치 확인을 지원하지 않아요");
      return;
    }
    setWalkBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWalkBusy(false);
        walkMutation.mutate({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
        });
      },
      (err) => {
        setWalkBusy(false);
        const msg = err.code === err.PERMISSION_DENIED
          ? "위치 사용을 허용해 주세요"
          : "위치를 확인하지 못했어요";
        toast.error(msg);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };
  const walkDoneToday = !!walk?.doneToday;

  // 알림 — 압축 한 줄 + 더보기
  const [notif, setNotif] = useState<NotifSettings>(DEFAULT_NOTIF);
  const [notifAdvanced, setNotifAdvanced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(NOTIF_KEY);
      if (raw) setNotif({ ...DEFAULT_NOTIF, ...JSON.parse(raw) });
    } catch { /* noop */ }
  }, []);
  const saveNotif = (next: Partial<NotifSettings>) => {
    const merged = { ...notif, ...next };
    setNotif(merged);
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify(merged)); } catch { /* noop */ }
  };

  const initial = user?.nickname?.[0]?.toUpperCase() ?? "곁";

  // ── 편집 모드 ──────────────────────────
  if (editing) {
    return (
      <SeniorAppLayout>
        <div className="flex items-center gap-2 pt-3 pb-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface"
            aria-label="뒤로"
          >
            <ChevronLeft className="h-6 w-6 text-foreground" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">내 정보 수정</h1>
        </div>
        <MyPageSections showOnly="profile" />
      </SeniorAppLayout>
    );
  }

  // ── 메인 ──────────────────────────────
  return (
    <SeniorAppLayout>
      {/* ── 1. 프로필 히어로 ── */}
      <section className="flex items-center gap-4 pt-3 pb-2 animate-rise-in">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/85 to-primary text-3xl font-bold text-primary-foreground shadow-soft">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold text-foreground">
            {user?.nickname ?? "안녕하세요"}
          </h1>
          {user?.email && (
            <p className="mt-1 truncate text-sm text-foreground/55">{user.email}</p>
          )}
        </div>
      </section>

      {/* ── 2. 핵심 5개 시각 카드 ──
       *   (1) 내 정보 수정 (2) 쪽지함 (3) 가족 연결 (4) 나의 칭호 (5) 오늘의 산책
       *   2x2 그리드 + 산책 인증은 마지막 풀폭 (CTA 비주얼) */}
      <section className="mt-5 animate-rise-in delay-100">
        <h2 className="mb-3 px-1 font-display text-lg font-bold text-foreground">자주 쓰는 메뉴</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <BigTile
            onClick={() => setEditing(true)}
            label="내 정보 수정"
            sub="이름·지역·관심사"
            icon={<UserIcon className="h-6 w-6" />}
            tone="from-rose-soft to-amber-soft text-primary"
          />
          <BigTile
            to="/home/messages"
            label="쪽지함"
            sub={unreadCount === null ? "불러오는 중" : unreadCount > 0 ? `안 읽은 쪽지 ${unreadCount}건` : "주고받은 쪽지"}
            icon={<Mail className="h-6 w-6" />}
            tone="from-primary/15 to-primary/5 text-primary"
            badge={unreadCount && unreadCount > 0 ? unreadCount : undefined}
          />
          <BigTile
            to="/home/invite"
            label="가족 연결"
            sub={
              guardianCount === null ? "불러오는 중"
                : guardianCount > 0 ? `${guardianCount}명과 연결됨`
                : "보호자를 초대해요"
            }
            icon={<HeartHandshake className="h-6 w-6" />}
            tone="from-sage-soft to-emerald-50 text-sage"
          />
          <BigTile
            label="나의 칭호"
            sub={badges ? `${earnedCount} / ${totalBadges}개 달성` : "불러오는 중"}
            icon={<Award className="h-6 w-6" />}
            tone="from-amber-soft to-rose-soft text-amber-warm"
            scrollTo="badges-section"
          />
        </div>

        {/* 5번째 — 오늘의 산책 (큰 풀폭 CTA) */}
        <button
          type="button"
          onClick={handleWalkCheckin}
          disabled={walkDoneToday || walkBusy || walkMutation.isPending}
          className={cn(
            "mt-2.5 flex w-full items-center gap-4 overflow-hidden rounded-3xl border-2 px-5 py-4 text-left shadow-soft transition active:scale-[0.99] disabled:cursor-not-allowed",
            walkDoneToday
              ? "border-sage/40 bg-sage-soft"
              : "border-primary/30 bg-gradient-to-br from-rose-soft via-background to-amber-soft hover:border-primary/50",
          )}
        >
          <span
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-soft",
              walkDoneToday ? "bg-sage text-background" : "bg-primary text-primary-foreground",
            )}
          >
            {walkDoneToday ? (
              <CheckCircle2 className="h-7 w-7" />
            ) : walkBusy || walkMutation.isPending ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : (
              <Footprints className="h-7 w-7" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-foreground">
              {walkDoneToday ? "오늘 산책 인증 완료" : "오늘의 산책 인증하기"}
            </p>
            <p className="mt-0.5 text-sm text-foreground/60">
              {walkDoneToday
                ? `연속 ${walk?.streak ?? 0}일째 · 칭호 1걸음 더!`
                : "밖에 나가셨다면 위치로 인증하고 칭호를 모아보세요"}
            </p>
          </div>
          {!walkDoneToday && <ChevronRight className="h-5 w-5 shrink-0 text-foreground/40" />}
        </button>
      </section>

      {/* ── 3. 알림 설정 — 1줄 + 더보기 ── */}
      <section className="mt-6 animate-rise-in delay-150 overflow-hidden rounded-2xl border-2 border-border/60 bg-background">
        {/* 마스터 한 줄 */}
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-soft">
            <Bell className="h-5 w-5 text-amber-warm" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-foreground">전체 알림</p>
            <p className="mt-0.5 text-xs text-foreground/55">
              {notif.enabled ? `매일 ${notif.checkinTime} 안부 · 식사·약 알림` : "알림이 꺼져 있어요"}
            </p>
          </div>
          <Switch
            checked={notif.enabled}
            onCheckedChange={(v) => saveNotif({ enabled: v })}
            aria-label="전체 알림"
          />
        </div>

        {/* 더보기 토글 */}
        <button
          type="button"
          onClick={() => setNotifAdvanced((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-border/50 py-2.5 text-xs font-semibold text-foreground/60 transition hover:bg-surface"
          aria-expanded={notifAdvanced}
        >
          {notifAdvanced ? "간단히 보기" : "상세 알림 설정"}
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", notifAdvanced && "rotate-90")} />
        </button>

        {/* 상세 (펼쳤을 때) */}
        {notifAdvanced && (
          <div className="border-t border-border/50">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <Label htmlFor="notif-time" className="text-sm font-medium text-foreground">건강체크 시간</Label>
              <Input
                id="notif-time"
                type="time"
                value={notif.checkinTime}
                onChange={(e) => saveNotif({ checkinTime: e.target.value })}
                disabled={!notif.enabled}
                className="h-9 w-32 rounded-lg px-3 text-sm"
              />
            </div>
            <div className="border-t border-border/50" />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium text-foreground">식사 알림</span>
              <Switch checked={notif.meal} onCheckedChange={(v) => saveNotif({ meal: v })} disabled={!notif.enabled} />
            </div>
            <div className="border-t border-border/50" />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium text-foreground">약 복용 알림</span>
              <Switch checked={notif.medicine} onCheckedChange={(v) => saveNotif({ medicine: v })} disabled={!notif.enabled} />
            </div>
            <div className="border-t border-border/50" />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">보호자에게 공유</p>
                <p className="mt-0.5 text-xs text-foreground/55">기록을 자동으로 보호자에게 전달</p>
              </div>
              <Switch checked={notif.shareToGuardian} onCheckedChange={(v) => saveNotif({ shareToGuardian: v })} disabled={!notif.enabled} />
            </div>
          </div>
        )}
      </section>

      {/* ── 4. AI 기억 관리 ── */}
      <section className="mt-6 animate-rise-in delay-200">
        <CareMemorySection
          memories={careMemories ?? []}
          loading={memoriesLoading}
          deletingId={forgetMemoryMutation.variables ?? null}
          onForget={(id) => forgetMemoryMutation.mutate(id)}
        />
      </section>

      {/* ── 5. 칭호 상세 (스크롤 앵커) ── */}
      <section id="badges-section" className="mt-6 animate-rise-in delay-200">
        <BadgesDetail
          earned={earnedCount}
          total={totalBadges}
          stats={badges?.stats}
          badges={badges?.badges ?? []}
          loading={!badges}
        />
      </section>

      {/* ── 6. 고객센터 (하단, 작게) ── */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-border/60 bg-background animate-rise-in delay-300">
        <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
          고객센터
        </p>
        <ul className="divide-y divide-border/40">
          <li>
            <a href="tel:1588-0000" className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface">
              <Phone className="h-4 w-4 text-foreground/60" />
              <span className="flex-1 text-sm text-foreground">전화 · 1588-0000</span>
              <span className="text-xs text-foreground/55">평일 9–18시</span>
            </a>
          </li>
          <li>
            <a href="mailto:help@gyeot.kr" className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface">
              <MessageSquare className="h-4 w-4 text-foreground/60" />
              <span className="flex-1 text-sm text-foreground">1:1 이메일 문의</span>
              <ChevronRight className="h-4 w-4 text-foreground/40" />
            </a>
          </li>
          <li>
            <Link to="/policy" className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface">
              <FileText className="h-4 w-4 text-foreground/60" />
              <span className="flex-1 text-sm text-foreground">이용약관</span>
              <ChevronRight className="h-4 w-4 text-foreground/40" />
            </Link>
          </li>
          <li>
            <Link to="/policy/$slug" params={{ slug: "privacy" }} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface">
              <Shield className="h-4 w-4 text-foreground/60" />
              <span className="flex-1 text-sm text-foreground">개인정보처리방침</span>
              <ChevronRight className="h-4 w-4 text-foreground/40" />
            </Link>
          </li>
        </ul>
      </section>

      {/* ── 7. 로그아웃 ── */}
      <button
        type="button"
        className="mt-5 mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border/40 py-3.5 text-sm font-medium text-foreground/55 transition hover:border-destructive/40 hover:text-destructive"
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

type CareMemoryItem = Awaited<ReturnType<typeof listCareMemoryItems>>[number];

function CareMemorySection({
  memories,
  loading,
  deletingId,
  onForget,
}: {
  memories: CareMemoryItem[];
  loading: boolean;
  deletingId: string | null;
  onForget: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border-2 border-border/60 bg-background shadow-soft">
      <div className="flex items-start gap-3 px-5 py-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Brain className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-foreground">AI가 기억하는 내용</h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground/60">
            안부전화에서 직접 말씀하신 반복 내용을 다음 질문에 참고해요.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="px-5 pb-5">
          <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
        </div>
      ) : memories.length === 0 ? (
        <div className="border-t border-border/50 px-5 py-5">
          <p className="rounded-2xl bg-surface px-4 py-3 text-sm font-medium leading-relaxed text-foreground/60">
            아직 저장된 기억이 없어요. 안부전화가 쌓이면 식사, 약, 통증 같은 반복 내용을 조심스럽게 기억해요.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/50 border-t border-border/50">
          {memories.map((memory) => (
            <li key={memory.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-primary">
                  {memoryTypeLabel(memory.memoryType)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-relaxed text-foreground">{memory.content}</p>
                  <p className="mt-1 text-xs font-medium text-foreground/45">
                    {memory.observationCount}번 확인 · 신뢰도 {Math.round(memory.confidence * 100)}%
                    {memory.lastObservedAt ? ` · ${formatMemoryDate(memory.lastObservedAt)}` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onForget(memory.id)}
                disabled={deletingId === memory.id}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-bold text-foreground/60 transition hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
              >
                {deletingId === memory.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                이 기억 쓰지 않기
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function memoryTypeLabel(type: string) {
  return {
    meal: "식사",
    medicine: "약",
    pain: "통증",
    mood: "기분",
    loneliness: "외로움",
    dizziness: "어지러움",
  }[type] ?? "기억";
}

function formatMemoryDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

/* ── 큰 시각 카드 (Link 또는 button) ─────────────────────── */
function BigTile({
  to,
  onClick,
  scrollTo,
  label,
  sub,
  icon,
  tone,
  badge,
}: {
  to?: string;
  onClick?: () => void;
  scrollTo?: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  tone: string;
  badge?: number;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-soft",
          tone,
        )}
      >
        {icon}
        {badge && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground ring-2 ring-background">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <div className="min-w-0">
        <p className="font-display text-base font-bold text-foreground">
          {label}
        </p>
        {sub && <p className="mt-0.5 truncate text-xs text-foreground/55">{sub}</p>}
      </div>
      <ChevronRight className="absolute right-3 top-3 h-4 w-4 text-foreground/30" />
    </>
  );

  const baseClass =
    "group relative flex flex-col gap-3 overflow-hidden rounded-3xl border-2 border-border/60 bg-background p-4 text-left shadow-soft transition active:scale-[0.98] hover:border-primary/40";

  if (to) {
    return <Link to={to as "/home"} className={baseClass}>{inner}</Link>;
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (onClick) onClick();
        else if (scrollTo) {
          document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }}
      className={baseClass}
    >
      {inner}
    </button>
  );
}

/* ── 칭호 상세 카드 ─────────────────────────────────── */
function BadgesDetail({
  earned,
  total,
  stats,
  badges,
  loading,
}: {
  earned: number;
  total: number;
  stats:
    | {
        checkinTotal: number;
        checkinStreak: number;
        commentsCount: number;
        likesReceived: number;
        postsCount: number;
        walkTotal: number;
        walkStreak: number;
      }
    | undefined;
  badges: UserBadge[];
  loading: boolean;
}) {
  const nextBadge = badges.find((b) => !b.earned);

  return (
    <div className="overflow-hidden rounded-3xl border-2 border-border/60 bg-background shadow-soft">
      <div className="bg-gradient-to-br from-amber-soft via-background to-rose-soft px-5 pt-5 pb-4">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-bold text-amber-warm ring-1 ring-amber-warm/20">
          <Award className="h-3.5 w-3.5" />
          마이페이지 전용
        </p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">나의 칭호</h2>
            <p className="mt-1 text-sm font-medium text-foreground/60">
              안부 통화, 산책, 이야기방 활동으로 천천히 모아요
            </p>
          </div>
          {!loading && (
            <div className="shrink-0 rounded-2xl bg-background/85 px-3 py-2 text-right ring-1 ring-border/50">
              <p className="font-display text-2xl font-bold text-primary">{earned}</p>
              <p className="text-[11px] font-semibold text-foreground/45">/{total}개</p>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="px-5 pb-5">
          <div className="mt-5 h-48 animate-pulse rounded-2xl bg-muted/40" />
        </div>
      ) : (
        <>
          {stats && (
            <div className="mx-5 mt-5 grid grid-cols-3 divide-x divide-border/40 rounded-2xl border border-border/40 bg-surface/60 py-3">
              {[
                { v: stats.checkinStreak, l: "연속 안부" },
                { v: stats.walkStreak, l: "연속 산책" },
                { v: stats.likesReceived, l: "공감 받음" },
              ].map((s) => (
                <div key={s.l} className="flex flex-col items-center justify-center gap-0.5">
                  <p className="font-display text-xl font-bold text-foreground">{s.v}</p>
                  <p className="text-[11px] font-medium text-foreground/55">{s.l}</p>
                </div>
              ))}
            </div>
          )}

          {nextBadge && (
            <div className="mx-5 mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-bold text-primary">다음으로 받을 수 있는 칭호</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-background text-2xl shadow-soft">
                  {nextBadge.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-foreground">{nextBadge.title}</p>
                  <p className="mt-0.5 text-sm text-foreground/60">{nextBadge.description}</p>
                  {nextBadge.progress && (
                    <p className="mt-1 text-xs font-semibold text-foreground/50">
                      {nextBadge.progress.current} / {nextBadge.progress.target} 만큼 했어요
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-2 px-3 pb-4">
            {badges.map((b) => {
              const pct = b.progress
                ? Math.min(100, (b.progress.current / b.progress.target) * 100)
                : b.earned
                  ? 100
                  : 0;
              return (
                <li
                  key={b.key}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-3",
                    b.earned ? "bg-surface/80" : "bg-background",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl",
                      b.earned ? "bg-gradient-to-br from-rose-soft to-amber-soft shadow-soft" : "bg-muted/50 grayscale opacity-70",
                    )}
                  >
                    {b.emoji}
                    {b.earned && (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        ✓
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-display text-base font-bold text-foreground">{b.title}</p>
                      <span className={cn("shrink-0 text-xs font-bold", b.earned ? "text-primary" : "text-foreground/45")}>
                        {b.earned ? "완료" : b.progress ? `${b.progress.current}/${b.progress.target}` : "대기"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-foreground/55">{b.description}</p>
                    {!b.earned && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/60">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary/55 to-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
