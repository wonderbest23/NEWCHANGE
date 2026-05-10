import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { listConversations } from "@/server/messages/messages.functions";
import { anonLabelForPair } from "@/lib/community/anon";
import { useAuth } from "@/lib/auth/mock-auth";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { Mail, Loader2, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/home/messages/")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  component: MessagesIndex,
});

function MessagesIndex() {
  const { userId } = useAuth();
  const [items, setItems] = useState<Awaited<ReturnType<typeof listConversations>> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const h = await authHeaders();
        const r = await listConversations({ headers: h });
        setItems(r);
      } catch {
        setItems([]);
      }
    })();
  }, []);

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-2xl px-4 pt-10 pb-24">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl font-semibold">받은 쪽지</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          하루에 5건까지 보낼 수 있어요. 모르는 사람이 개인정보·돈을 요구하면 답하지 마시고 바로 신고해 주세요.
        </p>

        {!items ? (
          <div className="mt-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            아직 주고받은 쪽지가 없어요.
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {items.map((c) => (
              <li key={c.partnerId}>
                <Link
                  to="/home/messages/$partnerId"
                  params={{ partnerId: c.partnerId }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-soft text-sm font-semibold text-primary">
                    {anonLabelForPair(userId!, c.partnerId).replace("익명 #", "").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {anonLabelForPair(userId!, c.partnerId)}
                      </span>
                      {c.unread > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{c.lastBody}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicLayout>
  );
}
