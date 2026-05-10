import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/mock-auth";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { Button } from "@/components/ui/button";
import { Phone, Share2, Bookmark, Loader2, Calendar, MapPin, Sparkles, Check, LayoutGrid, PartyPopper, Building2, Stethoscope, HeartPulse, Megaphone, X, Briefcase, Smartphone, UtensilsCrossed, BookOpen, ChevronRight } from "lucide-react";
import { RegionPicker } from "@/components/local/RegionPicker";
import {
  listLocalResources,
  recommendLocalResources,
  toggleSavedResource,
} from "@/server/local/local.functions";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { ANALYTICS_EVENTS } from "@/lib/analytics/eventNames";
import { toast } from "sonner";

export const Route = createFileRoute("/local")({
  ssr: false,
  head: () => ({ meta: [{ title: "내 동네 소식 — 곁" }] }),
  component: LocalPage,
});

type Resource = Awaited<ReturnType<typeof listLocalResources>>[number] & {
  start_date?: string | null;
  end_date?: string | null;
  source_url?: string | null;
  category?: string | null;
  district?: string | null;
  evidence_level?: number | null;
  license?: string | null;
  _score?: number;
};

const CATEGORIES = [
  { key: "", label: "전체", icon: LayoutGrid },
  { key: "행사", label: "행사·강좌", icon: PartyPopper },
  { key: "노인복지관", label: "복지관", icon: Building2 },
  { key: "건강장수센터", label: "보건소", icon: Stethoscope },
  { key: "정신건강센터", label: "마음건강", icon: HeartPulse },
  { key: "공지", label: "구청 소식", icon: Megaphone },
];

/**
 * resource_type → 표시용 메타.
 * 자치구 섹션 안에서 카테고리별로 다른 색·아이콘으로 분리해 시인성을 높임.
 * order는 한 자치구 안에서의 정렬 순서 (큰 시설 → 행사 → 일자리 순).
 */
const TYPE_META: Record<
  string,
  { label: string; icon: typeof Building2; tone: string; chip: string; order: number }
> = {
  welfare_center: { label: "노인복지관", icon: Building2, tone: "bg-rose-soft border-primary/30 text-primary", chip: "bg-primary/10 text-primary", order: 1 },
  senior_center: { label: "경로당", icon: BookOpen, tone: "bg-amber-soft border-amber-warm/40 text-amber-warm", chip: "bg-amber-warm/10 text-amber-warm", order: 2 },
  public_health: { label: "보건·건강장수", icon: Stethoscope, tone: "bg-sage-soft border-sage/40 text-sage", chip: "bg-sage/10 text-sage", order: 3 },
  health_class: { label: "건강교실", icon: HeartPulse, tone: "bg-sage-soft border-sage/40 text-sage", chip: "bg-sage/10 text-sage", order: 4 },
  smartphone_class: { label: "디지털 배움", icon: Smartphone, tone: "bg-blue-50 border-blue-200 text-blue-700", chip: "bg-blue-50 text-blue-700", order: 5 },
  meal: { label: "식사·급식", icon: UtensilsCrossed, tone: "bg-amber-soft border-amber-warm/40 text-amber-warm", chip: "bg-amber-warm/10 text-amber-warm", order: 6 },
  event: { label: "행사·체험", icon: PartyPopper, tone: "bg-rose-soft border-primary/20 text-foreground", chip: "bg-primary/8 text-primary", order: 7 },
  program: { label: "프로그램", icon: Sparkles, tone: "bg-muted border-border text-foreground/70", chip: "bg-muted text-foreground/60", order: 8 },
  job: { label: "일자리", icon: Briefcase, tone: "bg-sage-soft border-sage/40 text-sage", chip: "bg-sage/10 text-sage", order: 9 },
};

function typeMeta(rt?: string | null) {
  return TYPE_META[rt ?? ""] ?? TYPE_META.program;
}

async function withAuth<T extends (...a: never[]) => unknown>(fn: T, payload: object): Promise<ReturnType<T>> {
  const { data: session } = await getSessionCached();
  const token = session.session?.access_token;
  return (fn as unknown as (a: unknown) => Promise<unknown>)({
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    data: payload,
  }) as Promise<ReturnType<T>>;
}

