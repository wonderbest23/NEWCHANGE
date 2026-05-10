import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  HeartPulse,
  MessageCircleHeart,
  Users,
  ShieldCheck,
  Mic,
  FileText,
  MapPin,
  Signal,
  Wifi,
  BatteryFull,
  Send,
  Phone,
  Calendar,
  Sparkles,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "곁 — 매일 1분, 음성으로 안부를 잇습니다" },
      {
        name: "description",
        content:
          "시니어가 직접 쓰는 음성 안부 앱. 큰 화면, 한 번의 통화, 가족과 한 줄 요약 공유.",
      },
      { property: "og:title", content: "곁 — 매일 1분, 음성으로 안부를 잇습니다" },
      {
        property: "og:description",
        content: "시니어 중심 음성 안부 + 가족 공유. 진단·치료는 하지 않습니다.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <PublicLayout>
      <Hero />
      <FeatureList />
      <HowItWorks />
      <ForFamilies />
      <CTA />
    </PublicLayout>
  );
}

/* ─────────────────────────────────────────────────────────── HERO ── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* 배경 글로우 블롭 */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/8 blur-3xl animate-blob" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-amber-warm/10 blur-3xl animate-blob delay-300" aria-hidden />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-20 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_420px] lg:gap-20 lg:pb-28">
        <div className="flex flex-col gap-7 animate-rise-in">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-rose-soft/80 px-4 py-1.5 text-xs font-semibold text-primary/80 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            매일 1분, 음성으로 안부
          </span>

          <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-5xl md:text-6xl text-balance">
            오늘도 곁에서
            <br />
            <span className="text-primary">함께 있어요.</span>
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            큰 글씨와 한 번의 음성으로 어르신이 직접 안부를 나누고,
            가족은 오늘의 한 줄 요약으로 함께합니다.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="xl" className="gap-2 rounded-full px-8 shadow-glow transition-all hover:scale-[1.02] active:scale-[0.98]">
              <Link to="/auth">
                무료로 시작하기 <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="xl" variant="ghost" className="gap-1 rounded-full px-5 hover:bg-rose-soft/60">
              <Link to="/auth">로그인</Link>
            </Button>
          </div>

          {/* 신뢰 배지 */}
          <div className="flex flex-wrap gap-3 mt-1">
            {["AI 진단·처방 없음", "가족 공유", "매일 1분"].map((badge) => (
              <span key={badge} className="inline-flex items-center gap-1.5 rounded-full bg-sage/10 px-3 py-1 text-xs font-semibold text-sage">
                <Check className="h-3 w-3" /> {badge}
              </span>
            ))}
          </div>
        </div>

        <div className="animate-rise-in delay-200">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────── PHONE MOCKUP ── */

const SCREEN_LABELS = ["안부 통화", "오늘 결과", "가족 화면", "커뮤니티"];
const TOTAL_SCREENS = 4;

