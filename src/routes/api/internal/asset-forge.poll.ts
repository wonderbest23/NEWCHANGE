/**
 * Internal cron — Tripo3D running/queued task 일괄 polling.
 *
 * POST /api/internal/asset-forge/poll
 *   header: x-internal-secret: ${INTERNAL_CRON_SECRET}
 *
 * cron 추천: 1~2분 주기. wrangler.jsonc 의 triggers.crons 에 추가하면 자동 발사.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pollAssetById } from "@/lib/asset-forge/actions";

export const Route = createFileRoute("/api/internal/asset-forge/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_CRON_SECRET;
        if (!secret) return new Response("internal secret not configured", { status: 401 });
        if (request.headers.get("x-internal-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 진행 중인 자산만 조회 (max 20개) → 순차 polling.
        const { data: rows } = await supabaseAdmin
          .from("generated_assets" as never)
          .select("id, created_at")
          .in("status", ["queued", "running"])
          .order("created_at", { ascending: true })
          .limit(20);

        const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
        const results: Array<{ id: string; status?: string; ok: boolean; reason?: string }> = [];
        for (const id of ids) {
          const r = await pollAssetById(id);
          if (r.ok) results.push({ id, ok: true, status: r.status });
          else results.push({ id, ok: false, reason: r.reason });
        }

        return Response.json({ ok: true, considered: ids.length, results });
      },
    },
  },
});
