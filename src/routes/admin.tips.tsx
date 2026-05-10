import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { adminListTips, deleteTip } from "@/server/tips/admin.functions";
import { getTipCategory } from "@/lib/tips/types";
import {
  Lock,
  Plus,
  Pencil,
  Trash2,
  Eye,
  ThumbsUp,
  Pin,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/tips")({
  head: () => ({
    meta: [{ title: "꿀팁 관리 — 곁 운영" }],
  }),
  component: AdminTipsPage,
});

interface TipRow {
  id: string;
  category_slug: string;
  title: string;
  summary: string;
  is_published: boolean;
  pinned: boolean;
  like_count: number;
  views: number;
  updated_at: string;
}

function AdminTipsPage() {
  const { loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";
  const [rows, setRows] = useState<TipRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const data = await adminListTips();
      setRows(data as TipRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "목록을 불러오지 못했어요");
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    reload();
  }, [isAdmin]);

  async function onDelete(id: string, title: string) {
    if (!confirm(`"${title}" 꿀팁을 삭제할까요?`)) return;
    setBusy(true);
    try {
      await deleteTip({ data: { id } });
      toast.success("삭제했어요");
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  if (loading || appStateLoading) return null;

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-2xl">관리자 전용</h1>
          <Button asChild variant="hero" className="mt-5 rounded-full">
            <Link to="/auth">로그인</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const published = rows.filter((r) => r.is_published).length;

  return (
    <AdminLayout>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">콘텐츠 관리</p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            꿀팁
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            전체 {rows.length}개 · 게시됨 {published}개
          </p>
        </div>
        <Button asChild variant="hero" className="rounded-full">
          <Link to="/admin/tips/$tipId" params={{ tipId: "new" }}>
            <Plus className="h-4 w-4" /> 새 꿀팁
          </Link>
        </Button>
      </header>

      <section className="mt-8">
        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/60 bg-card p-12 text-center">
            <Lightbulb className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-medium">아직 등록된 꿀팁이 없어요</p>
            <Button asChild variant="hero" className="mt-5 rounded-full">
              <Link to="/admin/tips/$tipId" params={{ tipId: "new" }}>
                <Plus className="h-4 w-4" /> 첫 꿀팁 만들기
              </Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">제목</th>
                  <th className="px-4 py-3 font-medium">카테고리</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 text-right font-medium">조회</th>
                  <th className="px-4 py-3 text-right font-medium">추천</th>
                  <th className="px-4 py-3 text-right font-medium">동작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => {
                  const cat = getTipCategory(r.category_slug);
                  return (
                    <tr key={r.id} className="bg-card">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                          <span className="font-medium text-foreground line-clamp-1">
                            {r.title}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {r.summary}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-foreground/80">
                        {cat?.name ?? r.category_slug}
                      </td>
                      <td className="px-4 py-3">
                        {r.is_published ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 게시됨
                          </span>
                        ) : (
                          <span className="text-muted-foreground">초안</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          {r.views}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="h-3.5 w-3.5" />
                          {r.like_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                          >
                            <Link
                              to="/admin/tips/$tipId"
                              params={{ tipId: r.id }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-destructive"
                            onClick={() => onDelete(r.id, r.title)}
                            disabled={busy}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
