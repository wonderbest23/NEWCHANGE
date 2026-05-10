/**
 * Internal: notification_outbox dispatcher.
 *
 * POST /api/internal/notifications/dispatch
 * header: x-internal-secret: ${INTERNAL_CRON_SECRET}
 * body:   { limit?: number }   // default 50
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { dispatchOutbox } from "@/server/notifications/outbox.server";

const Body = z.object({ limit: z.number().int().min(1).max(200).optional() });

export const Route = createFileRoute("/api/internal/notifications/dispatch")({
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

        const result = await dispatchOutbox(parsed.data.limit ?? 50);
        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
