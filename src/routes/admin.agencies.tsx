import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAppState } from "@/lib/auth/use-app-state";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  upsertAgency,
  deleteAgency,
  firecrawlSearchAgencies,
  importAgencies,
} from "@/server/agencies/agencies.functions";
import { toast } from "sonner";
import { Lock, Plus, Trash2, Pencil, Search, Sparkles, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin/agencies")({
  head: () => ({
    meta: [{ title: "대행업체 관리 — 곁 관리자" }],
  }),
  component: AdminAgenciesPage,
});

const CATEGORIES = [
  { key: "moving", label: "이사" },
  { key: "nursing_hospital", label: "요양병원" },
  { key: "hospital", label: "종합병원" },
  { key: "caregiver", label: "간병" },
  { key: "cleaning", label: "청소" },
  { key: "funeral", label: "장례·상조" },
  { key: "hearing_aid", label: "보청기" },
  { key: "legal_tax", label: "법무·세무" },
] as const;

const SEOUL_GUS = [
  "강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구",
  "동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구",
  "용산구","은평구","종로구","중구","중랑구",
];

type Agency = {
  id: string; name: string; category: string; sigungu: string | null;
  address: string | null; phone: string | null; website: string | null;
  hours: string | null; description: string | null; tags: string[] | null;
  verified: boolean; source_name: string | null; source_url: string | null;
};

