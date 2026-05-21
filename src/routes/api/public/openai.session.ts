/**
 * OpenAI Realtime SIP — incoming call webhook.
 *
 * 흐름 (1단계):
 *  1. webhook 서명 검증 (OPENAI_WEBHOOK_SECRET, missing이면 WARN-only)
 *  2. body 파싱 → call_id, sip_headers 추출
 *  3. session-mapping helper로 call_sessions 매핑 (X-Session-Id → X-Job-Id → From 번호)
 *  4. 매핑 성공 시 call_sessions.openai_session_id, status, answered_at 업데이트
 *  5. POST https://api.openai.com/v1/realtime/calls/{call_id}/accept 호출
 *     - model: gpt-realtime
 *     - instructions: 시스템 프롬프트 + 수신자 이름
 *     - tools: [record_answer, mark_unclear, escalate_high_risk, end_call]
 *
 * 매핑 실패 시 200 응답 (재시도 방지) + 에러 로그.
 * accept API 실패 시에도 200 응답 (call은 자동 hangup됨).
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyOpenAIWebhook } from "@/server/openai/verify.server";
import { mapIncomingSipToSession } from "@/server/care/session-mapping.server";
import { buildSystemPrompt } from "@/server/care/llm-prompt";
import { DEFAULT_KOREAN_VOICE } from "@/lib/voice-profile";
import { startRealtimeSideband } from "@/server/care/realtime-sideband.server";

interface IncomingPayload {
  type?: string;
  data?: {
    call_id?: string;
    sip_headers?: Record<string, string> | Array<{ name?: string; value?: string }>;
  };
}

const TOOL_DEFS = [
  {
    type: "function",
    name: "record_answer",
    description:
      "부모님이 현재 질문에 대답하면 호출. classified_value에 분류 결과를 넣고 raw_text에 원문을 넣는다.",
    parameters: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        raw_text: { type: "string" },
        classified_value: { type: "object" },
        confidence: { type: "number" },
      },
      required: ["question_id", "raw_text"],
    },
  },
  {
    type: "function",
    name: "mark_unclear",
    description: "응답이 불명확해 재질문이 필요할 때 호출.",
    parameters: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        raw_text: { type: "string" },
      },
      required: ["question_id"],
    },
  },
  {
    type: "function",
    name: "escalate_high_risk",
    description: "흉통/호흡곤란/낙상 등 즉시 보호자 알림이 필요한 발화 감지 시 호출.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string" },
        raw_text: { type: "string" },
      },
      required: ["category", "raw_text"],
    },
  },
  {
    type: "function",
    name: "end_call",
    description: "모든 질문 완료 또는 사용자가 종료를 원할 때 호출.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
];

async function callOpenAIAccept(
  callId: string,
  recipientName: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[openai:session] OPENAI_API_KEY 미설정 — accept 호출 스킵 (WARN)");
    return { ok: false, error: "missing_api_key" };
  }

  const body = {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-1.5",
    output_modalities: ["audio"],
    instructions: buildSystemPrompt({ recipientName }),
    audio: {
      input: {
        transcription: { model: "whisper-1", language: "ko" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.68,
          prefix_padding_ms: 350,
          silence_duration_ms: 900,
          create_response: true,
          interrupt_response: false,
        },
        noise_reduction: { type: "near_field" },
      },
      output: {
        voice: DEFAULT_KOREAN_VOICE,
      },
    },
    tools: TOOL_DEFS,
    tool_choice: "auto",
  };

  try {
    const res = await fetch(`https://api.openai.com/v1/realtime/calls/${callId}/accept`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(process.env.OPENAI_PROJECT_ID
          ? { "OpenAI-Project": process.env.OPENAI_PROJECT_ID }
          : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[openai:session] accept failed", res.status, text);
      return { ok: false, status: res.status, error: text };
    }
    return { ok: true };
  } catch (err) {
    console.error("[openai:session] accept network error", err);
    return { ok: false, error: String(err) };
  }
}

function normalizeSipHeaders(
  raw: NonNullable<IncomingPayload["data"]>["sip_headers"],
): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const h of raw) {
      if (h?.name && typeof h.value === "string") out[h.name] = h.value;
    }
    return out;
  }
  return raw;
}

export const Route = createFileRoute("/api/public/openai/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const verify = verifyOpenAIWebhook({
          id: request.headers.get("webhook-id"),
          timestamp: request.headers.get("webhook-timestamp"),
          signatureHeader: request.headers.get("webhook-signature"),
          rawBody,
          secret: process.env.OPENAI_WEBHOOK_SECRET,
        });
        if (!verify.ok) {
          console.warn("[openai:session] webhook signature reject:", verify.reason);
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: IncomingPayload;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        // type은 'realtime.call.incoming' 외에도 lifecycle 이벤트가 올 수 있다 — 1단계는 incoming만 처리
        if (payload.type !== "realtime.call.incoming") {
          return Response.json({ ok: true, ignored: payload.type ?? "unknown" });
        }

        const callId = payload.data?.call_id;
        const sipHeaders = normalizeSipHeaders(payload.data?.sip_headers);

        if (!callId) {
          console.warn("[openai:session] missing call_id");
          return new Response("missing call_id", { status: 400 });
        }

        // SIP 헤더 전체 로깅 (파일럿 검증용 — 헤더 보존 여부 확인)
        console.log("[openai:session] sip_headers", JSON.stringify(sipHeaders));

        const mapped = await mapIncomingSipToSession(sipHeaders);
        if (!mapped) {
          console.error("[openai:session] session mapping failed", { callId, sipHeaders });
          return Response.json({ ok: false, error: "mapping_failed" }, { status: 200 });
        }

        // call_sessions 업데이트
        const upd = await supabaseAdmin
          .from("call_sessions")
          .update({
            openai_session_id: callId,
            status: "in_progress",
            answered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", mapped.sessionId);
        if (upd.error) {
          console.error("[openai:session] call_sessions update failed", upd.error);
        }

        // recipient 이름 조회 (accept instructions용)
        let recipientName = "어르신";
        const rec = await supabaseAdmin
          .from("care_recipients")
          .select("display_name")
          .eq("id", mapped.careRecipientId)
          .maybeSingle();
        if (rec.data?.display_name) recipientName = rec.data.display_name;

        const accept = await callOpenAIAccept(callId, recipientName);
        if (accept.ok) {
          void startRealtimeSideband({ openaiCallId: callId, recipientName }).catch((e) => {
            console.error("[openai:session] sideband failed", e);
          });
        }
        return Response.json({
          ok: accept.ok,
          matched_by: mapped.matchedBy,
          session_id: mapped.sessionId,
        });
      },
    },
  },
});
