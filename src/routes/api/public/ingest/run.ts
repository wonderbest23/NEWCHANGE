// Cron 엔드포인트: 수집기 트리거 (pg_cron이 호출)
// 보안: INTERNAL_CRON_SECRET 필요

import { createFileRoute } from "@tanstack/react-router";
import {
  ingestSeoulWelfare,
  ingestSeoulReservations,
  ingestDistrictRss,
  ingestSeoulSeniorJobs,
  backfillEmbeddings,
} from "@/server/ingest/collectors.server";
import {
  ingestFirecrawlDistrictPrograms,
  ingestFirecrawlCityWide,
} from "@/server/ingest/firecrawl.server";

export const Route = createFileRoute("/api/public/ingest/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const apikey = request.headers.get("apikey") ?? "";
        const secret = process.env.INTERNAL_CRON_SECRET ?? "";
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const bearerOk = secret && auth === `Bearer ${secret}`;
        const apikeyOk = anon && apikey === anon;
        if (!bearerOk && !apikeyOk) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as { task?: string };
        const task = body.task ?? "all";
        const out: Record<string, unknown> = {};
        try {
          // daily 그룹: 가벼운 OpenAPI 호출 (매일)
          if (task === "welfare" || task === "all" || task === "daily") out.welfare = await ingestSeoulWelfare();
          if (task === "events" || task === "all" || task === "daily") out.events = await ingestSeoulReservations();
          if (task === "rss" || task === "all" || task === "daily") out.rss = await ingestDistrictRss();
          if (task === "senior_jobs" || task === "all" || task === "daily") out.senior_jobs = await ingestSeoulSeniorJobs();

          // weekly 그룹: Firecrawl 기반 (비용 발생 — 주 1회만)
          if (task === "firecrawl_districts" || task === "all" || task === "weekly")
            out.firecrawl_districts = await ingestFirecrawlDistrictPrograms();
          if (task === "firecrawl_city" || task === "all" || task === "weekly")
            out.firecrawl_city = await ingestFirecrawlCityWide();

          if (task === "embeddings" || task === "all" || task === "daily" || task === "weekly")
            out.embeddings = await backfillEmbeddings(100);
          return Response.json({ ok: true, task, results: out });
        } catch (e) {
          return Response.json({ ok: false, error: String(e), partial: out }, { status: 500 });
        }
      },
    },
  },
});
