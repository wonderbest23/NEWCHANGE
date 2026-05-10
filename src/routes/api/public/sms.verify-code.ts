import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({
  phone: z.string().regex(/^01[0-9]{8,9}$/, "올바른 휴대폰 번호를 입력해 주세요"),
  code: z.string().regex(/^[0-9]{6}$/, "6자리 숫자를 입력해 주세요"),
});

function hashCode(phone: string, code: string) {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export const Route = createFileRoute("/api/public/sms/verify-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const json = await request.json();
          const parsed = Body.safeParse(json);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0].message },
              { status: 400 },
            );
          }

          const { phone, code } = parsed.data;

          const { data: row, error } = await supabaseAdmin
            .from("phone_verifications")
            .select("id, code_hash, attempts, expires_at, verified_at")
            .eq("phone", phone)
            .is("verified_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error || !row) {
            return Response.json(
              { error: "인증번호를 다시 요청해 주세요" },
              { status: 404 },
            );
          }

          if (new Date(row.expires_at).getTime() < Date.now()) {
            return Response.json(
              { error: "인증번호가 만료되었어요. 다시 요청해 주세요" },
              { status: 410 },
            );
          }

          if (row.attempts >= 5) {
            return Response.json(
              { error: "시도 횟수를 초과했어요. 다시 요청해 주세요" },
              { status: 429 },
            );
          }

          if (row.code_hash !== hashCode(phone, code)) {
            await supabaseAdmin
              .from("phone_verifications")
              .update({ attempts: row.attempts + 1 })
              .eq("id", row.id);
            return Response.json(
              { error: "인증번호가 일치하지 않아요" },
              { status: 400 },
            );
          }

          await supabaseAdmin
            .from("phone_verifications")
            .update({ verified_at: new Date().toISOString() })
            .eq("id", row.id);

          return Response.json({ ok: true, phone });
        } catch (e) {
          console.error("[sms.verify-code]", e);
          return Response.json(
            { error: "처리 중 오류가 발생했어요" },
            { status: 500 },
          );
        }
      },
    },
  },
});
