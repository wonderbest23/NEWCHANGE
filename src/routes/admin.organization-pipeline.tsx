import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Plus, Trash2, Save } from "lucide-react";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/organization-pipeline")({
  head: () => ({ meta: [{ title: "기관 파이프라인 — 곁" }] }),
  component: OrgPipelinePage,
});

const STATUSES = [
  "콜드아웃리치",
  "미팅 예정",
  "미팅 완료",
  "파일럿 논의",
  "파일럿 확정",
  "보류",
] as const;

type Org = {
  id: string;
  organization_name: string;
  organization_type: string | null;
  region: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  expected_users: number | null;
  meeting_date: string | null;
  next_action: string | null;
  memo: string | null;
};

function emptyOrg(): Partial<Org> {
  return {
    organization_name: "",
    organization_type: "",
    region: "",
    status: "콜드아웃리치",
    expected_users: null,
    next_action: "",
    memo: "",
  };
}

function OrgPipelinePage() {
  const { loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";
  const [items, setItems] = useState<Org[]>([]);
  const [draft, setDraft] = useState<Partial<Org>>(emptyOrg());
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const { data, error } = await supabase
      .from("organization_pipeline")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("불러오기 실패");
      return;
    }
    setItems((data ?? []) as Org[]);
  };

  useEffect(() => {
    if (!isAdmin) return;
    void reload();
  }, [isAdmin]);

  const addOrg = async () => {
    if (!draft.organization_name?.trim()) {
      toast.error("기관명을 입력해주세요");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("organization_pipeline").insert({
      organization_name: draft.organization_name!,
      organization_type: draft.organization_type || null,
      region: draft.region || null,
      status: draft.status || "콜드아웃리치",
      expected_users: draft.expected_users ?? null,
      next_action: draft.next_action || null,
      memo: draft.memo || null,
    });
    setBusy(false);
    if (error) {
      toast.error("추가 실패: " + error.message);
      return;
    }
    setDraft(emptyOrg());
    toast.success("추가되었습니다");
    void reload();
  };

  const updateRow = async (id: string, patch: Partial<Org>) => {
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    const { error } = await supabase.from("organization_pipeline").update(patch).eq("id", id);
    if (error) toast.error("저장 실패");
  };

  const removeRow = async (id: string) => {
    if (!confirm("삭제하시겠어요?")) return;
    const { error } = await supabase.from("organization_pipeline").delete().eq("id", id);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    setItems((prev) => prev.filter((o) => o.id !== id));
  };

  if (loading || appStateLoading) return null;
  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card p-10 text-center">
          <Lock className="mx-auto h-6 w-6 text-primary" />
          <h1 className="mt-4 font-display text-2xl">관리자 전용</h1>
          <Button asChild variant="hero" className="mt-5 rounded-full">
            <Link to="/auth">로그인</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <header>
        <p className="text-sm text-muted-foreground">관리자 · 기관 파이프라인</p>
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">기관 / 파일럿 관리</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          B2G/B2B 미팅과 파일럿 진행 상태를 기록합니다. 개인 건강정보는 입력하지 마세요.
        </p>
      </header>

      <section className="mt-8 rounded-3xl border border-border/60 bg-card p-6">
        <h2 className="font-display text-lg">새 기관 추가</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            placeholder="기관명 *"
            value={draft.organization_name ?? ""}
            onChange={(e) => setDraft({ ...draft, organization_name: e.target.value })}
          />
          <Input
            placeholder="기관 유형 (예: 자치구, 복지관)"
            value={draft.organization_type ?? ""}
            onChange={(e) => setDraft({ ...draft, organization_type: e.target.value })}
          />
          <Input
            placeholder="지역 (예: 서울 강남구)"
            value={draft.region ?? ""}
            onChange={(e) => setDraft({ ...draft, region: e.target.value })}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={draft.status ?? "콜드아웃리치"}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Input
            type="number"
            placeholder="예상 사용자 수"
            value={draft.expected_users ?? ""}
            onChange={(e) => setDraft({ ...draft, expected_users: e.target.value ? Number(e.target.value) : null })}
          />
          <Input
            placeholder="다음 액션"
            value={draft.next_action ?? ""}
            onChange={(e) => setDraft({ ...draft, next_action: e.target.value })}
          />
          <Textarea
            placeholder="메모"
            className="sm:col-span-2 lg:col-span-3"
            value={draft.memo ?? ""}
            onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={addOrg} disabled={busy} className="gap-2">
            <Plus className="h-4 w-4" />추가
          </Button>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-border/60 bg-card p-6">
        <h2 className="font-display text-lg">기관 목록 ({items.length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-3 py-3">기관명</th>
                <th className="px-3 py-3">유형/지역</th>
                <th className="px-3 py-3">상태</th>
                <th className="px-3 py-3">예상 사용자</th>
                <th className="px-3 py-3">다음 액션</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">아직 등록된 기관이 없습니다.</td></tr>
              ) : items.map((o) => (
                <tr key={o.id} className="bg-card align-top">
                  <td className="px-3 py-3 font-medium text-foreground">{o.organization_name}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <div>{o.organization_type || "—"}</div>
                    <div className="text-xs">{o.region || ""}</div>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={o.status}
                      onChange={(e) => updateRow(o.id, { status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <Input
                      type="number"
                      className="h-9 w-24"
                      value={o.expected_users ?? ""}
                      onChange={(e) => updateRow(o.id, { expected_users: e.target.value ? Number(e.target.value) : null })}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Input
                      className="h-9"
                      value={o.next_action ?? ""}
                      onChange={(e) => updateRow(o.id, { next_action: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => updateRow(o.id, {})} title="저장됨">
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeRow(o.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">* 변경은 즉시 저장됩니다.</p>
      </section>
    </AdminLayout>
  );
}
