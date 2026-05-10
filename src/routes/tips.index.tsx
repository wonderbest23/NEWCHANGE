import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import {
  TIP_CATEGORIES,
  type TipCategorySlug,
  type TipListItem,
  getTipCategory,
} from "@/lib/tips/types";
import {
  listPublishedTips,
  listTipCategoryCounts,
} from "@/server/tips/queries.functions";
import { Lightbulb, ThumbsUp, Eye, Pin, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tips/")({
  head: () => ({
    meta: [
      { title: "꿀팁 — 키오스크·AI·예매 어르신 가이드" },
      {
        name: "description",
        content:
          "키오스크 주문, KTX·항공 예매, 챗GPT, 정부24까지. 어르신이 따라하기 쉬운 큰 글씨 단계별 안내.",
      },
      { property: "og:title", content: "곁 꿀팁 — 어르신 생활 가이드" },
      {
        property: "og:description",
        content: "키오스크부터 AI까지 단계별로 따라하는 시니어 꿀팁",
      },
    ],
  }),
  component: TipsIndex,
});

type CatFilter = TipCategorySlug | "all";

function TipsIndex() {
  const [cat, setCat] = useState<CatFilter>("all");
  const [items, setItems] = useState<TipListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listPublishedTips({ data: cat === "all" ? {} : { category: cat } })
      .then((rows) => setItems(rows))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [cat]);

  useEffect(() => {
    listTipCategoryCounts().then(setCounts).catch(() => setCounts({}));
  }, []);

  const featured = useMemo(() => items.find((i) => i.pinned) ?? items[0], [items]);
  const rest = useMemo(
    () => items.filter((i) => i.id !== featured?.id),
    [items, featured],
  );
  const totalCount = useMemo(
    () => Object.values(counts).reduce((s, n) => s + n, 0),
    [counts],
  );

  return (
    <SeniorAppLayout>
      <section className="border-b-2 border-border/60 bg-background">
        <div className="mx-auto w-full max-w-2xl px-5 pt-7 pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft text-primary">
              <Lightbulb className="h-7 w-7" />
            </span>
            <div>
              <h1 className="font-display text-fluid-3xl font-semibold tracking-tight text-foreground">
                꿀팁
              </h1>
              <p className="mt-0.5 text-fluid-base text-muted-foreground">
                어르신이 따라하기 쉬운 단계별 안내
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2.5 text-fluid-base font-semibold text-foreground">
              어떤 꿀팁이 필요하세요?
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <CatTile
                active={cat === "all"}
                onClick={() => setCat("all")}
                label="전체"
                count={totalCount}
              />
              {TIP_CATEGORIES.map((c) => {
                const Icon = c.icon;
                return (
                  <CatTile
                    key={c.slug}
                    active={cat === c.slug}
                    onClick={() => setCat(c.slug)}
                    label={c.name}
                    icon={<Icon className="h-5 w-5" />}
                    count={counts[c.slug] ?? 0}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-2xl px-5 py-6">
        {loading ? (
          <p className="py-12 text-center text-fluid-base text-muted-foreground">
            불러오는 중…
          </p>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {featured && <FeaturedCard tip={featured} />}
            {rest.length > 0 && (
              <ul className="mt-5 flex flex-col gap-3">
                {rest.map((t) => (
                  <li key={t.id}>
                    <TipCard tip={t} />
                  </li>
                ))}
              </ul>
            )}
          </>
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
        "flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition active:scale-[0.98]",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md"
          : "border-border bg-background text-foreground hover:border-primary/40",
      )}
    >
      {icon && (
        <span className={active ? "text-primary-foreground" : "text-primary"}>
          {icon}
        </span>
      )}
      <span className="text-fluid-base font-semibold leading-tight">{label}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "text-fluid-sm",
            active ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {count}개
        </span>
      )}
    </button>
  );
}

function FeaturedCard({ tip }: { tip: TipListItem }) {
  const cat = getTipCategory(tip.category_slug);
  return (
    <Link
      to="/tips/$tipId"
      params={{ tipId: tip.id }}
      className="group block overflow-hidden rounded-3xl border-2 border-border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md"
    >
      {tip.cover_image_url ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
          <img
            src={tip.cover_image_url}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center bg-rose-soft">
          <Lightbulb className="h-16 w-16 text-primary/60" />
        </div>
      )}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2 text-fluid-sm">
          {tip.pinned && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-soft px-2 py-0.5 font-semibold text-primary">
              <Pin className="h-3.5 w-3.5" /> 추천
            </span>
          )}
          {cat && (
            <span className="font-medium text-muted-foreground">{cat.name}</span>
          )}
          <span className="ml-auto inline-flex items-center gap-3 text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {tip.views}
            </span>
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="h-4 w-4" />
              {tip.like_count}
            </span>
          </span>
        </div>
        <h2 className="mt-2 font-display text-fluid-2xl font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary">
          {tip.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-fluid-base text-muted-foreground">
          {tip.summary}
        </p>
        <p className="mt-4 inline-flex items-center gap-1 text-fluid-base font-semibold text-primary">
          따라하기 ({tip.step_count}단계) <ArrowRight className="h-5 w-5" />
        </p>
      </div>
    </Link>
  );
}

function TipCard({ tip }: { tip: TipListItem }) {
  const cat = getTipCategory(tip.category_slug);
  return (
    <Link
      to="/tips/$tipId"
      params={{ tipId: tip.id }}
      className="group flex gap-3 rounded-2xl border-2 border-border bg-card p-3 transition hover:border-primary/40"
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
        {tip.cover_image_url ? (
          <img
            src={tip.cover_image_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-rose-soft">
            <Lightbulb className="h-8 w-8 text-primary/60" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-fluid-sm text-muted-foreground">
          {cat && <span className="font-medium">{cat.name}</span>}
          <span>·</span>
          <span>{tip.step_count}단계</span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-fluid-lg font-semibold leading-snug text-foreground group-hover:text-primary">
          {tip.title}
        </h3>
        <div className="mt-2 flex items-center gap-3 text-fluid-sm text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Eye className="h-3.5 w-3.5" />
            {tip.views}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <ThumbsUp className="h-3.5 w-3.5" />
            {tip.like_count}
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="my-10 rounded-3xl border-2 border-dashed border-border bg-surface/40 p-10 text-center">
      <Lightbulb className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <p className="mt-3 text-fluid-base font-medium text-foreground">
        아직 꿀팁이 없어요
      </p>
      <p className="mt-1 text-fluid-sm text-muted-foreground">
        새로운 꿀팁이 곧 올라옵니다.
      </p>
    </div>
  );
}