function PhoneMockup() {
  const [screen, setScreen] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setScreen((s) => (s + 1) % TOTAL_SCREENS);
        setFading(false);
      }, 280);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[380px] lg:max-w-[400px] animate-float-sm">
      {/* 배경 글로우 */}
      <div className="absolute -inset-4 rounded-[4rem] bg-primary/12 blur-3xl" aria-hidden />
      <div className="absolute -inset-2 rounded-[3.5rem] bg-amber-warm/8 blur-2xl" aria-hidden />

      {/* 아이폰 17 프레임 */}
      <div className="relative rounded-[3.2rem] bg-gradient-to-b from-zinc-700 to-zinc-900 p-[3px] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.15)]">
        {/* 측면 버튼 */}
        <div className="absolute -left-[3px] top-28 h-8 w-[3px] rounded-l-sm bg-zinc-600" aria-hidden />
        <div className="absolute -left-[3px] top-40 h-14 w-[3px] rounded-l-sm bg-zinc-600" aria-hidden />
        <div className="absolute -left-[3px] top-56 h-14 w-[3px] rounded-l-sm bg-zinc-600" aria-hidden />
        <div className="absolute -right-[3px] top-36 h-20 w-[3px] rounded-r-sm bg-zinc-600" aria-hidden />

        <div className="relative overflow-hidden rounded-[3rem] bg-background">
          {/* Dynamic Island */}
          <div className="absolute left-1/2 top-3 z-20 h-8 w-[120px] -translate-x-1/2 rounded-full bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]" aria-hidden />

          {/* 상태바 */}
          <div className="relative z-10 flex items-center justify-between px-8 pb-1 pt-5 text-[11px] font-semibold text-foreground">
            <span className="font-bold">9:41</span>
            <div className="flex items-center gap-1.5">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <BatteryFull className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* 화면 전환 영역 */}
          <div
            className="transition-all duration-[280ms] ease-in-out"
            style={{ opacity: fading ? 0 : 1, transform: fading ? "translateY(6px)" : "translateY(0)" }}
          >
            {screen === 0 && <ScreenHome />}
            {screen === 1 && <ScreenResult />}
            {screen === 2 && <ScreenGuardian />}
            {screen === 3 && <ScreenCommunity />}
          </div>

          {/* 화면 인디케이터 도트 */}
          <div className="flex items-center justify-center gap-1.5 pb-2 pt-1">
            {Array.from({ length: TOTAL_SCREENS }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={SCREEN_LABELS[i]}
                onClick={() => { setFading(true); setTimeout(() => { setScreen(i); setFading(false); }, 280); }}
                className={cn(
                  "rounded-full transition-all duration-300",
                  i === screen ? "w-5 h-[5px] bg-primary" : "w-[5px] h-[5px] bg-foreground/20",
                )}
              />
            ))}
          </div>

          {/* 하단 홈 인디케이터 */}
          <div className="flex justify-center pb-3">
            <div className="h-[5px] w-32 rounded-full bg-foreground/20" />
          </div>
        </div>
      </div>

      {/* 화면 레이블 */}
      <p className="mt-4 text-center text-[11px] font-semibold uppercase tracking-widest text-foreground/40 transition-all duration-300">
        {SCREEN_LABELS[screen]}
      </p>
    </div>
  );
}

