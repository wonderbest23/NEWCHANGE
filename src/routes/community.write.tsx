import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { useEffect, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { Button } from "@/components/ui/button";
import { CATEGORIES, type CategorySlug } from "@/lib/community/types";
import { createPost } from "@/server/community/mutations.functions";
import { ChevronLeft, Info, Sparkles, Loader2, MapPin } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/lib/auth/mock-auth";
import { UserBadge } from "@/components/community/UserBadge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { REGION_MAP, SIDO_LIST } from "@/lib/regions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const search = z.object({
  category: z.enum(["free", "jobs", "legal", "welfare", "news", "agency"]).optional(),
});

export const Route = createFileRoute("/community/write")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  validateSearch: (s) => search.parse(s),
  component: WritePage,
});

function WritePage() {
  const { category: initialCategory } = Route.useSearch();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [category, setCategory] = useState<CategorySlug>(initialCategory ?? "free");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [polishing, setPolishing] = useState(false);

  const onPolish = async () => {
    if (body.trim().length < 5) {
      toast.error("다듬을 본문을 먼저 입력해주세요");
      return;
    }
    setPolishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assist", {
        body: { task: "polish", title, body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.text) {
        setBody(data.text);
        toast.success("AI가 글을 다듬었어요");
      }
    } catch (err) {
      toast.error((err as Error).message || "AI 다듬기에 실패했어요");
    } finally {
      setPolishing(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: "/auth", search: { mode: "signin" } });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated || !user) return null;

  const author = {
    id: user.id,
    handle: user.nickname,
    age: user.birthYear ? new Date().getFullYear() - user.birthYear : 0,
    sido: user.region.split(" ")[0] ?? "",
    sigungu: user.region.split(" ").slice(1).join(" ") ?? "",
    verified: user.verified,
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2 || body.trim().length < 2) {
      toast.error("제목과 내용을 2자 이상 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createPost({
        data: { category, title: title.trim(), body: body.trim() },
        headers: await authHeaders(),
      });
      toast.success("등록되었습니다");
      navigate({ to: "/community/post/$postId", params: { postId: res.id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SeniorAppLayout>
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-24 sm:px-6">
        <Link to="/community" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> 커뮤니티
        </Link>

        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">새 글 쓰기</h1>

        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span>이렇게 표시돼요:</span>
          <UserBadge author={author} />
        </div>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <span>카테고리</span>
              <span className="rounded-full bg-foreground px-2.5 py-0.5 text-xs font-medium text-background">
                {CATEGORIES.find((c) => c.slug === category)?.name}
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const active = c.slug === category;
                if (active) return null;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setCategory(c.slug)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="이웃들이 한눈에 알 수 있는 제목을 적어주세요"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium">내용</label>
              <button
                type="button"
                onClick={onPolish}
                disabled={polishing || body.trim().length < 5}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-rose-soft/40 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-rose-soft disabled:opacity-50"
              >
                {polishing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {polishing ? "다듬는 중…" : "AI로 다듬기"}
              </button>
            </div>
            <textarea
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={10000}
              placeholder="자세한 정보일수록 도움이 됩니다. (최대 10,000자)"
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base leading-relaxed focus:border-primary focus:outline-none"
            />
          </div>


          <div className="flex items-start gap-2 rounded-xl bg-amber-soft/40 p-3 text-xs text-foreground/70">
            <Info className="mt-0.5 h-3.5 w-3.5 text-amber-warm" />
            <span>
              개인정보(주민번호, 계좌, 연락처 전체)는 적지 마세요. 광고·홍보·도배는 제재 대상입니다.
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" asChild>
              <Link to="/community">취소</Link>
            </Button>
            <Button type="submit" variant="hero" className="rounded-full px-6" disabled={submitting}>
              {submitting ? "등록중…" : "등록하기"}
            </Button>
          </div>
        </form>
      </div>
    </SeniorAppLayout>
  );
}