function distanceKm(
  user: { lat: number; lon: number } | null,
  lat?: number | null,
  lon?: number | null,
): number | null {
  if (!user || lat == null || lon == null) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat - user.lat);
  const dLon = toRad(lon - user.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(user.lat)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function LocalPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [region, setRegion] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [items, setItems] = useState<Resource[]>([]);
  const [recommended, setRecommended] = useState<Resource[]>([]);
  const [busy, setBusy] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  const [recDismissed, setRecDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("local:recDismissed") === "1";
  });

  const requestLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocDenied(true);
      return;
    }
    // HTTPS / localhost 가 아니면 브라우저가 차단 — 사일런트 처리 (자동 호출이라 토스트 자제)
    if (typeof window !== "undefined") {
      const { protocol, hostname } = window.location;
      const secure =
        protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
      if (!secure) {
        setLocDenied(true);
        return;
      }
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUserLoc({ lat: p.coords.latitude, lon: p.coords.longitude });
        setLocDenied(false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocDenied(true);
        }
        // 자동 호출이므로 timeout/unavailable 은 사일런트 — 카드에서 거리 미표시로만 노출
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5 * 60 * 1000 },
    );
  };

  // 사용자 현재 위치 (거리 표시용)
  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate({ to: "/auth" });
  }, [loading, isAuthenticated, navigate]);

  // 추천: 진입 시 1회
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const rec = (await withAuth(recommendLocalResources, {})) as unknown as { items: Resource[] };
        setRecommended(rec.items ?? []);
      } catch (e) { console.error("[recommend]", e); }
    })();
  }, [isAuthenticated]);

  // 목록
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const payload: Record<string, unknown> = { limit: 30 };
        if (region) payload.region = region;
        if (category) payload.category = category;
        const res = (await withAuth(listLocalResources, payload)) as Resource[];
        if (!cancelled) setItems(Array.isArray(res) ? res : []);
      } catch (e) {
        console.error("[local]", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    void trackEvent({
      eventName: ANALYTICS_EVENTS.LOCAL_INFO_VIEWED,
      userRole: "senior",
      targetType: "local_resources",
      metadata: { region: region || "전체", category: category || "전체" },
    });
    return () => { cancelled = true; };
  }, [region, category, isAuthenticated]);

  // 자치구 → 자원종류(resource_type) 2단계 그룹핑.
  // 위치 권한이 있고 거리 계산 가능한 경우 자치구 안의 카드를 거리순으로 정렬.
  const grouped = useMemo(() => {
    const byDistrict = new Map<string, Resource[]>();
    for (const r of items) {
      const d = (r.district ?? r.region_sigungu ?? "기타");
      if (!byDistrict.has(d)) byDistrict.set(d, []);
      byDistrict.get(d)!.push(r);
    }
    const sortDistricts = Array.from(byDistrict.keys()).sort((a, b) => {
      // 사용자가 region을 선택했으면 그 자치구를 최상단으로
      if (region && a === region) return -1;
      if (region && b === region) return 1;
      return (byDistrict.get(b)!.length - byDistrict.get(a)!.length);
    });
    return sortDistricts.map((district) => {
      const list = byDistrict.get(district)!;
      // 자원종류별로 다시 묶음
      const byType = new Map<string, Resource[]>();
      for (const r of list) {
        const t = (r as any).resource_type ?? "program";
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t)!.push(r);
      }
      const types = Array.from(byType.keys()).sort(
        (a, b) => (TYPE_META[a]?.order ?? 99) - (TYPE_META[b]?.order ?? 99),
      );
      return {
        district,
        total: list.length,
        groups: types.map((t) => ({ type: t, items: byType.get(t)! })),
      };
    });
  }, [items, region]);

  const handleSave = async (id: string) => {
    try {
      const r = (await withAuth(toggleSavedResource, { resourceId: id })) as { saved: boolean };
      setSavedIds((prev) => {
        const n = new Set(prev);
        if (r.saved) n.add(id); else n.delete(id);
        return n;
      });
      toast.success(r.saved ? "저장했어요" : "저장을 해제했어요");
      void trackEvent({
        eventName: ANALYTICS_EVENTS.SAVE_BUTTON_CLICKED,
        userRole: "senior",
        targetType: "local_resource",
        targetId: id,
      });
    } catch { toast.error("저장에 실패했어요"); }
  };

  return (
    <SeniorAppLayout>
      <h1 className="px-1 font-display text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">내 동네 소식</h1>

      {recommended.length > 0 && !recDismissed && (() => {
        const r = recommended[0];
        return (
          <section className="relative mt-5 rounded-3xl border-2 border-primary/30 bg-primary/5 p-4">
            <button
              type="button"
              onClick={() => {
                setRecDismissed(true);
                try { sessionStorage.setItem("local:recDismissed", "1"); } catch {}
              }}
              aria-label="오늘의 추천 닫기"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground/60 ring-1 ring-border/40 transition hover:bg-background hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3 flex items-center gap-2 pr-10 text-primary">
              <Sparkles className="h-5 w-5" />
              <h2 className="text-lg font-semibold">오늘의 추천</h2>
            </div>
            <div className="rounded-2xl bg-background p-4">
              <p className="text-lg font-semibold text-foreground">{r.name}</p>
              {r.description && (
                <p className="mt-1.5 line-clamp-2 text-base leading-snug text-foreground/80">
                  {r.description}
                </p>
              )}
              <div className="mt-3 space-y-1.5 text-sm text-foreground/70">
                <div className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <span className="min-w-0">
                    {(r as any).address || r.district || r.region_sigungu}
                    {(() => {
                      const d = distanceKm(userLoc, (r as any).latitude, (r as any).longitude);
                      if (d != null) {
                        return (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`}
                          </span>
                        );
                      }
                      return (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/50">
                          현재 위치 기준 거리 제공 안됨
                        </span>
                      );
                    })()}
                  </span>
                </div>
                {locDenied && !userLoc && (
                  <div className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
                    <button
                      type="button"
                      onClick={requestLocation}
                      className="text-left text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      위치 권한 켜고 거리 보기
                    </button>
                  </div>
                )}
                {((r as any).opening_hours || r.start_date) && (
                  <div className="flex items-start gap-1.5">
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                    <span>
                      {(r as any).opening_hours || (r.start_date ? `${r.start_date} 시작` : "")}
                    </span>
                  </div>
                )}
              </div>
              {r.recommendation_tags && r.recommendation_tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {r.recommendation_tags.slice(0, 4).map((t) => (
                    <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* 카테고리 — 3열 컴팩트 타일 */}
      <section className="mt-5">
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const selected = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(c.key)}
                className={`relative flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-2 text-center transition active:scale-[0.98] ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-md"
                    : "border-border bg-background text-foreground hover:border-primary/40"
                }`}
              >
                <Icon className={`h-5 w-5 ${selected ? "text-primary-foreground" : "text-primary"}`} />
                <span className="text-sm font-semibold leading-tight">{c.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 지역 선택 + 현재 조건 한 줄 요약 */}
      <section className="mt-4 space-y-2">
        <RegionPicker value={region} onChange={setRegion} />
        <div className="flex items-center gap-2 px-1 text-xs text-foreground/70">
          <span>지금 보는 소식</span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground/80">
            {(region || "서울시 전체")} · {CATEGORIES.find((c) => c.key === category)?.label ?? "전체"}
          </span>
        </div>
      </section>

      {busy ? (
        <div className="flex items-center justify-center py-12 text-foreground/60">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 불러오는 중…
        </div>
      ) : grouped.length === 0 ? (
        <p className="py-12 text-center text-foreground/60">표시할 정보가 없어요.</p>
      ) : (
        <DistrictGroupedList
          grouped={grouped}
          userLoc={userLoc}
          savedIds={savedIds}
          onSave={handleSave}
        />
      )}
    </SeniorAppLayout>
  );
}

/* ─────────────────────────────────────────────────────────
 * DistrictGroupedList — 25개 자치구를 페이지네이션으로 표시
 * ───────────────────────────────────────────────────────── */
function DistrictGroupedList({
  grouped,
  userLoc,
  savedIds,
  onSave,
}: {
  grouped: { district: string; total: number; groups: { type: string; items: Resource[] }[] }[];
  userLoc: { lat: number; lon: number } | null;
  savedIds: Set<string>;
  onSave: (id: string) => void;
}) {
  const DIST_PAGE = 5;
  const [shownDist, setShownDist] = useState(DIST_PAGE);
  // grouped 길이가 바뀌면(필터/검색 변경) 첫 페이지부터 다시 시작
  useEffect(() => {
    setShownDist(DIST_PAGE);
  }, [grouped.length]);
  const visible = grouped.slice(0, shownDist);
  const remaining = grouped.length - shownDist;

  return (
    <div className="mt-5 space-y-6">
      {visible.map(({ district, total, groups }) => (
        <DistrictSection
          key={district}
          district={district}
          total={total}
          groups={groups}
          userLoc={userLoc}
          savedIds={savedIds}
          onSave={onSave}
        />
      ))}
      {remaining > 0 && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            variant="hero"
            size="lg"
            className="h-12 gap-2 rounded-full px-6 text-base font-semibold"
            onClick={() => setShownDist((n) => Math.min(n + DIST_PAGE, grouped.length))}
          >
            자치구 {Math.min(remaining, DIST_PAGE)}개 더 보기
          </Button>
          <p className="text-xs text-foreground/55">
            {shownDist} / {grouped.length} 자치구
          </p>
        </div>
      )}
      {shownDist > DIST_PAGE && remaining === 0 && grouped.length > DIST_PAGE && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-full px-4 text-xs text-foreground/60"
            onClick={() => {
              setShownDist(DIST_PAGE);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            처음으로 ↑
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * DistrictSection — 한 자치구 단위 섹션
 * ───────────────────────────────────────────────────────── */
function DistrictSection({
  district,
  total,
  groups,
  userLoc,
  savedIds,
  onSave,
}: {
  district: string;
  total: number;
  groups: { type: string; items: Resource[] }[];
  userLoc: { lat: number; lon: number } | null;
  savedIds: Set<string>;
  onSave: (id: string) => void;
}) {
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  // 카테고리별 페이지네이션 — 한 카테고리당 4개씩 더 보여줌.
  // 큰 자치구(예: 강서구 51건)에서 모든 카드가 펼쳐지지 않도록 기본은 PAGE_SIZE 만큼만.
  const PAGE_SIZE = 4;
  const [shownByType, setShownByType] = useState<Record<string, number>>({});
  const showCount = (t: string) => shownByType[t] ?? PAGE_SIZE;
  const showMore = (t: string, total: number) => {
    setShownByType((prev) => ({ ...prev, [t]: Math.min((prev[t] ?? PAGE_SIZE) + PAGE_SIZE * 2, total) }));
  };
  const reset = (t: string) => {
    setShownByType((prev) => ({ ...prev, [t]: PAGE_SIZE }));
  };
  const toggle = (t: string) => {
    setCollapsedTypes((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  };

  return (
    <section className="w-full max-w-full overflow-hidden rounded-3xl border-2 border-border/70 bg-background">
      {/* 자치구 헤더 — 그라데이션 + 큰 타이틀 + 카운트 칩 */}
      <header className="flex items-baseline justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-rose-soft/60 via-amber-soft/40 to-background px-5 py-4">
        <div className="flex items-baseline gap-2.5">
          <MapPin className="h-5 w-5 self-center text-primary" />
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {district}
          </h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-foreground/85 px-3 py-1 text-xs font-bold text-background">
          {total}건
        </span>
      </header>

      {/* 카테고리 별 그룹 */}
      <div className="divide-y divide-border/60">
        {groups.map(({ type, items: typeItems }) => {
          const meta = typeMeta(type);
          const Icon = meta.icon;
          const collapsed = collapsedTypes.has(type);
          return (
            <div key={type} className="px-3 py-3 sm:px-4">
              {/* 카테고리 헤더 */}
              <button
                type="button"
                onClick={() => toggle(type)}
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${meta.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-display text-base font-bold text-foreground">{meta.label}</span>
                <span className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${meta.chip}`}>
                  {typeItems.length}
                </span>
                <ChevronRight
                  className={`ml-auto h-4 w-4 text-foreground/40 transition-transform ${collapsed ? "" : "rotate-90"}`}
                />
              </button>

              {/* 카드 리스트 + 페이지네이션 */}
              {!collapsed && (() => {
                const shown = showCount(type);
                const visible = typeItems.slice(0, shown);
                const remaining = typeItems.length - shown;
                return (
                  <>
                    <ul className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {visible.map((r) => (
                        <ResourceCard
                          key={r.id}
                          r={r}
                          userLoc={userLoc}
                          saved={savedIds.has(r.id)}
                          onSave={onSave}
                        />
                      ))}
                    </ul>
                    {(remaining > 0 || shown > PAGE_SIZE) && (
                      <div className="mt-3 flex items-center justify-center gap-2">
                        {remaining > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1 rounded-full px-4 text-xs font-semibold"
                            onClick={() => showMore(type, typeItems.length)}
                          >
                            더 보기 +{Math.min(remaining, PAGE_SIZE * 2)}
                          </Button>
                        )}
                        {shown > PAGE_SIZE && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 gap-1 rounded-full px-3 text-xs text-foreground/60"
                            onClick={() => reset(type)}
                          >
                            접기
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
 * ResourceCard — 정보 표시 카드 (클릭 유도 없음, 액션은 하단 버튼만)
 * ───────────────────────────────────────────────────────── */
function ResourceCard({
  r,
  userLoc,
  saved,
  onSave,
}: {
  r: Resource;
  userLoc: { lat: number; lon: number } | null;
  saved: boolean;
  onSave: (id: string) => void;
}) {
  const meta = typeMeta((r as any).resource_type);
  const dist = distanceKm(userLoc, (r as any).latitude, (r as any).longitude);
  const distLabel = dist == null ? null : dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;

  const share = () => {
    const text = `${r.name}\n${r.address ?? ""}\n${r.phone ?? ""}\n${r.source_url ?? ""}`;
    if (navigator.share) navigator.share({ title: r.name, text }).catch(() => {});
    else { navigator.clipboard?.writeText(text); toast.success("링크를 복사했어요"); }
  };

  const hasActions = !!(r.phone || r.source_url);

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-background">
      {/* 정보 영역 — 클릭 유도 없음 */}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {/* 이름 + 거리 */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 break-words text-xl font-bold leading-snug text-foreground">
            {r.name}
          </p>
          {distLabel && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {distLabel}
            </span>
          )}
        </div>

        {/* 주소 / 일정 */}
        <div className="min-w-0 space-y-1.5">
          {r.address && (
            <div className="flex min-w-0 items-start gap-1.5 text-sm text-foreground/70">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
              <span className="min-w-0 flex-1 break-words leading-snug">{r.address}</span>
            </div>
          )}
          {r.start_date && (
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-foreground/70">
              <Calendar className="h-4 w-4 shrink-0 text-foreground/40" />
              <span className="min-w-0 flex-1 truncate">
                {r.start_date}{r.end_date && r.end_date !== r.start_date ? ` ~ ${r.end_date}` : ""}
              </span>
            </div>
          )}
        </div>

        {/* 설명 */}
        {r.description && (
          <p className="break-words text-sm leading-relaxed text-foreground/60 line-clamp-2">
            {r.description}
          </p>
        )}

        {/* 태그 */}
        {r.recommendation_tags && r.recommendation_tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {r.recommendation_tags.slice(0, 3).map((t) => (
              <span key={t} className={`max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${meta.chip}`}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 액션 바 — 항상 하단에 분리된 영역 */}
      <div className="flex items-center gap-1.5 border-t border-border/40 bg-surface/50 px-3 py-2.5">
        {r.phone && (
          <a
            href={`tel:${r.phone}`}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Phone className="h-3.5 w-3.5" />
            전화하기
          </a>
        )}
        {r.source_url && (
          <a
            href={r.source_url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-full border border-border px-3 text-sm font-medium text-foreground transition hover:border-primary/50 hover:text-primary ${r.phone ? "" : "bg-background"}`}
          >
            자세히 보기 ↗
          </a>
        )}
        {!hasActions && <span className="flex-1 text-xs text-muted-foreground">정보 참고용</span>}
        <button
          type="button"
          onClick={share}
          aria-label="공유"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onSave(r.id)}
          aria-label={saved ? "저장 해제" : "저장"}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${saved ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          {saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}
