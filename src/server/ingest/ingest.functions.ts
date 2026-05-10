// 어드민 전용 서버 함수: 수동 수집 트리거 + 최근 실행 결과 조회
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ingestSeoulWelfare,
  ingestSeoulReservations,
  ingestDistrictRss,
  backfillEmbeddings,
} from "./collectors.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("관리자 권한이 필요합니다.");
}

const TaskInput = z.object({
  task: z.enum(["welfare", "events", "rss", "embeddings", "all"]),
});

export const runIngestTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TaskInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const out: Record<string, { inserted: number; updated: number; errors: number; error?: string }> = {};
    try {
      if (data.task === "welfare" || data.task === "all") out.welfare = await ingestSeoulWelfare();
      if (data.task === "events" || data.task === "all") out.events = await ingestSeoulReservations();
      if (data.task === "rss" || data.task === "all") out.rss = await ingestDistrictRss();
      if (data.task === "embeddings" || data.task === "all") out.embeddings = await backfillEmbeddings(50);
      return { ok: true, task: data.task, results: out, error: null as string | null };
    } catch (e) {
      return { ok: false, task: data.task, results: out, error: String(e) };
    }
  });

export const listIngestRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("ingest_runs")
      .select("id, source_name, district, status, inserted_count, updated_count, error_count, error_message, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { runs: data ?? [] };
  });
