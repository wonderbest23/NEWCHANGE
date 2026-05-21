import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * 최근 3일치 안부 통화 요약을 불러와 AI가 "기억"할 수 있는 한 단락으로 만든다.
 * - 시니어 본인의 health_checkins.summary (가장 최근 3건, 오늘 제외)
 * - 빈 결과/오류 시 빈 문자열 반환 (조용히 실패)
 *
 * v3 PR1: AI Memory Loop
 */
export async function buildAiMemoryContext(token: string | null): Promise<string> {
  if (!token) return "";
  try {
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return "";
    const userId = userData.user.id;

    const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const todayStartISO = new Date(`${kstDate}T00:00:00+09:00`).toISOString();

    const { data, error } = await supabaseAdmin
      .from("care_memory_items")
      .select("content, confidence, observation_count, last_observed_at")
      .eq("user_id", userId)
      .is("denied_at", null)
      .lt("last_observed_at", todayStartISO)
      .gte("confidence", 0.6)
      .order("last_observed_at", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(3);

    if (error || !data || data.length === 0) return "";

    const fmt = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
    });
    const lines = data
      .map((r) => {
        const when = r.last_observed_at ? fmt.format(new Date(r.last_observed_at)) : "최근";
        const s = (r.content ?? "").toString().trim().slice(0, 140);
        if (!s) return null;
        return `- ${when}: ${s} (확인 ${r.observation_count ?? 1}회)`;
      })
      .filter(Boolean)
      .join("\n");

    if (!lines) return "";

    return [
      "[지난 대화 기억 — 어르신과 최근에 나눈 안부의 핵심]",
      lines,
      "",
      "활용 규칙:",
      "- 자연스럽게 한 번만 짧게 이어 여쭤보세요. 예) \"어제 무릎이 아프시다고 하셨는데, 오늘은 좀 어떠세요?\"",
      "- 기억을 줄줄 나열하거나, 의료적으로 단정/진단하지 마세요.",
      "- 어르신이 기억을 부정하면 부드럽게 \"제가 잘못 들었나봐요\" 하고 넘어가세요.",
    ].join("\n");
  } catch (e) {
    console.error("[voice-test] buildAiMemoryContext failed", e);
    return "";
  }
}
