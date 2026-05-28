/**
 * Internal Web Push 발송 endpoint.
 *
 * POST /api/internal/push/send
 *   header: x-internal-secret: ${INTERNAL_CRON_SECRET}
 *   body: { user_id?: uuid, all?: boolean, title: string, body: string, url?: string, tag?: string }
 *
 * - user_id 지정 시 해당 사용자의 모든 push_subscriptions 에게 발송.
 * - all=true 면 전체 사용자에게 (베타 알림 등). 운영 신중.
 * - VAPID 키가 env 에 없으면 503.
 *
 * 410/404 응답이 오면 stale subscription 으로 간주해 삭제.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({
  user_id: z.string().uuid().optional(),
  all: z.boolean().optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  url: z.string().max(500).optional(),
  tag: z.string().max(60).optional(),
});

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function deleteSubscription(id: string) {
  await supabaseAdmin
    .from("push_subscriptions" as never)
    .delete()
    .eq("id", id);
}

export const Route = createFileRoute("/api/internal/push/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_CRON_SECRET;
        if (!secret) return new Response("internal secret not configured", { status: 401 });
        if (request.headers.get("x-internal-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        const subject = process.env.VAPID_SUBJECT;
        if (!publicKey || !privateKey || !subject) {
          return new Response("VAPID keys not configured", { status: 503 });
        }
        webpush.setVapidDetails(subject, publicKey, privateKey);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ ok: false, error: parsed.error.message }, { status: 400 });
        }
        const { user_id, all, title, body, url, tag } = parsed.data;
        if (!user_id && !all) {
          return Response.json(
            { ok: false, error: "either user_id or all=true required" },
            { status: 400 },
          );
        }

        const q = supabaseAdmin
          .from("push_subscriptions" as never)
          .select("id, user_id, endpoint, p256dh, auth");
        const { data: subs, error } = user_id
          ? await q.eq("user_id", user_id)
          : await q;
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const list = (subs ?? []) as unknown as SubRow[];
        const payload = JSON.stringify({ title, body, url, tag });

        let sent = 0;
        let failed = 0;
        let purged = 0;

        await Promise.all(
          list.map(async (s) => {
            try {
              await webpush.sendNotification(
                {
                  endpoint: s.endpoint,
                  keys: { p256dh: s.p256dh, auth: s.auth },
                },
                payload,
                { TTL: 60 * 60 * 24 },
              );
              sent++;
            } catch (err: unknown) {
              const statusCode = (err as { statusCode?: number })?.statusCode;
              if (statusCode === 404 || statusCode === 410) {
                // gone — endpoint dead
                await deleteSubscription(s.id).catch(() => null);
                purged++;
              } else {
                failed++;
                console.error("[push:send] failed", { endpoint: s.endpoint, err });
              }
            }
          }),
        );

        return Response.json({ ok: true, sent, failed, purged, considered: list.length });
      },
    },
  },
});
