/**
 * Web Push 구독을 백엔드에 등록/해제하는 server fn.
 *
 * 필요 환경변수:
 *   - VITE_VAPID_PUBLIC_KEY: 클라이언트가 pushManager.subscribe 시 사용
 *   - VAPID_PRIVATE_KEY: 서버에서 push 발송 시명. (sendPush 별도 endpoint)
 *   - VAPID_SUBJECT: "mailto:contact@yourdomain" 형식
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  user_agent: z.string().max(500).optional(),
});

export const registerPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => SubscribeSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // endpoint 가 unique 제약이므로 upsert: 이미 있으면 last_seen_at 갱신.
    const existing = await supabase
      .from("push_subscriptions" as never)
      .select("id")
      .eq("endpoint", data.endpoint)
      .maybeSingle();

    if (existing.data) {
      await supabase
        .from("push_subscriptions" as never)
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", (existing.data as { id: string }).id);
      return { ok: true as const, updated: true };
    }

    const { error } = await supabase.from("push_subscriptions" as never).insert({
      user_id: userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      user_agent: data.user_agent ?? null,
    });
    if (error) {
      return { ok: false as const, reason: error.message };
    }
    return { ok: true as const, created: true };
  });

const UnsubscribeSchema = z.object({ endpoint: z.string().url() });

export const unregisterPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => UnsubscribeSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    await supabase
      .from("push_subscriptions" as never)
      .delete()
      .eq("endpoint", data.endpoint);
    return { ok: true as const };
  });
