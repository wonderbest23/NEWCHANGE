import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { Heart, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import { acceptInvite, previewInvite } from "@/server/family/invites.functions";
import { useAuth } from "@/lib/auth/mock-auth";

export const Route = createFileRoute("/invite/guardian")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: [
      { title: "보호자 초대 수락 — 곁" },
      { name: "description", content: "초대 링크로 가족 그룹의 보호자가 되어주세요." },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

  // 미로그인이면 /auth?token=...로 보내고, 로그인 후 다시 돌아오게 한다.
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && token) {
      navigate({ to: "/auth", search: { mode: "signin", token } });
    }
  }, [loading, isAuthenticated, token, navigate]);

  const preview = useQuery({
    queryKey: ["invite-preview", token],
    enabled: !!token,
    queryFn: async () => {
      return previewInvite({ data: { token: token! } } as Parameters<typeof previewInvite>[0]);
    },
  });

  const accept = useMutation({
    mutationFn: async () => {
      const { data: session } = await getSessionCached();
      const at = session.session?.access_token;
      if (!at) throw new Error("로그인이 필요합니다");
      return acceptInvite({
        data: { token: token! },
        headers: { Authorization: `Bearer ${at}` },
      } as Parameters<typeof acceptInvite>[0]);
    },
    onSuccess: () => {
      toast.success("가족에 연결되었어요");
      navigate({ to: "/watch" });
    },
    onError: (e: Error) => toast.error(e.message ?? "초대 수락에 실패했어요"),
  });

  if (!token) {
    return (
      <PublicLayout>
        <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
          <h1 className="font-display text-3xl">유효하지 않은 초대 링크예요</h1>
          <p className="mt-3 text-muted-foreground">링크를 다시 한 번 확인해 주세요.</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/">홈으로</Link>
          </Button>
        </section>
      </PublicLayout>
    );
  }

  const inv = preview.data;
  const blocked = inv?.used || inv?.expired;

  return (
    <PublicLayout>
      <section className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-16 text-center sm:py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-soft">
          <Heart className="h-7 w-7 fill-primary stroke-primary" />
        </div>
        <StatusBadge tone="rose" className="mt-6">보호자 초대</StatusBadge>
        <h1 className="mt-4 font-display text-4xl tracking-tight text-foreground sm:text-5xl text-balance">
          {inv?.inviter_nickname ?? "가족"}님이 <span className="text-primary">곁</span>에서
          <br />
          함께 돌보자고 초대했어요.
        </h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          {inv?.family_name ?? "가족"} 그룹의 보호자가 되어 부모님의 일상을 함께 지켜봐 주세요.
        </p>

        <div className="mt-8 w-full rounded-3xl border border-border/60 bg-card p-6 text-left">
          {preview.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 초대 정보를 불러오는 중…
            </div>
          ) : preview.error ? (
            <p className="text-sm text-destructive">{(preview.error as Error).message}</p>
          ) : inv ? (
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">가족 그룹</dt>
                <dd className="mt-1 font-medium">{inv.family_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">초대한 사람</dt>
                <dd className="mt-1 font-medium">{inv.inviter_nickname ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">관계</dt>
                <dd className="mt-1 font-medium">{inv.display_label ?? "보호자"}</dd>
              </div>
            </dl>
          ) : null}
          {inv?.used && (
            <p className="mt-3 text-xs text-destructive">이미 사용된 초대예요.</p>
          )}
          {inv?.expired && !inv.used && (
            <p className="mt-3 text-xs text-destructive">만료된 초대예요. 시니어에게 새 링크를 받아 주세요.</p>
          )}
        </div>

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            size="xl"
            variant="hero"
            className="gap-2"
            disabled={!isAuthenticated || blocked || accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            초대 수락하기
          </Button>
          <Button asChild size="xl" variant="outline" className="gap-2">
            <Link to="/">
              <X className="h-4 w-4" /> 나중에
            </Link>
          </Button>
        </div>

        {!isAuthenticated && !loading && (
          <p className="mt-6 text-xs text-muted-foreground">
            잠시 후 로그인 화면으로 이동해요…
          </p>
        )}
      </section>
    </PublicLayout>
  );
}
