import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Fingerprint, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import { listMyPasskeys, removeMyPasskey } from "@/lib/auth/passkeys-actions";
import { isPasskeySupported, registerPasskey } from "@/lib/auth/passkey";

export const Route = createFileRoute("/home/passkeys")({
  ssr: false,
  head: () => ({ meta: [{ title: "Face ID / 지문 로그인 — 곁" }] }),
  component: PasskeysPage,
});

type Item = { id: string; device_label: string | null; created_at: string; last_used_at: string | null };

function PasskeysPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const session = await getSessionCached();
    const token = session.data.session?.access_token;
    if (!token) return;
    const list = await listMyPasskeys({
      headers: { Authorization: `Bearer ${token}` },
    } as Parameters<typeof listMyPasskeys>[0]);
    setItems(list as Item[]);
  };

  useEffect(() => {
    void isPasskeySupported().then(setSupported);
    void reload();
  }, []);

  const onAdd = async () => {
    setBusy(true);
    try {
      const label = window.prompt("이 기기 이름을 적어주세요 (예: 내 아이폰)", "내 휴대폰") ?? undefined;
      await registerPasskey(label || undefined);
      toast.success("패스키를 등록했어요");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: string) => {
    if (!confirm("이 기기의 패스키를 삭제할까요?")) return;
    const session = await getSessionCached();
    const token = session.data.session?.access_token;
    if (!token) return;
    await removeMyPasskey({
      headers: { Authorization: `Bearer ${token}` },
      data: { id },
    } as Parameters<typeof removeMyPasskey>[0]);
    toast.success("삭제했어요");
    await reload();
  };

  return (
    <SeniorAppLayout>
      <Link to="/home/me" className="inline-flex items-center gap-1 text-sm text-foreground/60">
        <ChevronLeft className="h-4 w-4" /> 내 정보로
      </Link>
      <h1 className="mt-3 font-display text-3xl text-foreground">Face ID / 지문 로그인</h1>
      <p className="mt-2 text-base text-foreground/70">
        등록한 기기에서는 비밀번호 없이 얼굴이나 지문으로 빠르게 로그인할 수 있어요.
      </p>

      {!supported && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          이 기기는 Face ID / 지문 로그인을 지원하지 않아요. 휴대폰 사파리 또는 크롬에서 시도해 주세요.
        </div>
      )}

      <Button
        onClick={onAdd}
        disabled={!supported || busy}
        size="xl"
        variant="hero"
        className="mt-6 h-16 w-full gap-2 rounded-2xl text-lg font-semibold"
      >
        <Plus className="h-5 w-5" /> 이 기기 등록하기
      </Button>

      <h2 className="mt-10 font-display text-xl text-foreground">등록된 기기</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-foreground/60">
            아직 등록된 기기가 없어요.
          </li>
        ) : (
          items.map((it) => (
            <li key={it.id} className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-soft text-primary">
                  <Fingerprint className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-foreground">{it.device_label || "기기"}</p>
                  <p className="text-xs text-foreground/60">
                    등록 {new Date(it.created_at).toLocaleDateString("ko-KR")}
                    {it.last_used_at ? ` · 최근 ${new Date(it.last_used_at).toLocaleDateString("ko-KR")}` : ""}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onRemove(it.id)} className="text-destructive">
                <Trash2 className="h-5 w-5" />
              </Button>
            </li>
          ))
        )}
      </ul>
    </SeniorAppLayout>
  );
}
