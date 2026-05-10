import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DAILY_LIMIT = 5;

export const sendDirectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { recipientId: string; body: string }) =>
    z.object({
      recipientId: z.string().uuid(),
      body: z.string().trim().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (userId === data.recipientId) throw new Error("본인에게는 보낼 수 없습니다");

    const { data: blocks } = await supabase
      .from("dm_blocks")
      .select("blocker_id, blocked_id")
      .or(
        `and(blocker_id.eq.${userId},blocked_id.eq.${data.recipientId}),and(blocker_id.eq.${data.recipientId},blocked_id.eq.${userId})`,
      );
    if (blocks && blocks.length > 0) {
      throw new Error("쪽지를 보낼 수 없는 상대입니다");
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("direct_messages")
      .select("*", { count: "exact", head: true })
      .eq("sender_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      throw new Error(`하루에 ${DAILY_LIMIT}건까지만 보낼 수 있어요`);
    }

    const { data: inserted, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: userId,
        recipient_id: data.recipientId,
        body: data.body.trim(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<
      Array<{ partnerId: string; lastBody: string; lastAt: string; unread: number }>
    > => {
      const { supabase, userId } = context;
      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("sender_id, recipient_id, body, created_at, read_at")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(500);

      const map = new Map<
        string,
        { partnerId: string; lastBody: string; lastAt: string; unread: number }
      >();
      for (const m of msgs ?? []) {
        const partner = m.sender_id === userId ? m.recipient_id : m.sender_id;
        const existing = map.get(partner);
        const unreadInc = m.recipient_id === userId && !m.read_at ? 1 : 0;
        if (!existing) {
          map.set(partner, {
            partnerId: partner,
            lastBody: m.body,
            lastAt: m.created_at,
            unread: unreadInc,
          });
        } else {
          existing.unread += unreadInc;
        }
      }
      return Array.from(map.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
    },
  );

export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) =>
    z.object({ partnerId: z.string().uuid() }).parse(d),
  )
  .handler(
    async ({ data, context }): Promise<
      Array<{ id: string; mine: boolean; body: string; createdAt: string; readAt: string | null }>
    > => {
      const { supabase, userId } = context;

      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, created_at, read_at")
        .or(
          `and(sender_id.eq.${userId},recipient_id.eq.${data.partnerId}),and(sender_id.eq.${data.partnerId},recipient_id.eq.${userId})`,
        )
        .order("created_at", { ascending: true })
        .limit(500);

      const unreadIds = (msgs ?? [])
        .filter((m) => m.recipient_id === userId && !m.read_at)
        .map((m) => m.id);
      if (unreadIds.length) {
        await supabase
          .from("direct_messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", unreadIds);
      }

      return (msgs ?? []).map((m) => ({
        id: m.id,
        mine: m.sender_id === userId,
        body: m.body,
        createdAt: m.created_at,
        readAt: m.read_at,
      }));
    },
  );

export const blockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (userId === data.userId) throw new Error("본인은 차단할 수 없습니다");
    const { error } = await supabase
      .from("dm_blocks")
      .upsert(
        { blocker_id: userId, blocked_id: data.userId },
        { onConflict: "blocker_id,blocked_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; reason: string }) =>
    z.object({
      messageId: z.string().uuid(),
      reason: z.string().trim().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("dm_reports").insert({
      message_id: data.messageId,
      reporter_id: userId,
      reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unreadDirectMessageCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("direct_messages")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    return count ?? 0;
  });
