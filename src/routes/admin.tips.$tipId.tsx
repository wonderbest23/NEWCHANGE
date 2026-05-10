import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import {
  upsertTip,
  generateTipDraft,
} from "@/server/tips/admin.functions";
import { getTipDetail } from "@/server/tips/queries.functions";
import {
  TIP_CATEGORIES,
  type TipCategorySlug,
  type TipStep,
} from "@/lib/tips/types";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Save,
  Lock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/tips/$tipId")({
  head: () => ({ meta: [{ title: "꿀팁 편집 — 곁 운영" }] }),
  component: AdminTipEditor,
});

function AdminTipEditor() {
  const { tipId } = Route.useParams();
  const isNew = tipId === "new";
  const navigate = useNavigate();
  const { loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";

  const [category, setCategory] = useState<TipCategorySlug>("kiosk");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [steps, setSteps] = useState<TipStep[]>([{ order: 1, text: "" }]);
  const [tagsText, setTagsText] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI draft
  const [aiTopic, setAiTopic] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin || isNew) return;
    getTipDetail({ data: { id: tipId } }).then((d) => {
      if (!d) return;
      setCategory(d.category_slug);
      setTitle(d.title);
      setSummary(d.summary);
      setCoverUrl(d.cover_image_url ?? "");
      setSteps(d.steps.length ? d.steps : [{ order: 1, text: "" }]);
      setTagsText(d.tags.join(", "));
      setIsPublished(d.is_published);
      setPinned(d.pinned);
    });
  }, [isAdmin, isNew, tipId]);

  function updateStep(idx: number, patch: Partial<TipStep>) {
    setSteps((arr) =>
      arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }
  function addStep() {
    setSteps((arr) => [...arr, { order: arr.length + 1, text: "" }]);
  }
  function removeStep(idx: number) {
    setSteps((arr) =>
      arr.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })),
    );
  }

  async function onAiDraft() {
    if (!aiTopic.trim()) {
      toast.error("주제를 입력해주세요");
      return;
    }
    setAiBusy(true);
    try {
      const d = await generateTipDraft({
        data: { category_slug: category, topic: aiTopic.trim() },
      });
      if (!title) setTitle(d.title);
      if (!summary) setSummary(d.summary);
      setSteps(
        d.steps.map((s, i) => ({
          order: i + 1,
          text: s.text,
          tip: s.tip ?? null,
          image_url: null,
        })),
      );
      setTagsText(d.tags.join(", "));
      toast.success("AI 초안을 만들었어요. 검수 후 저장해주세요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 호출 실패");
    } finally {
      setAiBusy(false);
    }
  }

  async function onSave() {
    if (!title.trim() || !summary.trim()) {
      toast.error("제목과 요약은 필수입니다");
      return;
    }
    const cleanSteps = steps
      .filter((s) => s.text.trim())
      .map((s, i) => ({
        order: i + 1,
        text: s.text.trim(),
        tip: s.tip?.trim() || null,
        image_url: s.image_url?.trim() || null,
      }));
    if (cleanSteps.length === 0) {
      toast.error("최소 1개 단계가 필요합니다");
      return;
    }
    setSaving(true);
    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await upsertTip({
        data: {
          id: isNew ? undefined : tipId,
          category_slug: category,
          title: title.trim(),
          summary: summary.trim(),
          cover_image_url: coverUrl.trim() || null,
          steps: cleanSteps,
          tags,
          is_published: isPublished,
          pinned,
        },
      });
      toast.success("저장했어요");
      if (isNew && res.tip?.id) {
        navigate({ to: "/admin/tips/$tipId", params: { tipId: res.tip.id } });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  if (loading || appStateLoading) return null;
  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card p-10 text-center">
          <Lock className="mx-auto h-6 w-6 text-primary" />
          <h1 className="mt-4 font-display text-2xl">관리자 전용</h1>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <header className="flex items-center justify-between">
        <Button asChild variant="ghost" className="gap-1">
          <Link to="/admin/tips">
            <ArrowLeft className="h-4 w-4" /> 목록
          </Link>
        </Button>
        <Button
          variant="hero"
          className="rounded-full"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          저장
        </Button>
      </header>

      <h1 className="mt-4 font-display text-3xl tracking-tight">
        {isNew ? "새 꿀팁" : "꿀팁 편집"}
      </h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* AI draft */}
          <section className="rounded-3xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg">AI 초안 생성</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              카테고리 선택 후 주제를 입력하면 단계별 가이드 초안을 만들어드려요.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="예: 맥도날드 키오스크에서 빅맥세트 주문하기"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onAiDraft}
                disabled={aiBusy}
                className="gap-1"
              >
                {aiBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                초안 만들기
              </Button>
            </div>
          </section>

          {/* Basic info */}
          <section className="space-y-4 rounded-3xl border border-border/60 bg-card p-5">
            <div>
              <Label>카테고리</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TIP_CATEGORIES.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setCategory(c.slug)}
                    className={cn(
                      "rounded-full border-2 px-3 py-1.5 text-sm transition",
                      category === c.slug
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary/40",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 맥도날드 키오스크에서 빅맥세트 주문하기"
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="summary">한 줄 요약</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="이 꿀팁이 무엇을 도와주는지 한 문장으로"
                rows={2}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="cover">표지 사진 URL (선택)</Label>
              <Input
                id="cover"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://..."
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="tags">태그 (쉼표로 구분)</Label>
              <Input
                id="tags"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="키오스크, 맥도날드, 주문"
                className="mt-2"
              />
            </div>
          </section>

          {/* Steps */}
          <section className="space-y-3 rounded-3xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">단계별 안내</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addStep}
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> 단계 추가
              </Button>
            </div>
            {steps.map((s, i) => (
              <div
                key={i}
                className="rounded-2xl border border-border/60 bg-background p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">
                    {i + 1} 단계
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive"
                    onClick={() => removeStep(i)}
                    disabled={steps.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  value={s.text}
                  onChange={(e) => updateStep(i, { text: e.target.value })}
                  placeholder="이 단계에서 어르신이 할 행동을 짧게"
                  rows={2}
                  className="mt-2"
                />
                <Input
                  value={s.tip ?? ""}
                  onChange={(e) => updateStep(i, { tip: e.target.value })}
                  placeholder="주의/꿀팁 (선택)"
                  className="mt-2"
                />
                <Input
                  value={s.image_url ?? ""}
                  onChange={(e) => updateStep(i, { image_url: e.target.value })}
                  placeholder="단계 사진 URL (선택)"
                  className="mt-2"
                />
              </div>
            ))}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <section className="rounded-3xl border border-border/60 bg-card p-5">
            <h2 className="font-display text-lg">게시 설정</h2>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-5 w-5"
              />
              <span>공개 게시</span>
            </label>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-5 w-5"
              />
              <span>상단 고정 (추천 꿀팁)</span>
            </label>
            <p className="mt-3 text-xs text-muted-foreground">
              초안 상태에서는 어르신에게 보이지 않습니다.
            </p>
          </section>
        </aside>
      </div>
    </AdminLayout>
  );
}
