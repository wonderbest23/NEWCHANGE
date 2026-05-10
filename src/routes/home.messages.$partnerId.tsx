import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import {
  getThread,
  sendDirectMessage,
  blockUser,
  reportMessage,
} from "@/server/messages/messages.functions";
import { anonLabelForPair } from "@/lib/community/anon";
import { useAuth } from "@/lib/auth/mock-auth";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { ChevronLeft, Loader2, ShieldAlert, Ban } from "lucide-react";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { toast } from "sonner";

export const Route = createFileRoute("/home/messages/$partnerId")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  component: Thread,
});

function Thread() {
  const { partnerId } = Route.useParams();
  const { userId } = useAuth();
  const [msgs, setMsgs] = useState<Awaited<ReturnType<typeof getThread>> | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const reload = () => {
    (async () => {
      try {
        const h = await authHeaders();
        const r = await getThread({ data: { partnerId }, headers: h });
        setMsgs(r);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } catch {
        setMsgs([]);
      }
    })();
  };

  useEffect(reload, [partnerId]);

  const onSend = async () => {
    if (body.trim().length < 1) return;
    setSending(true);
    try {
      await sendDirectMessage({ data: { recipientId: partnerId, body: body.trim() }, headers: await authHeaders() });
      setBody("");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const onBlock = async () => {
    if (!confirm("이 사람을 차단하시겠어요? 더 이상 쪽지를 받지 않습니다.")) return;
    try {
      await blockUser({ data: { userId: partnerId }, headers: await authHeaders() });
      toast.success("차단했습니다");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onReport = async () => {
    const incoming = msgs?.filter((m) => !m.mine) ?? [];
    const last = incoming[incoming.length - 1];
    if (!last) {
      toast.error("신고할 받은 쪽지가 없습니다");
      return;
    }
    const reason = prompt("신고 사유를 적어주세요 (예: 사기·욕설·음란)");
    if (!reason) return;
    try {
      await reportMessage({ data: { messageId: last.id, reason }, headers: await authHeaders() });
      toast.success("신고가 접수되었습니다");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const partnerLabel = userId ? anonLabelForPair(userId, partnerId) : "익명";

  return (
    <PublicLayout>
      <div className="mx-auto flex h-[calc(100dvh-80px)] w-full max-w-2xl flex-col px-4 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <Link to="/home/messages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> 쪽지함
          </Link>
          <div className="flex gap-2">
            <button onClick={onReport} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
              <ShieldAlert className="h-3.5 w-3.5" /> 신고
            </button>
            <button onClick={onBlock} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
              <Ban className="h-3.5 w-3.5" /> 차단
            </button>
          </div>
        </div>

        <h1 className="mt-3 font-display text-xl font-semibold">{partnerLabel}</h1>
        <p className="text-xs text-muted-foreground">
          개인정보(전화·계좌·집주소)는 적지 마세요. 의심되면 바로 신고·차단하세요.
        </p>

        <div className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-border bg-surface/40 p-4">
          {!msgs ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : msgs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              아직 주고받은 쪽지가 없어요. 첫 인사를 보내보세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {msgs.map((m) => (
                <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-base leading-relaxed ${
                      m.mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-foreground border border-border"
                    }`}
                  >
                    {m.body}
                    <div className={`mt-1 text-[11px] ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.createdAt).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </li>
              ))}
              <div ref={endRef} />
            </ul>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-card p-3">
          <textarea
            rows={2}
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="쪽지를 입력하세요…"
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-base placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.length} / 500 · 하루 5건</span>
            <Button size="lg" variant="hero" className="rounded-full" onClick={onSend} disabled={sending || body.trim().length < 1}>
              {sending ? "보내는중…" : "보내기"}
            </Button>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
