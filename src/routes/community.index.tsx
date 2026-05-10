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
  Search,
  Clock,
  Flame,
  TrendingUp,
  LogIn,
  Lock,
  MapPin,
  Globe2,
  Lightbulb,
  ArrowRight,
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

type Sort = "recent" | "hot" | "trending";
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
  const [sort, setSort] = useState<Sort>("recent");
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

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
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter(
        (p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q),
      );
    }
    const sorted = [...arr];
    if (sort === "hot") sorted.sort((a, b) => b.likes - a.likes);
    else if (sort === "trending") sorted.sort((a, b) => b.views - a.views);
    sorted.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    return sorted;
  }, [allPosts, sort, scope, userSigungu, query]);

  const totalCount = useMemo(
    () => Object.values(counts).reduce((s, n) => s + n, 0),
    [counts],
  );

  const activeCatLabel =
    activeCat === "all"
      ? "전체"
      : CATEGORIES.find((c) => c.slug === activeCat)?.name ?? "전체";

  return (
    <SeniorAppLayout>
      {/* Header — 제목 + 글쓰기 한 줄 */}
      <section className="border-b border-border/50 bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-4 sm:px-6">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
              커뮤니티
            </h1>
          </div>

          {/* 동네/전국 — 한 줄 세그먼트 토글 */}
          <div
            role="tablist"
            aria-label="지역 범위"
            className="mt-4 grid grid-cols-2 rounded-full border-2 border-border bg-surface p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={scope === "local"}
              disabled={!userSigungu}
              onClick={() => userSigungu && setScope("local")}
              className={cn(
                "flex min-h-[44px] items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition",
                scope === "local"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/70",
                !userSigungu && "cursor-not-allowed opacity-40",
              )}
            >
              <MapPin className="h-4 w-4" />
              <span>{userSigungu || "우리 동네"}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "all"}
              onClick={() => setScope("all")}
              className={cn(
                "flex min-h-[44px] items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition",
                scope === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/70",
              )}
            >
              <Globe2 className="h-4 w-4" />
              전국
            </button>
          </div>

          {/* 카테고리 — 핵심 영역 */}
          <div className="mt-5">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              <CatTile
                active={activeCat === "all"}
                onClick={() => setActiveCat("all")}
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
                      }
                    }}
                    label={isAgency ? "대행업체" : c.name}
                    icon={<Icon className="h-5 w-5" />}
                    count={isAgency ? undefined : counts[c.slug] ?? 0}
                  />
                );
              })}
            </div>
          </div>

          {/* 부가 정보는 접어두기 — 가독성 우선 */}
          <details className="group mt-4 rounded-2xl border border-border/60 bg-surface/60">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-foreground/80 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
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

      {/* Toolbar — 정렬·검색 */}
      <section className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 py-2.5">
          <div className="inline-flex items-center gap-3">
            <SortBtn active={sort === "recent"} onClick={() => setSort("recent")} icon={<Clock className="h-4 w-4" />}>
              최신
            </SortBtn>
            <SortBtn active={sort === "hot"} onClick={() => setSort("hot")} icon={<Flame className="h-4 w-4" />}>
              인기
            </SortBtn>
            <SortBtn active={sort === "trending"} onClick={() => setSort("trending")} icon={<TrendingUp className="h-4 w-4" />}>
              주목
            </SortBtn>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground/80">
              {scope === "local" && userSigungu ? userSigungu : "전국"} · {activeCatLabel}
            </span>
            <button
              type="button"
              onClick={() => setSearchOpen((o) => !o)}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                searchOpen
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/40",
              )}
              aria-label="검색"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="py-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·내용 검색"
              className="w-full rounded-2xl border-2 border-border bg-background px-4 py-3 text-base focus:border-primary focus:outline-none"
            />
          </div>
        )}

        {/* Feed */}
        {!isAuthenticated ? (
          <LoginGate previewPosts={filtered} />
        ) : filtered.length === 0 ? (
          <EmptyState scope={scope} sigungu={userSigungu} onSwitchAll={() => setScope("all")} />
        ) : (
          <ul className="pb-16">
            {filtered.map((p) => (
              <li key={p.id}>
                <PostRow post={p} showRegion={scope === "all"} />
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
        "relative flex min-h-[78px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-2.5 text-center transition active:scale-[0.98]",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md"
          : "border-border bg-background text-foreground hover:border-primary/40",
      )}
    >
      {icon && (
        <span className={cn(active ? "text-primary-foreground" : "text-primary")}>{icon}</span>
      )}
      <span className="text-sm font-semibold leading-tight">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "text-[11px] font-medium",
            active ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function SortBtn({
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
        "inline-flex items-center gap-1 transition-colors",
        active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
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
    <div className="my-12 rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
      <p className="text-base font-medium text-foreground">
        {scope === "local" && sigungu
          ? `${sigungu}에 아직 글이 없어요`
          : "아직 글이 없어요"}
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {scope === "local" ? "첫 번째 동네 이야기를 들려주세요." : "첫 번째 이야기를 들려주세요."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {scope === "local" && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={onSwitchAll}>
            전국 글 보기
          </Button>
        )}
        <Button asChild size="sm" variant="hero" className="rounded-full">
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
