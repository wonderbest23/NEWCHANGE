import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { PostRow } from "@/components/community/PostRow";
import { CATEGORIES, type CategorySlug, type Post } from "@/lib/community/types";
import { listPosts, listCategoryCounts } from "@/server/community/queries.functions";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/mock-auth";

import { supabase } from "@/integrations/supabase/client";
import {
  LogIn,
  Lock,
  MapPin,
  Globe2,
  Lightbulb,
  ArrowRight,
  ChevronDown,
  SlidersHorizontal,
  MessageCircleHeart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WalkLeaderboard } from "@/components/engagement/WalkLeaderboard";

export const Route = createFileRoute("/community/")({
  head: () => ({
    meta: [
      { title: "곁 커뮤니티 — 우리 동네 시니어 정보" },
      {
        name: "description",
        content:
          "내 동네 이웃들의 글을 한눈에. 인증된 시니어만 글을 쓰는 정보 중심 커뮤니티.",
      },
    ],
  }),
  component: CommunityIndex,
});

type Scope = "local" | "all";

function CommunityIndex() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [profileSigungu, setProfileSigungu] = useState<string>("");
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) {
        setProfileSigungu("");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("region_sigungu")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      setProfileSigungu(data?.region_sigungu ?? "");
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const userSigungu = useMemo(() => {
    if (profileSigungu) return profileSigungu;
    if (!user?.region) return "";
    return user.region.split(" ").slice(1).join(" ").trim() || user.region;
  }, [user, profileSigungu]);

  const [scope, setScope] = useState<Scope>("all");
  useEffect(() => {
    if (userSigungu) setScope("local");
  }, [userSigungu]);
  const [activeCat, setActiveCat] = useState<CategorySlug | "all">("all");
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    listPosts({ data: activeCat === "all" ? {} : { category: activeCat } })
      .then((r) => setAllPosts(Array.isArray(r) ? r : []))
      .catch(() => setAllPosts([]));
  }, [activeCat]);

  useEffect(() => {
    listCategoryCounts()
      .then((r) => setCounts(r && typeof r === "object" ? r : {}))
      .catch(() => setCounts({}));
  }, []);

  const filtered = useMemo(() => {
    let arr = Array.isArray(allPosts) ? allPosts : [];
    if (scope === "local" && userSigungu) {
      arr = arr.filter((p) => (p.region_sigungu ?? p.author?.sigungu) === userSigungu);
    }
    const sorted = [...arr];
    sorted.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    return sorted;
  }, [allPosts, scope, userSigungu]);

  const totalCount = useMemo(
    () => Object.values(counts).reduce((s, n) => s + n, 0),
    [counts],
  );

  const [showCategories, setShowCategories] = useState(false);

  const activeCatLabel =
    activeCat === "all"
      ? "전체"
      : CATEGORIES.find((c) => c.slug === activeCat)?.name ?? "전체";

  return (
    <SeniorAppLayout>
      {/* Header — 동네정보와 같은 상단 여백으로 정리 */}
      <section>
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-3xl bg-gradient-to-br from-rose-soft/80 via-background to-sage-soft/70 px-5 py-6 shadow-soft">
            <p className="inline-flex items-center gap-2 rounded-full bg-background/85 px-3 py-1 text-sm font-bold text-primary">
              <MessageCircleHeart className="h-4 w-4" />
              이야기방
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              이웃과 편하게 나눠요
            </h1>
            <p className="mt-2 text-lg leading-relaxed text-foreground/70">
              동네 소식, 생활 질문, 좋은 정보를 큰 글씨로 볼 수 있어요.
            </p>
          </div>

          {/* 동네/전국 — 전국 먼저, 동네 두 번째 */}
          <div
            role="tablist"
            aria-label="지역 범위"
            className="mt-5 grid grid-cols-2 rounded-2xl border-2 border-border bg-surface p-1.5"
          >
            {/* 전국 */}
            <button
              type="button"
              role="tab"
              aria-selected={scope === "all"}
              onClick={() => setScope("all")}
              className={cn(
                "flex min-h-[56px] items-center justify-center gap-2 rounded-xl text-lg font-bold transition-all duration-200",
                scope === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/70 hover:text-foreground",
              )}
            >
              <Globe2 className="h-5 w-5" />
              전국
            </button>

            {/* 우리 동네 — 펄스 애니메이션으로 이동 가능 암시 */}
            <button
              type="button"
              role="tab"
              aria-selected={scope === "local"}
              disabled={!userSigungu}
              onClick={() => userSigungu && setScope("local")}
              className={cn(
                "relative flex min-h-[56px] items-center justify-center gap-2 overflow-hidden rounded-xl text-lg font-bold transition-all duration-200",
                scope === "local"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/70 hover:text-foreground",
                !userSigungu && "cursor-not-allowed opacity-40",
              )}
            >
              {/* 동네 버튼이 비활성 상태일 때 shimmer 효과 */}
              {scope !== "local" && userSigungu && (
                <span
                  className="pointer-events-none absolute inset-y-0 w-1/2 animate-[shimmer-slide_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/20 to-transparent"
                  aria-hidden
                />
              )}
              <MapPin className={cn("h-5 w-5 shrink-0", scope !== "local" && userSigungu && "animate-bounce")} />
              <span>{userSigungu || "우리 동네"}</span>
            </button>
          </div>

          {/* 카테고리 — 토글 방식 */}
          <div className="mt-4">
            {/* 현재 카테고리 + 필터 열기 버튼 */}
            <button
              type="button"
              onClick={() => setShowCategories((v) => !v)}
              className={cn(
                "flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 transition-all",
                showCategories
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/60 bg-surface/60 hover:border-border",
              )}
            >
              <span className="flex items-center gap-2 text-lg font-bold text-foreground">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                게시판
                <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">
                  {activeCatLabel}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-foreground/50 transition-transform duration-200",
                  showCategories && "rotate-180",
                )}
              />
            </button>

            {/* 카테고리 그리드 — 펼쳐질 때만 표시 */}
            {showCategories && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border-2 border-border/50 bg-surface/40 p-3 sm:grid-cols-3">
                <CatTile
                  active={activeCat === "all"}
                  onClick={() => { setActiveCat("all"); setShowCategories(false); }}
                  label="전체"
                  count={totalCount}
                />
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const isAgency = c.slug === "agency";
                  return (
                    <CatTile
                      key={c.slug}
                      active={activeCat === c.slug}
                      onClick={() => {
                        if (isAgency) {
                          navigate({ to: "/agencies" });
                        } else {
                          setActiveCat(c.slug);
                          setShowCategories(false);
                        }
                      }}
                      label={isAgency ? "대행업체" : c.name}
                      icon={<Icon className="h-5 w-5" />}
                      count={isAgency ? undefined : counts[c.slug] ?? 0}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* 부가 정보는 접어두기 — 가독성 우선 */}
          <details className="group mt-4 rounded-2xl border border-border/60 bg-surface/60">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-base font-bold text-foreground/80 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                꿀팁 · 산책 순위 더 보기
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            </summary>
            <div className="space-y-4 px-3 pb-3">
              <Link
                to="/tips"
                className="flex items-center gap-3 rounded-xl border border-primary/30 bg-rose-soft px-4 py-3 transition hover:border-primary/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Lightbulb className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">어르신 꿀팁 모음</span>
                  <span className="block text-[12px] text-muted-foreground">키오스크·예매·AI 단계별 안내</span>
                </span>
                <ArrowRight className="h-4 w-4 text-primary" />
              </Link>
              {isAuthenticated && <WalkLeaderboard />}
            </div>
          </details>
        </div>
      </section>

      {/* Feed */}
      <section className="mx-auto mt-5 w-full max-w-3xl">
        {!isAuthenticated ? (
          <LoginGate previewPosts={filtered} />
        ) : filtered.length === 0 ? (
          <EmptyState scope={scope} sigungu={userSigungu} onSwitchAll={() => setScope("all")} />
        ) : (
          <ul className="space-y-3 pb-16">
            {filtered.map((p) => (
              <li key={p.id}>
                <PostRow post={p} showRegion />
              </li>
            ))}
          </ul>
        )}
      </section>
    </SeniorAppLayout>
  );
}


