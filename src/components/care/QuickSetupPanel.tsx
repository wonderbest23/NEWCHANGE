import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserPlus } from "lucide-react";
import { ensureFamily, createRecipient } from "@/lib/care/setup-actions";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";

export function QuickSetupPanel({ hasFamily, onCreated }: { hasFamily: boolean; onCreated?: () => void }) {
  const [familyName, setFamilyName] = useState("우리 가족");
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("+82");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSessionCached();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다");
      const authHeaders = { Authorization: `Bearer ${token}` };
      if (!hasFamily) {
        await ensureFamily({ data: { family_name: familyName }, headers: authHeaders });
      }
      await createRecipient({
        data: { display_name: recipientName, phone_e164: phone },
        headers: authHeaders,
      });
      onCreated?.();
      setRecipientName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> 어르신 등록 (파일럿)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!hasFamily && (
            <label className="block text-xs">
              <span className="text-muted-foreground">가족 이름</span>
              <input
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              />
            </label>
          )}
          <label className="block text-xs">
            <span className="text-muted-foreground">어르신 표시 이름</span>
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              required
              placeholder="예: 어머니"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">전화번호 (E.164)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+821012345678"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            />
          </label>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            등록
          </Button>
          <p className="text-[11px] text-muted-foreground">
            실통화는 아직 발생하지 않습니다. 시뮬레이터 대상자로만 사용됩니다.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
