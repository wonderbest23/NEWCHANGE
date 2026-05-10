import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RecommendationItem {
  id: string;
  name: string;
  region_sigungu?: string | null;
  description?: string | null;
  phone?: string | null;
}

interface Props {
  items: RecommendationItem[];
}

/**
 * Horizontal swipe carousel for "도움 받을 수 있는 곳" cards.
 * Shows one card per view with scroll-snap, plus a live page indicator
 * driven by the scroll position.
 */
export function RecommendationCarousel({ items }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(idx);
  };

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((r) => (
          <article
            key={r.id}
            className="w-full flex-none snap-center rounded-3xl border-2 border-border/60 bg-background p-5 shadow-soft sm:p-6"
          >
            <p className="text-fluid-xl font-bold leading-snug text-foreground">{r.name}</p>
            {r.region_sigungu && (
              <p className="mt-2 text-fluid-base text-foreground/60">{r.region_sigungu}</p>
            )}
            {r.description && (
              <p className="mt-3 text-fluid-base leading-relaxed text-foreground/75">
                {r.description}
              </p>
            )}
            {r.phone && (
              <Button
                asChild
                size="xl"
                className="mt-5 h-14 w-full rounded-2xl text-fluid-lg font-bold"
              >
                <a href={`tel:${r.phone}`}>📞 전화 걸기</a>
              </Button>
            )}
          </article>
        ))}
      </div>

      {items.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2.5">
          {items.map((r, i) => (
            <button
              key={r.id}
              type="button"
              aria-label={`${i + 1}번째 추천 보기`}
              onClick={() => goTo(i)}
              className="group flex h-11 w-11 items-center justify-center"
            >
              <span
                className={cn(
                  "block rounded-full transition-all",
                  i === active
                    ? "h-3 w-8 bg-primary"
                    : "h-3 w-3 bg-foreground/25 group-hover:bg-foreground/45",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
