/**
 * Client-callable server functions for call jobs.
 * The handler body is stripped from the client bundle by createServerFn.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface CreateImmediateJobResult {
  ok: boolean;
  jobId?: string;
  error?: string;
}

const ImmediateInput = z.object({
  careRecipientId: z.string().uuid(),
  requestedByProfileId: z.string().uuid(),
});

/**
 * 보호자 수동 발신 job 생성.
 */
export const createImmediateCallJob = createServerFn({ method: "POST" })
  .inputValidator((input) => ImmediateInput.parse(input))
  .handler(async ({ data }): Promise<CreateImmediateJobResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { careRecipientId, requestedByProfileId } = data;

    const recipient = await supabaseAdmin
      .from("care_recipients")
      .select("id, family_id, status")
      .eq("id", careRecipientId)
      .maybeSingle();
    if (recipient.error || !recipient.data) return { ok: false, error: "recipient_not_found" };
    if (recipient.data.status !== "active") return { ok: false, error: "recipient_inactive" };

    const member = await supabaseAdmin
      .from("family_members")
      .select("id")
      .eq("family_id", recipient.data.family_id)
      .eq("user_id", requestedByProfileId)
      .maybeSingle();
    if (member.error || !member.data) return { ok: false, error: "not_in_family" };

    const now = new Date();
    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

    const inserted = await supabaseAdmin
      .from("outbound_call_jobs")
      .insert({
        care_recipient_id: careRecipientId,
        scheduled_at: now.toISOString(),
        window_start: now.toISOString(),
        window_end: windowEnd.toISOString(),
        status: "queued",
        reason: "manual",
      } as never)
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      return { ok: false, error: inserted.error?.message ?? "insert_failed" };
    }
    return { ok: true, jobId: inserted.data.id };
  });
