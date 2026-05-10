import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Truck, HeartPulse, Stethoscope, HandHeart, Sparkles, Flower2, Ear, Scale,
  Phone, Globe, MapPin, Search, ShieldCheck, LayoutGrid, Star, X, MessageSquare,
} from "lucide-react";

export const Route = createFileRoute("/agencies")({
  head: () => ({
    meta: [
      { title: "대행업체 디렉터리 — 곁" },
      { name: "description", content: "이사·요양병원·간병·청소·장례 등 시니어가 필요한 서울 실제 업체를 한눈에." },
    ],
  }),
  component: AgenciesPage,
});

type Agency = {
  id: string; name: string; category: string; sigungu: string | null;
  address: string | null; phone: string | null; website: string | null;
  hours: string | null; description: string | null; tags: string[] | null;
  verified: boolean; source_name: string | null; source_url: string | null;
  rating: number | null;
};

type RatingStat = { agency_id: string; avg_rating: number | null; review_count: number };
type Review = { id: string; user_id: string; rating: number; body: string | null; created_at: string };

const CATEGORIES = [
  { key: "all",              label: "전체",       icon: LayoutGrid,  desc: "모든 업체" },
  { key: "moving",           label: "이사",       icon: Truck,       desc: "포장이사·반포장" },
  { key: "nursing_hospital", label: "요양병원",   icon: HeartPulse,  desc: "장기요양·재활" },
  { key: "hospital",         label: "종합병원",   icon: Stethoscope, desc: "상급·대학병원" },
  { key: "caregiver",        label: "간병",       icon: HandHeart,   desc: "간병인 매칭" },
  { key: "cleaning",         label: "청소",       icon: Sparkles,    desc: "이사·정기청소" },
  { key: "funeral",          label: "장례·상조",  icon: Flower2,     desc: "장례·상조" },
  { key: "hearing_aid",      label: "보청기",     icon: Ear,         desc: "청력·보청기" },
  { key: "legal_tax",        label: "법무·세무",  icon: Scale,       desc: "무료상담·세무" },
] as const;

function AgenciesPage() {
  const [items, setItems] = useState<Agency[]>([]);
  const [stats, setStats] = useState<Record<string, RatingStat>>({});
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>("all");
  const [region, setRegion] = useState<string>("");
  const [query, setQuery] = useState("");
  const [openAgency, setOpenAgency] = useState<Agency | null>(null);

  async function reloadStats() {
    const { data } = await supabase.from("agency_rating_stats").select("*");
    const map: Record<string, RatingStat> = {};
    for (const s of (data ?? []) as RatingStat[]) map[s.agency_id] = s;
    setStats(map);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("agencies").select("*").order("verified", { ascending: false }).order("name"),
      supabase.from("agency_rating_stats").select("*"),
    ]).then(([a, s]) => {
      if (a.error) console.error("[agencies]", a.error);
      setItems((a.data ?? []) as Agency[]);
      const map: Record<string, RatingStat> = {};
      for (const r of (s.data ?? []) as RatingStat[]) map[r.agency_id] = r;
      setStats(map);
      setLoading(false);
    });
  }, []);

  const sigunguList = useMemo(
    () => Array.from(new Set(items.map((i) => i.sigungu).filter(Boolean))).sort() as string[],
    [items],
  );

  const filtered = useMemo(() => items.filter((it) => {
    if (cat !== "all" && it.category !== cat) return false;
    if (region && it.sigungu !== region) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${it.name} ${it.description ?? ""} ${(it.tags ?? []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [items, cat, region, query]);

  return (
    <PublicLayout>
      <section className="border-b border-border/50 bg-background">
        <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-5 sm:px-6">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[32px]">
            대행업체 찾기
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            이사·병원·간병·청소·장례·보청기 등 서울에서 자주 찾는 업체를 한 곳에서
          </p>

          <div className="mt-5">
            <p className="mb-2 px-1 text-base font-semibold text-foreground">무엇이 필요하세요?</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const selected = cat === c.key;
                const count = c.key === "all" ? items.length : items.filter((i) => i.category === c.key).length;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCat(c.key)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center transition active:scale-[0.98]",
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : "border-border bg-background text-foreground hover:border-primary/40",
                    )}
                  >
                    <Icon className={cn("h-7 w-7", selected ? "text-primary-foreground" : "text-primary")} />
                    <span className="text-sm font-semibold leading-tight">{c.label}</span>
                    <span className={cn("text-[11px]", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {count}곳
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="업체명·서비스 검색 (예: 보청기, 요양)"
                className="h-12 rounded-2xl border-2 pl-10 text-base"
              />
            </div>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="h-12 rounded-2xl border-2 border-border bg-background px-4 text-base font-medium text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">서울 전체</option>
              {sigunguList.map((g) => (<option key={g} value={g}>{g}</option>))}
            </select>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {loading ? (
          <p className="py-12 text-center text-muted-foreground">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">조건에 맞는 업체가 없어요.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => (
              <AgencyCard key={a.id} a={a} stat={stats[a.id]} onOpen={() => setOpenAgency(a)} />
            ))}
          </div>
        )}
      </section>

      {openAgency && (
        <AgencyDetailSheet
          agency={openAgency}
          stat={stats[openAgency.id]}
          onClose={() => setOpenAgency(null)}
          onReviewChanged={reloadStats}
        />
      )}
    </PublicLayout>
  );
}

