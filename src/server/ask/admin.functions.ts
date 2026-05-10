import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AskLogRow = {
  id: string;
  user_id: string | null;
  question: string;
  risk_category: "medical" | "legal" | "finance" | null;
  answer_title: string | null;
  answer_summary: string | null;
  caution: string | null;
  related_tip_ids: string[];
  created_at: string;
};

const listSchema = z.object({
  risk: z.enum(["all", "medical", "legal", "finance", "none"]).default("all"),
  limit: z.number().int().min(1).max(200).default(100),
});

export const adminListAskLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) throw new Error("관리자만 접근할 수 있어요");

    let q = supabaseAdmin
      .from("ask_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.risk === "none") q = q.is("risk_category", null);
    else if (data.risk !== "all") q = q.eq("risk_category", data.risk);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as AskLogRow[];
  });

export const adminAskLogStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("관리자만 접근할 수 있어요");

    const { data, error } = await supabaseAdmin
      .from("ask_logs")
      .select("risk_category");
    if (error) throw new Error(error.message);
    const stats = { total: data?.length ?? 0, medical: 0, legal: 0, finance: 0, none: 0 };
    (data ?? []).forEach((r: { risk_category: string | null }) => {
      const k = (r.risk_category ?? "none") as keyof typeof stats;
      if (k in stats) (stats[k] as number) += 1;
    });
    return stats;
  });
