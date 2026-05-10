import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash, createHmac, randomInt, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({
  phone: z.string().regex(/^01[0-9]{8,9}$/, "올바른 휴대폰 번호를 입력해 주세요"),
});

const SOLAPI_URL = "https://api.solapi.com/messages/v4/send";

function hashCode(phone: string, code: string) {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function solapiAuthHeader(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export const Route = createFileRoute("/api/public/sms/send-code")({
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

          const apiKey = process.env.SOLAPI_API_KEY;
          const apiSecret = process.env.SOLAPI_API_SECRET;
          const sender = process.env.SOLAPI_SENDER;
          if (!apiKey || !apiSecret || !sender) {
            return Response.json(
              { error: "SMS 발송 설정이 완료되지 않았어요" },
              { status: 500 },
            );
          }

          const { phone } = parsed.data;

          // 1분 내 재발송 제한
          const { data: recent } = await supabaseAdmin
            .from("phone_verifications")
            .select("created_at")
            .eq("phone", phone)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (recent) {
            const ageSec =
              (Date.now() - new Date(recent.created_at).getTime()) / 1000;
            if (ageSec < 60) {
              return Response.json(
                {
                  error: `잠시 후 다시 시도해 주세요 (${Math.ceil(60 - ageSec)}초)`,
                },
                { status: 429 },
              );
            }
          }

          const code = String(randomInt(0, 1000000)).padStart(6, "0");
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

          // 기존 미인증 코드 무효화
          await supabaseAdmin
            .from("phone_verifications")
            .delete()
            .eq("phone", phone)
            .is("verified_at", null);

          const { error: insertErr } = await supabaseAdmin
            .from("phone_verifications")
            .insert({
              phone,
              code_hash: hashCode(phone, code),
              expires_at: expiresAt,
            });
          if (insertErr) {
            console.error("[sms.send-code] insert", insertErr);
            return Response.json(
              { error: "인증번호 저장에 실패했어요" },
              { status: 500 },
            );
          }

          // 솔라피 발송
          const res = await fetch(SOLAPI_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: solapiAuthHeader(apiKey, apiSecret),
            },
            body: JSON.stringify({
              message: {
                to: phone,
                from: sender,
                text: `[곁] 인증번호: ${code} (5분 이내 입력)`,
              },
            }),
          });

          const result = (await res.json()) as {
            statusCode?: string;
            statusMessage?: string;
            errorCode?: string;
            errorMessage?: string;
          };

          // 솔라피 성공 코드: 2000
          if (!res.ok || (result.statusCode && result.statusCode !== "2000")) {
            console.error("[sms.send-code] solapi failed", result);
            return Response.json(
              {
                error:
                  result.errorMessage ??
                  result.statusMessage ??
                  "SMS 발송에 실패했어요",
              },
              { status: 502 },
            );
          }

          return Response.json({ ok: true, expiresAt });
        } catch (e) {
          console.error("[sms.send-code]", e);
          return Response.json(
            { error: "처리 중 오류가 발생했어요" },
            { status: 500 },
          );
        }
      },
    },
  },
});