function AgencyCard({ a, stat, onOpen }: { a: Agency; stat?: RatingStat; onOpen: () => void }) {
  const catMeta = CATEGORIES.find((c) => c.key === a.category);
  const Icon = catMeta?.icon ?? LayoutGrid;
  const avg = stat?.avg_rating ? Number(stat.avg_rating) : null;
  return (
    <article className="flex h-full flex-col rounded-2xl border-2 border-border/60 bg-background p-4 transition hover:border-primary/40 hover:shadow-md">
      <header className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-lg font-semibold text-foreground">{a.name}</h3>
            {a.verified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-label="검증된 업체" />}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {catMeta?.label ?? "기타"}{a.sigungu ? ` · ${a.sigungu}` : ""}
          </p>
        </div>
        {avg != null && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Star className="h-3 w-3 fill-current" />{avg.toFixed(1)}
            <span className="ml-1 opacity-70">({stat?.review_count})</span>
          </span>
        )}
      </header>

      {a.description && <p className="mt-3 line-clamp-2 text-sm text-foreground/80">{a.description}</p>}

      {a.address && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="line-clamp-1">{a.address}</span>
        </p>
      )}

      <div className="mt-auto pt-4 grid grid-cols-3 gap-2">
        {a.phone ? (
          <Button asChild size="lg" className="h-12 rounded-full text-base">
            <a href={`tel:${a.phone}`}><Phone className="mr-1 h-4 w-4" />전화</a>
          </Button>
        ) : <span />}
        {a.website ? (
          <Button asChild size="lg" variant="outline" className="h-12 rounded-full text-base">
            <a href={a.website} target="_blank" rel="noreferrer"><Globe className="mr-1 h-4 w-4" />홈</a>
          </Button>
        ) : <span />}
        <Button size="lg" variant="outline" className="h-12 rounded-full text-base" onClick={onOpen}>
          <MessageSquare className="mr-1 h-4 w-4" />후기
        </Button>
      </div>
    </article>
  );
}

function AgencyDetailSheet({
  agency, stat, onClose, onReviewChanged,
}: { agency: Agency; stat?: RatingStat; onClose: () => void; onReviewChanged: () => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [myRating, setMyRating] = useState(5);
  const [myBody, setMyBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: rs }, { data: u }] = await Promise.all([
      supabase.from("agency_reviews").select("*").eq("agency_id", agency.id).order("created_at", { ascending: false }),
      supabase.auth.getUser(),
    ]);
    setReviews((rs ?? []) as Review[]);
    setUserId(u?.user?.id ?? null);
    const mine = (rs ?? []).find((r) => r.user_id === u?.user?.id);
    if (mine) { setMyRating(mine.rating); setMyBody(mine.body ?? ""); }
  }
  useEffect(() => { load(); }, [agency.id]);

  async function submitReview() {
    if (!userId) { toast.error("로그인이 필요합니다"); return; }
    setSaving(true);
    const { error } = await supabase.from("agency_reviews").upsert({
      agency_id: agency.id, user_id: userId, rating: myRating, body: myBody || null,
    }, { onConflict: "agency_id,user_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("후기가 등록되었습니다");
    await load(); onReviewChanged();
  }

  async function deleteMine() {
    if (!userId) return;
    if (!confirm("후기를 삭제할까요?")) return;
    const { error } = await supabase.from("agency_reviews").delete().eq("agency_id", agency.id).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    setMyBody(""); setMyRating(5);
    await load(); onReviewChanged();
  }

  const mine = reviews.find((r) => r.user_id === userId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">{agency.name}</h2>
            <p className="text-sm text-muted-foreground">{agency.sigungu ?? ""}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
        </header>

        {stat?.avg_rating != null && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            <Star className="mr-1 inline h-4 w-4 fill-current" />
            평균 {Number(stat.avg_rating).toFixed(1)} ({stat.review_count}개 후기)
          </p>
        )}

        <section className="mt-5 rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="text-base font-semibold">{mine ? "내 후기 수정" : "이 업체 후기 남기기"}</h3>
          {!userId && <p className="mt-1 text-sm text-muted-foreground">로그인 후 후기를 남길 수 있어요.</p>}
          <div className="mt-3 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setMyRating(n)} disabled={!userId}>
                <Star className={cn("h-7 w-7", n <= myRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
          <Textarea
            className="mt-3" rows={3} placeholder="이용 경험을 짧게 남겨주세요 (선택)"
            value={myBody} onChange={(e) => setMyBody(e.target.value)} disabled={!userId}
          />
          <div className="mt-3 flex justify-end gap-2">
            {mine && <Button variant="ghost" onClick={deleteMine}>삭제</Button>}
            <Button onClick={submitReview} disabled={!userId || saving}>{mine ? "수정 저장" : "후기 등록"}</Button>
          </div>
        </section>

        <section className="mt-5">
          <h3 className="text-base font-semibold">후기 ({reviews.length})</h3>
          <ul className="mt-2 divide-y divide-border/60">
            {reviews.length === 0 && <li className="py-4 text-sm text-muted-foreground">아직 후기가 없어요.</li>}
            {reviews.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn("h-4 w-4", n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                  ))}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                {r.body && <p className="mt-1 text-sm text-foreground/90">{r.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
