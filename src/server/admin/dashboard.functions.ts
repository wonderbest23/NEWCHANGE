/**
 * Admin Dashboard — 관리자 홈 통합 집계.
 *
 * 기존: 클라이언트가 7개 Supabase REST 쿼리를 병렬 호출 → RTT/페이로드 누적으로 느림.
 * 개선: 서버에서 한 번에 집계해 가공된 결과만 반환. 첫 화면 응답 1회로 단축.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SEOUL_GU = [
  "강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구",
  "동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구",
  "영등포구","용산구","은평구","종로구","중구","중랑구",
] as const;

export interface AdminDashboardRecent {
  id: string;
  checkin_at: string;
  condition_level: string;
  summary: string | null;
  urgent_detected: boolean;
}

export interface AdminDashboardData {
  stats: { seniors: number; todayCheckins: number; weekCheckins: number; urgentOpen: number };
  byLevel: { good: number; normal: number; caution: number; urgent: number };
  quality: {
    totalEvents: number;
    completedCalls: number;
    failedCalls: number;
    draftSaved: number;
    correctionEvents: number;
    avgStepCompletionPct: number;
    missingStepEventPct: number;
    urgentQualityEvents: number;
    avgJitterMs: number | null;
    avgRttMs: number | null;
    packetLossEvents: number;
    topIssueFlags: { flag: string; count: number }[];
  };
  recent: AdminDashboardRecent[];
  seoulDistricts: { name: string; count: number }[];
  otherCount: number;
  districtCheckins: {
    name: string;
    today: number;
    week: number;
    cautionPct: number;
    urgentPct: number;
  }[];
  hourlyDist: number[];
}

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin" as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden_admin_only");
}

function startOfTodayKST(): string {
  // KST = UTC+9
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  // 자정(KST) → UTC 환산: 전날 15:00:00Z
  return `${y}-${m}-${d}T00:00:00+09:00`;
}

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDashboardData> => {
    await assertAdmin(context.userId);

    const todayStartKST = startOfTodayKST();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [seniorsRes, todayRes, weekRes, urgentRes, weekRowsRes, recentRes, profilesRes, qualityRes] =
      await Promise.all([
        supabaseAdmin.from("care_recipients").select("*", { count: "exact", head: true }),
        supabaseAdmin
          .from("health_checkins")
          .select("*", { count: "exact", head: true })
          .gte("checkin_at", todayStartKST),
        supabaseAdmin
          .from("health_checkins")
          .select("*", { count: "exact", head: true })
          .gte("checkin_at", weekAgo),
        supabaseAdmin
          .from("anomaly_alerts")
          .select("*", { count: "exact", head: true })
          .eq("status", "open"),
        supabaseAdmin
          .from("health_checkins")
          .select("condition_level, checkin_at, senior_user_id, urgent_detected")
          .gte("checkin_at", weekAgo),
        supabaseAdmin
          .from("health_checkins")
          .select("id, checkin_at, condition_level, summary, urgent_detected")
          .order("checkin_at", { ascending: false })
          .limit(8),
        supabaseAdmin.from("profiles").select("id, region_sido, region_sigungu"),
        supabaseAdmin
          .from("checkin_quality_events")
          .select("status, expected_step_count, completed_step_count, missing_step_ids, correction_count, urgent_detected, issue_flags, audio_stats, created_at")
          .gte("created_at", weekAgo),
      ]);

    const byLevel = { good: 0, normal: 0, caution: 0, urgent: 0 };
    for (const r of weekRowsRes.data ?? []) {
      const k = ((r as { condition_level?: string }).condition_level ?? "normal") as keyof typeof byLevel;
      if (k in byLevel) byLevel[k] += 1;
    }

    const districtMap = new Map<string, number>(SEOUL_GU.map((g) => [g, 0]));
    let other = 0;
    const userToGu = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as Array<{
      id: string;
      region_sido: string | null;
      region_sigungu: string | null;
    }>) {
      const sido = (p.region_sido ?? "").trim();
      const gu = (p.region_sigungu ?? "").trim();
      if (sido === "서울특별시" && districtMap.has(gu)) {
        districtMap.set(gu, (districtMap.get(gu) ?? 0) + 1);
        userToGu.set(p.id, gu);
      } else if (sido || gu) {
        other += 1;
      }
    }

    type GuStat = { today: number; week: number; caution: number; urgent: number };
    const guStats = new Map<string, GuStat>(
      SEOUL_GU.map((g) => [g, { today: 0, week: 0, caution: 0, urgent: 0 }]),
    );
    const todayStartMs = new Date(todayStartKST).getTime();
    const hours = Array(24).fill(0);
    const hourFmt = new Intl.DateTimeFormat("en-GB", {
      hour12: false,
      hour: "2-digit",
      timeZone: "Asia/Seoul",
    });

    for (const c of (weekRowsRes.data ?? []) as Array<{
      checkin_at: string | null;
      senior_user_id: string | null;
      condition_level: string | null;
      urgent_detected: boolean | null;
    }>) {
      const ts = c.checkin_at;
      if (ts) {
        const hh = Number(hourFmt.format(new Date(ts)));
        if (Number.isFinite(hh) && hh >= 0 && hh < 24) hours[hh] += 1;
      }
      const gu = c.senior_user_id ? userToGu.get(c.senior_user_id) : undefined;
      if (!gu) continue;
      const s = guStats.get(gu)!;
      s.week += 1;
      if (ts && new Date(ts).getTime() >= todayStartMs) s.today += 1;
      const lvl = c.condition_level ?? "normal";
      if (lvl === "caution") s.caution += 1;
      if (lvl === "urgent" || c.urgent_detected) s.urgent += 1;
    }

    const qualityRows = (qualityRes.data ?? []) as Array<{
      status: string | null;
      expected_step_count: number | null;
      completed_step_count: number | null;
      missing_step_ids: string[] | null;
      correction_count: number | null;
      urgent_detected: boolean | null;
      issue_flags: string[] | null;
      audio_stats: Record<string, unknown> | null;
    }>;
    const flagCounts = new Map<string, number>();
    let stepPctSum = 0;
    let stepPctN = 0;
    let missingEvents = 0;
    let jitterSum = 0;
    let jitterN = 0;
    let rttSum = 0;
    let rttN = 0;
    let packetLossEvents = 0;

    for (const row of qualityRows) {
      const expected = row.expected_step_count ?? 0;
      const completed = row.completed_step_count ?? 0;
      if (expected > 0) {
        stepPctSum += Math.round((completed / expected) * 100);
        stepPctN += 1;
      }
      if ((row.missing_step_ids ?? []).length > 0) missingEvents += 1;
      for (const flag of row.issue_flags ?? []) {
        flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
      }
      const audio = row.audio_stats ?? {};
      const jitter = Number(audio.maxJitterMs ?? 0);
      const rtt = Number(audio.maxRttMs ?? 0);
      const lost = Number(audio.maxPacketsLost ?? audio.lastPacketsLost ?? 0);
      if (jitter > 0) {
        jitterSum += jitter;
        jitterN += 1;
      }
      if (rtt > 0) {
        rttSum += rtt;
        rttN += 1;
      }
      if (lost > 0) packetLossEvents += 1;
    }

    return {
      stats: {
        seniors: seniorsRes.count ?? 0,
        todayCheckins: todayRes.count ?? 0,
        weekCheckins: weekRes.count ?? 0,
        urgentOpen: urgentRes.count ?? 0,
      },
      byLevel,
      quality: {
        totalEvents: qualityRows.length,
        completedCalls: qualityRows.filter((r) => r.status === "completed").length,
        failedCalls: qualityRows.filter((r) => r.status === "failed" || r.status === "too_short").length,
        draftSaved: qualityRows.filter((r) => r.status === "draft_saved").length,
        correctionEvents: qualityRows.filter((r) => r.status === "review_corrected").length,
        avgStepCompletionPct: stepPctN ? Math.round(stepPctSum / stepPctN) : 0,
        missingStepEventPct: qualityRows.length ? Math.round((missingEvents / qualityRows.length) * 100) : 0,
        urgentQualityEvents: qualityRows.filter((r) => r.urgent_detected).length,
        avgJitterMs: jitterN ? Math.round(jitterSum / jitterN) : null,
        avgRttMs: rttN ? Math.round(rttSum / rttN) : null,
        packetLossEvents,
        topIssueFlags: Array.from(flagCounts, ([flag, count]) => ({ flag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      },
      recent: (recentRes.data ?? []) as AdminDashboardRecent[],
      seoulDistricts: Array.from(districtMap, ([name, count]) => ({ name, count })).sort(
        (a, b) => b.count - a.count,
      ),
      otherCount: other,
      districtCheckins: Array.from(guStats, ([name, s]) => ({
        name,
        today: s.today,
        week: s.week,
        cautionPct: s.week ? Math.round((s.caution / s.week) * 100) : 0,
        urgentPct: s.week ? Math.round((s.urgent / s.week) * 100) : 0,
      }))
        .filter((d) => d.week > 0)
        .sort((a, b) => b.week - a.week),
      hourlyDist: hours,
    };
  });
