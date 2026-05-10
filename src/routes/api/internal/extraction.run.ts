/**
 * Internal: extraction 수동 재실행
 *
 * POST /api/internal/extraction/run
 * header: x-internal-secret: ${INTERNAL_CRON_SECRET}
 * body:   { sessionId: string }
 *
 * 용도:
 *  - 기존 세션 재처리 (분류기 룰 변경 후 재집계 등).
 *  - extraction 로직 디버깅.
 *
 * 안전:
 *  - INTERNAL_CRON_SECRET 미설정 또는 헤더 불일치 → 401.
 *  - extraction 자체는 axis 중복 방지 → 두 번 호출해도 동일 결과.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { extractFromSession } from "@/server/care/extraction.server";

const Body = z.object({
  sessionId: z.string().uuid(),
});

export const Route = createFileRoute("/api/internal/extraction/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_CRON_SECRET;
        if (!secret) return new Response("internal secret not configured", { status: 401 });
        if (request.headers.get("x-internal-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }

        const result = await extractFromSession(parsed.data.sessionId);
        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
