/**
 * Care setup — family + recipient 빠른 등록용 server functions
 *
 * 파일럿 단계에서 보호자가 직접 가족과 어르신을 만들 수 있게 함.
 * RLS:
 *  - families/family_members 는 admin client 로 생성 (auth.uid() 보유자가 family에
 *    속하기 전이라서 user-context 로는 INSERT 불가)
 *  - care_recipients 는 family 소속 후 user-context 로 insert
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FamilyInput = z.object({
  family_name: z.string().min(1).max(60),
  display_name: z.string().min(1).max(60).optional(),
});

export const ensureFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FamilyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 이미 family에 속해 있으면 그대로 반환
    const existing = await supabaseAdmin
      .from("family_members")
      .select("family_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.family_id) {
      return { family_id: existing.data.family_id, created: false };
    }

    const fam = await supabaseAdmin
      .from("families")
      .insert({ name: data.family_name })
      .select("id")
      .single();
    if (fam.error) throw new Error(fam.error.message);

    const mem = await supabaseAdmin
      .from("family_members")
      .insert({
        family_id: fam.data.id,
        user_id: userId,
        role: "primary_guardian",
        display_name: data.display_name ?? null,
      });
    if (mem.error) throw new Error(mem.error.message);

    return { family_id: fam.data.id, created: true };
  });

const RecipientInput = z.object({
  display_name: z.string().min(1).max(40),
  phone_e164: z.string().regex(/^\+\d{8,15}$/, "E.164 형식 (+82...)이어야 합니다"),
});

export const createRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RecipientInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const fam = await supabaseAdmin
      .from("family_members")
      .select("family_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (fam.error) throw new Error(`family lookup: ${fam.error.message}`);
    if (!fam.data?.family_id) {
      throw new Error("먼저 가족을 만들어주세요.");
    }

    // 이미 같은 가족에 등록된 대상자가 있으면 멱등 반환
    const existing = await supabaseAdmin
      .from("care_recipients")
      .select("id")
      .eq("family_id", fam.data.family_id)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error(`recipient lookup: ${existing.error.message}`);
    if (existing.data?.id) {
      return { recipient_id: existing.data.id, created: false };
    }

    const ins = await supabase
      .from("care_recipients")
      .insert({
        family_id: fam.data.family_id,
        display_name: data.display_name,
        phone_e164: data.phone_e164,
      })
      .select("id")
      .single();
    if (ins.error) throw new Error(`recipient insert: ${ins.error.message}`);
    return { recipient_id: ins.data.id, created: true };
  });