/* ── 화면 1: 안부 통화 홈 ── */
function ScreenHome() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60">5월 10일 토요일</p>
          <p className="font-display text-xl font-bold text-foreground leading-tight">좋은 아침,<br />어머님 👋</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-soft font-bold text-sm text-primary">김</div>
      </div>

      <div className="relative overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-rose-soft via-background to-amber-soft p-5">
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/8 blur-xl" aria-hidden />
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-3">✦ 오늘의 안부 통화</p>
        <div className="flex flex-col items-center gap-3 py-1">
          <div className="relative flex h-28 w-28 items-center justify-center">
            <div className="absolute h-28 w-28 rounded-full border-2 border-primary/15 animate-pulse-ring" />
            <div className="absolute h-[88px] w-[88px] rounded-full border-2 border-primary/22 animate-pulse-ring delay-300" />
            <div className="absolute h-[68px] w-[68px] rounded-full border-2 border-primary/30 animate-pulse-ring delay-500" />
            <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_6px_oklch(0.52_0.16_22_/_0.14)]">
              <Mic className="h-6 w-6" />
            </div>
          </div>
          <div className="text-center">
            <p className="font-display text-[13px] font-bold text-foreground">안부 통화 시작</p>
            <p className="text-[10px] text-foreground/50 mt-0.5">버튼을 누르면 곁이 인사해요</p>
          </div>
        </div>
        <div className="flex items-end justify-center gap-[3px] h-5 mt-2" aria-hidden>
          {[30, 60, 45, 85, 55, 100, 50, 80, 40, 65, 35].map((h, i) => (
            <div key={i} className="w-[3px] rounded-full bg-primary/25 animate-wave" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "기분", v: "😊", label: "좋음", color: "bg-rose-soft" },
          { k: "식사", v: "🍚", label: "챙김", color: "bg-amber-soft" },
          { k: "복약", v: "💊", label: "완료", color: "bg-sage-soft" },
        ].map((s) => (
          <div key={s.k} className={`rounded-2xl ${s.color} px-2 py-2.5 text-center`}>
            <span className="text-base">{s.v}</span>
            <p className="text-[9px] text-foreground/55 mt-0.5">{s.k}</p>
            <p className="text-[10px] font-bold text-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 화면 2: 통화 완료 결과 ── */
function ScreenResult() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-sage/70">통화 완료 ✓</p>
          <p className="font-display text-xl font-bold text-foreground leading-tight">오늘의 결과</p>
        </div>
        <span className="rounded-full bg-sage/15 px-2.5 py-1 text-[9px] font-bold text-sage">가족 공유됨</span>
      </div>

      {/* 감정 카드 */}
      <div className="relative overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-amber-soft to-rose-soft/40 p-5 text-center">
        <div className="pointer-events-none absolute -left-8 -top-8 h-28 w-28 rounded-full bg-amber-warm/15 blur-2xl" aria-hidden />
        <div className="text-5xl mb-2">😊</div>
        <p className="font-display text-base font-bold text-foreground">오늘은 평온해요</p>
        <p className="text-[10px] text-foreground/55 mt-1 leading-relaxed">식사도 잘 하셨고<br />무릎은 어제보다 나아졌대요</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-background/70 p-2">
            <p className="text-[9px] text-foreground/45">컨디션</p>
            <p className="text-[10px] font-bold text-sage">● 양호</p>
          </div>
          <div className="rounded-xl bg-background/70 p-2">
            <p className="text-[9px] text-foreground/45">기분</p>
            <p className="text-[10px] font-bold text-amber-warm">😊 좋음</p>
          </div>
        </div>
      </div>

      {/* AI 요약 */}
      <div className="rounded-2xl border border-border/50 bg-background p-3.5">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="h-3 w-3 text-primary" />
          <p className="text-[10px] font-bold text-primary">AI 한 줄 요약</p>
        </div>
        <p className="text-[11px] text-foreground/70 leading-relaxed">어머님, 오늘 컨디션 양호해요. 무릎 통증이 줄었고 식사도 잘 하셨어요.</p>
      </div>

      {/* 이번 주 흐름 */}
      <div className="rounded-2xl border border-border/50 bg-background p-3.5">
        <p className="text-[10px] font-bold text-foreground mb-2">이번 주 흐름</p>
        <div className="flex items-end gap-1 h-10">
          {[65, 80, 55, 90, 75, 85, 70].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/60 to-primary/20" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
            <span key={d} className="flex-1 text-center text-[8px] text-foreground/35">{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 화면 3: 가족 보호자 뷰 ── */
function ScreenGuardian() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60">보호자 화면</p>
          <p className="font-display text-xl font-bold text-foreground leading-tight">어머니의 오늘</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-soft font-bold text-sm text-sage">지</div>
      </div>

      {/* 어머니 상태 카드 */}
      <div className="rounded-[1.6rem] border border-sage/30 bg-sage/8 p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-soft font-bold text-sm text-primary">김</div>
          <div>
            <p className="text-[11px] font-bold text-foreground">김순자 어머님</p>
            <p className="text-[9px] font-semibold text-sage flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-sage inline-block" /> 오늘 통화 완료
            </p>
          </div>
          <span className="ml-auto text-[9px] text-foreground/40">10분 전</span>
        </div>
        <p className="text-[11px] text-foreground/70 leading-relaxed italic">"오늘 컨디션이 좋아요. 무릎이 조금 나아졌어요. 밥도 잘 먹었어요."</p>
      </div>

      {/* 주간 통계 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border/50 bg-background p-3">
          <p className="text-[9px] text-foreground/45">이번 주 통화</p>
          <p className="text-[13px] font-bold text-foreground mt-0.5">5 / 7일</p>
          <div className="flex gap-0.5 mt-2">
            {[1, 1, 1, 0, 1, 1, 0].map((d, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${d ? "bg-sage" : "bg-border"}`} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background p-3">
          <p className="text-[9px] text-foreground/45">평균 컨디션</p>
          <p className="text-[13px] font-bold text-sage mt-0.5">😊 좋음</p>
          <p className="text-[9px] text-foreground/40 mt-1">지난 7일 기준</p>
        </div>
      </div>

      {/* 알림 카드들 */}
      <div className="flex items-center gap-2.5 rounded-2xl bg-amber-soft/60 border border-amber-warm/20 p-3">
        <span className="text-base">💊</span>
        <div>
          <p className="text-[10px] font-bold text-foreground">복약 완료</p>
          <p className="text-[9px] text-foreground/55">오늘 약 복용하셨어요</p>
        </div>
        <span className="ml-auto text-[9px] text-foreground/35">오전 8시</span>
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-background p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-soft text-sage">
          <MessageCircleHeart className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-foreground">딸 김지현님이 확인했어요</p>
          <p className="text-[9px] text-foreground/45 truncate">건강하게 지내시길 바라요 💚</p>
        </div>
      </div>
    </div>
  );
}

/* ── 화면 4: 커뮤니티 ── */
function ScreenCommunity() {
  const posts = [
    { icon: "🏃", title: "무릎에 좋은 스트레칭 공유해요", area: "서울 노원구", time: "5분 전", likes: 12, cat: "정보공유" },
    { icon: "🏥", title: "어르신 무료 건강검진 안내", area: "경기 수원시", time: "23분 전", likes: 31, cat: "동네소식" },
    { icon: "🌸", title: "날씨 좋아서 산책하고 왔어요 😊", area: "서울 마포구", time: "1시간 전", likes: 8, cat: "일상" },
  ];
  return (
    <div className="flex flex-col gap-3 px-5 pt-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60">커뮤니티</p>
        <p className="font-display text-xl font-bold text-foreground leading-tight">이웃과 소통해요</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {["전체", "정보공유", "동네소식"].map((t, i) => (
          <div key={t} className={cn("flex-1 rounded-lg py-1.5 text-center text-[10px] font-bold", i === 0 ? "bg-background text-foreground shadow-soft" : "text-foreground/40")}>
            {t}
          </div>
        ))}
      </div>

      {/* 게시물 목록 */}
      <div className="flex flex-col gap-2">
        {posts.map((p, i) => (
          <div key={i} className="flex items-start gap-2.5 rounded-2xl border border-border/50 bg-background p-3 hover:bg-rose-soft/20 transition-colors">
            <span className="text-xl mt-0.5 shrink-0">{p.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p className="text-[11px] font-bold text-foreground leading-snug">{p.title}</p>
                <span className="shrink-0 text-[9px] text-foreground/35 mt-0.5">♥ {p.likes}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className="rounded-full bg-primary/8 px-1.5 py-0.5 text-[8px] font-semibold text-primary">{p.cat}</span>
                <span className="text-[8px] text-foreground/35">{p.area} · {p.time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/30 p-3 text-[10px] font-semibold text-primary/60">
        <MapPin className="h-3 w-3" /> 내 동네 게시판 더 보기
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── FEATURES ── */

const FEATURES = [
  { icon: Mic,               title: "음성 안부 통화",      desc: "큰 버튼 한 번이면 곁이 한국어로 안부를 묻습니다." },
  { icon: MessageCircleHeart,title: "어제 대화를 이어서",   desc: "어제 '무릎이 시큰'하다 하셨다면 오늘은 '좀 어떠세요?'로 시작." },
  { icon: FileText,           title: "오늘의 한 줄 요약",   desc: "통화 결과를 한 문장으로 정리해 가족에게 전합니다." },
  { icon: HeartPulse,         title: "오늘·이번 주·자세히", desc: "컨디션과 7일 흐름을 시니어가 직접 확인하는 3개의 탭." },
  { icon: Users,              title: "가족 그룹 & 초대",    desc: "이메일 링크로 형제·자매를 같은 그룹에 초대." },
  { icon: MapPin,             title: "동네 정보",           desc: "지역 기반의 생활 정보와 팁을 한 곳에서." },
  { icon: ShieldCheck,        title: "안전 가드",           desc: "AI는 진단·처방·치료를 하지 않습니다." },
];

function FeatureList() {
  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="mb-10 animate-rise-in">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            할 수 있는 것
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold text-foreground sm:text-3xl">
            앱 안에 실제로 있는 기능
          </h2>
        </div>

        <ul className="overflow-hidden rounded-2xl border border-border/50 bg-background shadow-soft animate-rise-in delay-100">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <li
              key={title}
              className={cn(
                "flex items-center gap-4 px-5 py-4 transition-colors hover:bg-rose-soft/30",
                i !== FEATURES.length - 1 && "border-b border-border/50",
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-soft">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-semibold text-foreground">
                  {title}
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                  {desc}
                </p>
              </div>
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/30" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────── HOW IT WORKS ── */

const STEPS = [
  { icon: Users,  title: "가족 그룹 만들기",  desc: "가입하면 본인의 가족 공간이 자동 생성돼요." },
  { icon: Send,   title: "형제·자매 초대",     desc: "초대 링크 한 번이면 같은 화면을 보게 돼요." },
  { icon: Phone,  title: "매일 1분, 음성 안부", desc: "큰 버튼을 눌러 곁과 통화. 요약이 가족에게 공유됩니다." },
];

function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-6 sm:py-20">
      <div className="mb-10 animate-rise-in">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
          시작하는 법
        </span>
        <h2 className="mt-3 font-display text-2xl font-semibold text-foreground sm:text-3xl">
          3분이면 충분해요.
        </h2>
      </div>

      <ol className="flex flex-col gap-3 animate-rise-in delay-100">
        {STEPS.map(({ icon: Icon, title, desc }, i) => (
          <li key={title} className="flex items-start gap-4 rounded-2xl border border-border/50 bg-card p-5 shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-elevated">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
              <Icon className="h-5 w-5" />
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                {i + 1}
              </span>
            </span>
            <div className="pt-0.5">
              <p className="font-display text-[15px] font-semibold text-foreground">
                {title}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {desc}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ─────────────────────────────────────────── FOR FAMILIES ── */

const FOR_ITEMS = [
  { title: "시니어 (본인)",   desc: "큰 버튼과 음성으로 안부를 직접 기록해요.",     icon: HeartPulse,        tone: "bg-rose-soft text-primary" },
  { title: "초대받은 가족",  desc: "오늘의 한 줄 요약과 7일 흐름을 함께 봅니다.",  icon: Users,              tone: "bg-sage-soft text-sage" },
  { title: "여러 보호자",    desc: "형제·자매가 같은 그룹에서 함께 관리해요.",     icon: MessageCircleHeart, tone: "bg-amber-soft text-amber-warm" },
];

function ForFamilies() {
  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="mb-10 animate-rise-in">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            누가 쓰나요
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold text-foreground sm:text-3xl">
            시니어가 중심, 가족은 곁에서.
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 animate-rise-in delay-100">
          {FOR_ITEMS.map(({ title, desc, icon: Icon, tone }) => (
            <div
              key={title}
              className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-background p-5 shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated"
            >
              <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tone)}>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-[15px] font-semibold text-foreground">
                  {title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────── CTA ── */

function CTA() {
  return (
    <section className="px-5 pb-24 pt-4 sm:px-6">
      <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-3xl bg-foreground p-8 text-background shadow-elevated sm:p-12">
        {/* 배경 장식 */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-12 left-8 h-36 w-36 rounded-full bg-primary/20 blur-2xl" aria-hidden />

        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider opacity-60">
              <Calendar className="h-3 w-3" /> 지금 시작하기
            </p>
            <h2 className="mt-3 font-display text-2xl leading-tight sm:text-3xl text-balance">
              오늘, 부모님께
              <br />
              한 번 더 안부를.
            </h2>
            <p className="mt-2 text-sm opacity-60">회원가입 무료 · 카드 불필요</p>
          </div>
          <Button
            asChild
            size="xl"
            className="shrink-0 rounded-full bg-background px-8 text-foreground shadow-soft hover:bg-background/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Link to="/auth">
              무료로 시작 <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