function AdminAgenciesPage() {
  const { data: appState, isLoading } = useAppState();
  const isAdmin = appState?.role === "admin";
  const [items, setItems] = useState<Agency[]>([]);
  const [editing, setEditing] = useState<Partial<Agency> | null>(null);
  const [filterCat, setFilterCat] = useState("");
  const [filterGu, setFilterGu] = useState("");

  const upsertFn = useServerFn(upsertAgency);
  const deleteFn = useServerFn(deleteAgency);

  async function reload() {
    const { data } = await supabase.from("agencies").select("*").order("name");
    setItems((data ?? []) as Agency[]);
  }
  useEffect(() => { if (isAdmin) reload(); }, [isAdmin]);

  const filtered = useMemo(() => items.filter((i) =>
    (!filterCat || i.category === filterCat) && (!filterGu || i.sigungu === filterGu),
  ), [items, filterCat, filterGu]);

  if (isLoading) return null;
  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card p-10 text-center">
          <Lock className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-4 font-display text-2xl">관리자 전용</h1>
          <Button asChild variant="hero" className="mt-5 rounded-full"><Link to="/auth">로그인</Link></Button>
        </div>
      </AdminLayout>
    );
  }

  async function handleSave(payload: Partial<Agency>) {
    try {
      await upsertFn({ data: payload });
      toast.success(payload.id ? "수정되었습니다" : "추가되었습니다");
      setEditing(null);
      reload();
    } catch (e) { toast.error(String(e)); }
  }

  async function handleDelete(id: string) {
    if (!confirm("정말 삭제하시겠어요?")) return;
    try { await deleteFn({ data: { id } }); toast.success("삭제되었습니다"); reload(); }
    catch (e) { toast.error(String(e)); }
  }

  return (
    <AdminLayout>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">관리자 · 대행업체</p>
          <h1 className="font-display text-3xl tracking-tight">대행업체 디렉터리 관리</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditing({})} className="rounded-full"><Plus className="mr-1 h-4 w-4" />새 업체</Button>
        </div>
      </header>

      <FirecrawlPanel onImported={reload} />

      <div className="mt-6 flex flex-wrap gap-2">
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">전체 카테고리</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={filterGu} onChange={(e) => setFilterGu(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">전체 자치구</option>
          {SEOUL_GUS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="ml-auto self-center text-sm text-muted-foreground">총 {filtered.length}곳</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-3">업체명</th>
              <th className="px-3 py-3">카테고리</th>
              <th className="px-3 py-3">자치구</th>
              <th className="px-3 py-3">전화</th>
              <th className="px-3 py-3">검증</th>
              <th className="px-3 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.map((a) => (
              <tr key={a.id} className="bg-card">
                <td className="px-3 py-2 font-medium">{a.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{CATEGORIES.find((c) => c.key === a.category)?.label ?? a.category}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.sigungu ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.phone ?? "—"}</td>
                <td className="px-3 py-2">{a.verified ? <ShieldCheck className="h-4 w-4 text-primary" /> : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EditorDialog initial={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
    </AdminLayout>
  );
}

function EditorDialog({
  initial, onClose, onSave,
}: { initial: Partial<Agency>; onClose: () => void; onSave: (a: Partial<Agency>) => void }) {
  const [form, setForm] = useState<Partial<Agency>>({
    category: "moving", sigungu: SEOUL_GUS[0], verified: false, tags: [], ...initial,
  });
  const upd = (k: keyof Agency, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl">{form.id ? "업체 수정" : "새 업체 추가"}</h2>
        <div className="mt-4 grid gap-3">
          <div><Label>업체명 *</Label><Input value={form.name ?? ""} onChange={(e) => upd("name", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>카테고리</Label>
              <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => upd("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div><Label>자치구</Label>
              <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.sigungu ?? ""} onChange={(e) => upd("sigungu", e.target.value)}>
                {SEOUL_GUS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div><Label>주소</Label><Input value={form.address ?? ""} onChange={(e) => upd("address", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>전화</Label><Input value={form.phone ?? ""} onChange={(e) => upd("phone", e.target.value)} /></div>
            <div><Label>홈페이지</Label><Input value={form.website ?? ""} onChange={(e) => upd("website", e.target.value)} placeholder="https://" /></div>
          </div>
          <div><Label>운영시간</Label><Input value={form.hours ?? ""} onChange={(e) => upd("hours", e.target.value)} /></div>
          <div><Label>설명</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => upd("description", e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.verified} onChange={(e) => upd("verified", e.target.checked)} />
            검증된 업체
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name}>저장</Button>
        </div>
      </div>
    </div>
  );
}

function FirecrawlPanel({ onImported }: { onImported: () => void }) {
  const [cat, setCat] = useState<typeof CATEGORIES[number]["key"]>("moving");
  const [gu, setGu] = useState(SEOUL_GUS[0]);
  const [results, setResults] = useState<{ url: string; title: string; description: string; checked: boolean }[]>([]);
  const [loading, setLoading] = useState(false);
  const searchFn = useServerFn(firecrawlSearchAgencies);
  const importFn = useServerFn(importAgencies);

  async function search() {
    setLoading(true);
    try {
      const r = await searchFn({ data: { category: cat, sigungu: gu, limit: 8 } });
      setResults(r.results.map((x) => ({ ...x, checked: true })));
    } catch (e) { toast.error(String(e)); } finally { setLoading(false); }
  }

  async function importSelected() {
    const items = results.filter((r) => r.checked && r.title).map((r) => ({
      name: r.title.replace(/\s*[-|·–]\s*.*$/, "").slice(0, 100),
      website: r.url, description: r.description,
    }));
    if (items.length === 0) return;
    try {
      const r = await importFn({ data: { category: cat, sigungu: gu, items } });
      toast.success(`${r.inserted}곳 추가됨`); setResults([]); onImported();
    } catch (e) { toast.error(String(e)); }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border/60 bg-card p-5">
      <header className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg">Firecrawl로 업체 자동 검색</h2>
      </header>
      <p className="mt-1 text-sm text-muted-foreground">카테고리/자치구를 선택하면 Firecrawl 웹 검색으로 후보를 가져와 1클릭으로 등록할 수 있어요.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value as typeof CATEGORIES[number]["key"])} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={gu} onChange={(e) => setGu(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
          {SEOUL_GUS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <Button onClick={search} disabled={loading}><Search className="mr-1 h-4 w-4" />{loading ? "검색 중…" : "검색"}</Button>
        {results.length > 0 && <Button variant="outline" onClick={importSelected}>선택 항목 등록</Button>}
      </div>
      {results.length > 0 && (
        <ul className="mt-4 space-y-2">
          {results.map((r, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl border border-border/60 p-3">
              <input type="checkbox" checked={r.checked} onChange={(e) => setResults((arr) => arr.map((x, j) => j === i ? { ...x, checked: e.target.checked } : x))} className="mt-1" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title || r.url}</p>
                <p className="truncate text-xs text-muted-foreground">{r.url}</p>
                {r.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
