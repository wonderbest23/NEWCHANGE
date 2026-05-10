/**
 * Internal: rule engine 수동 실행
 *
 * POST /api/internal/rules/run
 * header: x-internal-secret: ${INTERNAL_CRON_SECRET}
 * body:
 *   { recipientId: string }   → 단일 recipient 평가
 *   {}                        → 전체 active recipient 일괄 평가 (cron 용)
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  runRulesForRecipient,
  runRulesForAllRecipients,
} from "@/server/care/rule-engine.server";

const Body = z.object({
  recipientId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/api/internal/rules/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_CRON_SECRET;
        if (!secret) return new Response("internal secret not configured", { status: 401 });
        if (request.headers.get("x-internal-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let raw: unknown = {};
        try {
          const text = await request.text();
          raw = text ? JSON.parse(text) : {};
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }

        if (parsed.data.recipientId) {
          const result = await runRulesForRecipient(parsed.data.recipientId);
          return Response.json(result, { status: result.ok ? 200 : 500 });
        }
        const result = await runRulesForAllRecipients();
        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