function CatTile({
  active,
  onClick,
  label,
  icon,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-3 text-center transition active:scale-[0.98]",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md"
          : "border-border bg-background text-foreground hover:border-primary/40",
      )}
    >
      {icon && (
        <span className={cn(active ? "text-primary-foreground" : "text-primary")}>{icon}</span>
      )}
      <span className="text-base font-bold leading-tight">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "text-sm font-semibold",
            active ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function EmptyState({
  scope,
  sigungu,
  onSwitchAll,
}: {
  scope: Scope;
  sigungu: string;
  onSwitchAll: () => void;
}) {
  return (
    <div className="my-12 rounded-3xl border border-dashed border-border bg-surface/40 p-10 text-center">
      <p className="text-2xl font-bold text-foreground">
        {scope === "local" && sigungu
          ? `${sigungu}에 아직 글이 없어요`
          : "아직 글이 없어요"}
      </p>
      <p className="mt-2 text-base text-muted-foreground">
        {scope === "local" ? "첫 번째 동네 이야기를 들려주세요." : "첫 번째 이야기를 들려주세요."}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        {scope === "local" && (
          <Button size="lg" variant="outline" className="h-12 rounded-full px-5 font-bold" onClick={onSwitchAll}>
            전국 글 보기
          </Button>
        )}
        <Button asChild size="lg" variant="hero" className="h-12 rounded-full px-5 font-bold">
          <Link to="/community/write">글쓰기</Link>
        </Button>
      </div>
    </div>
  );
}

function LoginGate({ previewPosts }: { previewPosts: Post[] }) {
  const teaser = previewPosts.slice(0, 3);
  const blurred = previewPosts.slice(3, 7);
  return (
    <div>
      <ul>
        {teaser.map((p) => (
          <li key={p.id}>
            <PostRow post={p} />
          </li>
        ))}
      </ul>

      <div className="relative mt-2">
        <ul className="[filter:blur(5px)] [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none select-none">
          {blurred.map((p) => (
            <li key={p.id}>
              <PostRow post={p} />
            </li>
          ))}
        </ul>
        <div className="absolute inset-0 flex items-start justify-center pt-8">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-background/95 p-6 text-center shadow-elevated backdrop-blur">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-rose-soft">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
              로그인하고 더 보기
            </h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              이웃들의 모든 글과 댓글을 보려면 로그인이 필요해요.
            </p>
            <Button asChild size="sm" variant="hero" className="mt-4 rounded-full gap-1.5">
              <Link to="/auth">
                <LogIn className="h-3.5 w-3.5" /> 로그인 / 회원가입
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
