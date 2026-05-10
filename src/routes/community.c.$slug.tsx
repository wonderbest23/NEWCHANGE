import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { Button } from "@/components/ui/button";
import { PostRow } from "@/components/community/PostRow";
import {
  CATEGORIES,
  getCategory,
  type CategorySlug,
  type Post,
} from "@/lib/community/types";
import { listPosts, listCategoryCounts } from "@/server/community/queries.functions";
import { Pencil, ChevronLeft, MapPin, Globe2 } from "lucide-react";
import { useAuth } from "@/lib/auth/mock-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/community/c/$slug")({
  component: CategoryPage,
  notFoundComponent: () => (
    <SeniorAppLayout>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl">카테고리를 찾을 수 없어요</h1>
        <Button asChild className="mt-6"><Link to="/community">커뮤니티로 돌아가기</Link></Button>
      </div>
    </SeniorAppLayout>
  ),
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const cat = getCategory(slug);
  if (!cat) throw notFound();

  const { user } = useAuth();
  const userSigungu = useMemo(() => {
    if (!user?.region) return "";
    return user.region.split(" ").slice(1).join(" ").trim() || user.region;
  }, [user]);
  const [scope, setScope] = useState<"local" | "all">(userSigungu ? "local" : "all");

  const [posts, setPosts] = useState<Post[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    listPosts({ data: { category: slug as CategorySlug } })
      .then(setPosts)
      .catch(() => setPosts([]));
    listCategoryCounts()
      .then((c) => setCount(c[slug] ?? 0))
      .catch(() => setCount(0));
  }, [slug]);

  const filtered = useMemo(() => {
    if (scope === "local" && userSigungu) {
      return posts.filter((p) => p.author.sigungu === userSigungu);
    }
    return posts;
  }, [posts, scope, userSigungu]);

  return (
    <SeniorAppLayout>
      <section className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <Link to="/community" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> 커뮤니티
        </Link>

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              {cat.name}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {cat.description} · 글 {count.toLocaleString()}개
            </p>
          </div>
          <Button asChild size="sm" variant="hero" className="gap-1.5 rounded-full">
            <Link to="/community/write" search={{ category: cat.slug }}>
              <Pencil className="h-3.5 w-3.5" /> 글쓰기
            </Link>
          </Button>
        </div>

        {/* Scope tabs */}
        <div className="mt-4 flex items-center gap-1 border-b border-border/30">
          <button
            type="button"
            onClick={() => setScope("local")}
            disabled={!userSigungu}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium",
              scope === "local"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
              !userSigungu && "opacity-40",
            )}
          >
            <MapPin className="h-3.5 w-3.5" />
            {userSigungu ? `우리 동네 · ${userSigungu}` : "우리 동네"}
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium",
              scope === "all"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Globe2 className="h-3.5 w-3.5" /> 전국
          </button>
        </div>

        {/* Sub categories */}
        <div className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            to="/community"
            className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            전체
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              to="/community/c/$slug"
              params={{ slug: c.slug }}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                c.slug === slug
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="my-12 rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
            <p className="text-base font-medium text-foreground">
              {scope === "local" && userSigungu
                ? `${userSigungu}에 아직 ${cat.name} 글이 없어요`
                : "아직 글이 없어요"}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              첫 번째 이야기를 들려주세요.
            </p>
            <Button asChild size="sm" variant="hero" className="mt-4 rounded-full">
              <Link to="/community/write" search={{ category: cat.slug }}>글쓰기</Link>
            </Button>
          </div>
        ) : (
          <ul className="pb-20">
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
