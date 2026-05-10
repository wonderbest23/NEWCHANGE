import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check, HeartHandshake, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  createGuardianInvite,
  listMyInvites,
  type InviteRow,
} from "@/server/family/invites.functions";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";

export const Route = createFileRoute("/home/invite")({
  ssr: false,
  head: () => ({ meta: [{ title: "가족 초대 — 곁" }] }),
  component: InvitePage,
});

async function authHeaders() {
  const { data } = await getSessionCached();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다");
  return { Authorization: `Bearer ${token}` };
}

function InvitePage() {
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function refresh() {
    try {
      const headers = await authHeaders();
      const list = await listMyInvites({ headers } as Parameters<typeof listMyInvites>[0]);
      setInvites(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const headers = await authHeaders();
      await createGuardianInvite({
        data: { label: label.trim() || null },
        headers,
      } as Parameters<typeof createGuardianInvite>[0]);
      setLabel("");
      toast.success("초대 링크가 만들어졌어요");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "초대 만들기에 실패했어요");
    } finally {
      setCreating(false);
    }
  }

  function inviteUrl(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/invite/guardian?token=${token}`;
  }

  function copy(token: string, id: string) {
    const url = inviteUrl(token);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      toast.success("링크가 복사됐어요");
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function shareKakao(token: string) {
    const url = inviteUrl(token);
    const text = `[곁] 제 안부를 함께 봐주세요. 아래 링크로 들어와 가입하면 보호자로 연결돼요.\n${url}`;
    if (navigator.share) {
      navigator.share({ title: "곁 가족 초대", text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success("초대 메시지가 복사됐어요. 카톡에 붙여넣으세요.");
    }
  }

  return (
    <SeniorAppLayout>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-soft text-primary">
          <HeartHandshake className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl text-foreground">가족 초대하기</h1>
          <p className="text-sm text-foreground/60">
            링크를 받은 가족이 가입하면 안부를 함께 볼 수 있어요
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-background p-5">
        <Label htmlFor="label" className="text-base">
          누구에게 보낼까요? <span className="text-foreground/50">(선택)</span>
        </Label>
        <Input
          id="label"
          placeholder="예: 큰아들 지원"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          className="mt-2 h-12 rounded-xl text-base"
        />
        <Button
          size="lg"
          className="mt-4 w-full rounded-full"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          초대 링크 만들기
        </Button>
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-foreground/60">
        만든 초대
      </h2>
      {loading ? (
        <p className="mt-3 text-sm text-foreground/50">불러오는 중…</p>
      ) : invites.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-foreground/60">
          아직 만든 초대가 없어요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {invites.map((inv) => {
            const used = !!inv.used_at;
            const expired = !used && new Date(inv.expires_at).getTime() < Date.now();
            return (
              <li
                key={inv.id}
                className="rounded-2xl border border-border bg-background p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">
                    {inv.display_label ?? "이름 미지정"}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      used
                        ? "bg-sage-soft text-sage"
                        : expired
                          ? "bg-muted text-muted-foreground"
                          : "bg-rose-soft text-primary"
                    }`}
                  >
                    {used ? "수락됨" : expired ? "만료" : "대기 중"}
                  </span>
                </div>
                <p className="mt-2 break-all rounded-lg bg-surface p-2 text-xs text-foreground/70">
                  {inviteUrl(inv.token)}
                </p>
                {!used && !expired && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => copy(inv.token, inv.id)}
                    >
                      {copiedId === inv.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      복사
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => shareKakao(inv.token)}
                    >
                      <MessageCircle className="h-4 w-4" /> 카톡 공유
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SeniorAppLayout>
  );
}
