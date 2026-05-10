import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Play, Sparkles } from "lucide-react";
import { runSimulation, type ScenarioId, type SimulationResult } from "@/lib/care/simulator-actions";
import type { CareRecipientRow } from "@/lib/care/dashboard-actions";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";

const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: "happy_path", label: "정상" },
  { id: "meal_skipped", label: "식사 결식" },
  { id: "med_missed", label: "약 미복용" },
  { id: "fall_mentioned", label: "낙상 언급" },
  { id: "depression", label: "우울 표현" },
  { id: "wrong_person", label: "본인 아님" },
  { id: "no_answer", label: "응답 없음" },
];

export function SimulatorPanel({ recipients }: { recipients: CareRecipientRow[] }) {
  const [recipientId, setRecipientId] = useState<string>(recipients[0]?.id ?? "");
  const [scenario, setScenario] = useState<ScenarioId>("happy_path");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = !recipientId || loading;

  async function handleRun() {
    if (!recipientId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data: { session } } = await getSessionCached();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다");
      const r = await runSimulation({
        data: { recipient_id: recipientId, scenario },
        headers: { Authorization: `Bearer ${token}` },
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "시뮬레이션 실패");
    } finally {
      setLoading(false);
    }
  }

  if (recipients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> 통화 시뮬레이터
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            어르신을 먼저 등록해주세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> 통화 시뮬레이터
          <Badge variant="outline" className="ml-2 text-[10px]">실통화 없음</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">대상 어르신</span>
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>{r.display_name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">시나리오</span>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as ScenarioId)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>

        <Button onClick={handleRun} disabled={disabled} size="sm">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          시뮬레이션 실행
        </Button>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && <ResultView result={result} />}

        <p className="text-[11px] text-muted-foreground">
          실제 카카오/SMS 발송은 일어나지 않습니다(어댑터 stub). 알림 outbox에만 기록됩니다.
        </p>
      </CardContent>
    </Card>
  );
}

function ResultView({ result }: { result: SimulationResult }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap gap-2 text-[11px]">
        <Badge variant="outline">session {result.session_id.slice(0, 8)}…</Badge>
        <Badge variant="outline">추출 {result.extracted_count}건</Badge>
        <Badge variant={result.fired_rules.length > 0 ? "destructive" : "secondary"}>
          규칙 {result.fired_rules.length}건
        </Badge>
        <Badge variant="outline">알림 enqueue {result.enqueued_alerts.reduce((s, e) => s + e.enqueued, 0)}건</Badge>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">대화 흐름</p>
        <ul className="space-y-1 text-sm">
          {result.turns.length === 0 && (
            <li className="text-muted-foreground italic">발화 없음 (no_answer / wrong_person)</li>
          )}
          {result.turns.map((t, i) => (
            <li
              key={i}
              className={`rounded-md px-2 py-1 ${
                t.role === "ai" ? "bg-primary/5 text-foreground" : "bg-card"
              }`}
            >
              <span className="mr-2 text-[10px] font-mono text-muted-foreground">
                {t.role === "ai" ? "AI" : "어르신"}
              </span>
              {t.text}
            </li>
          ))}
        </ul>
      </div>

      {result.fired_rules.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">발동 규칙</p>
          <ul className="space-y-1 text-sm">
            {result.fired_rules.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge
                  variant={f.severity === "critical" ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {f.code}
                </Badge>
                <span className="flex-1">{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.enqueued_alerts.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">알림 처리</p>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {result.enqueued_alerts.map((e, i) => (
              <li key={i}>
                alert {e.alert_id.slice(0, 8)}… · enqueued {e.enqueued}
                {e.skipped_reason && ` · skipped (${e.skipped_reason})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
