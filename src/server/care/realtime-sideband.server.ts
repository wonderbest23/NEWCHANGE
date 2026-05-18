import { handleRealtimeToolCall, type RealtimeToolName } from "@/server/care/realtime-tools.server";
import { openingPrompt } from "@/server/care/state-machine";
import type { ToolResponse } from "@/server/care/types";

interface PendingToolCall {
  name?: string;
  callId?: string;
  argumentsText?: string;
}

interface SidebandOptions {
  openaiCallId: string;
  recipientName: string;
}

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return apiKey;
}

function wsUrl(openaiCallId: string): string {
  return `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(openaiCallId)}`;
}

function parseArgs(argumentsText?: string): Record<string, unknown> {
  if (!argumentsText) return {};
  try {
    const parsed = JSON.parse(argumentsText);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isKnownToolName(name?: string): name is RealtimeToolName {
  return (
    name === "record_answer" ||
    name === "mark_unclear" ||
    name === "escalate_high_risk" ||
    name === "end_call"
  );
}

function responseInstruction(result: ToolResponse): string {
  if (result.prompt) {
    return `다음 문장만 한국어 음성으로 말하세요. 문장: "${result.prompt}"`;
  }
  if (result.end) {
    return "짧게 작별 인사를 하고 마지막 문장에 반드시 '통화를 마치겠습니다'라고 말하세요.";
  }
  return "어르신께 짧게 공감한 뒤 다음 질문을 한 가지만 이어서 여쭤보세요.";
}

function sendJson(ws: WebSocket, value: unknown) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(value));
}

async function openRealtimeWebSocket(openaiCallId: string, apiKey: string): Promise<WebSocket> {
  const url = wsUrl(openaiCallId);

  // Cloudflare Workers supports outbound WebSockets through fetch + Upgrade.
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Upgrade: "websocket",
      },
    } as RequestInit);
    const upgraded = (res as Response & { webSocket?: WebSocket }).webSocket;
    if (upgraded) {
      (upgraded as WebSocket & { accept?: () => void }).accept?.();
      return upgraded;
    }
  } catch (e) {
    console.warn("[realtime:sideband] fetch websocket upgrade unavailable, falling back", e);
  }

  const WebSocketCtor = WebSocket as unknown as new (
    url: string,
    protocols?: string | string[],
    options?: { headers?: Record<string, string> },
  ) => WebSocket;
  return new WebSocketCtor(url, undefined, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

async function hangupSoon(openaiCallId: string) {
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const apiKey = getApiKey();
  await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(openaiCallId)}/hangup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch((e) => console.error("[realtime:sideband] hangup failed", e));
}

async function runToolAndRespond(
  ws: WebSocket,
  openaiCallId: string,
  toolCallId: string,
  toolName: RealtimeToolName,
  args: Record<string, unknown>,
) {
  let result: ToolResponse;
  try {
    result = await handleRealtimeToolCall({
      callId: openaiCallId,
      toolName,
      args,
    });
  } catch (e) {
    console.error("[realtime:sideband] tool failed", { toolName, e });
    result = {
      prompt: "죄송해요. 제가 잠시 잘 못 들었어요. 다시 한 번 말씀해 주시겠어요?",
    };
  }

  sendJson(ws, {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: toolCallId,
      output: JSON.stringify(result),
    },
  });
  sendJson(ws, {
    type: "response.create",
    response: {
      instructions: responseInstruction(result),
    },
  });

  if (result.end) void hangupSoon(openaiCallId);
}

function extractDoneToolCall(msg: any, pending: Map<string, PendingToolCall>): PendingToolCall | null {
  if (msg?.type === "response.output_item.added" && msg.item?.type === "function_call") {
    const key = msg.item.id ?? msg.item.call_id;
    if (key) {
      pending.set(key, {
        name: msg.item.name,
        callId: msg.item.call_id,
        argumentsText: msg.item.arguments,
      });
    }
    return null;
  }

  if (msg?.type === "response.function_call_arguments.delta") {
    const key = msg.item_id ?? msg.call_id;
    if (key) {
      const prev = pending.get(key) ?? {};
      pending.set(key, {
        ...prev,
        callId: prev.callId ?? msg.call_id,
        argumentsText: `${prev.argumentsText ?? ""}${msg.delta ?? ""}`,
      });
    }
    return null;
  }

  if (msg?.type === "response.function_call_arguments.done") {
    const key = msg.item_id ?? msg.call_id;
    const prev = key ? pending.get(key) ?? {} : {};
    return {
      ...prev,
      name: msg.name ?? prev.name,
      callId: msg.call_id ?? prev.callId,
      argumentsText: msg.arguments ?? prev.argumentsText,
    };
  }

  if (msg?.type === "response.output_item.done" && msg.item?.type === "function_call") {
    return {
      name: msg.item.name,
      callId: msg.item.call_id,
      argumentsText: msg.item.arguments,
    };
  }

  return null;
}

export async function startRealtimeSideband(opts: SidebandOptions): Promise<void> {
  const apiKey = getApiKey();
  const pending = new Map<string, PendingToolCall>();
  const ws = await openRealtimeWebSocket(opts.openaiCallId, apiKey);

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => {
      console.log("[realtime:sideband] connected", opts.openaiCallId);
      sendJson(ws, {
        type: "response.create",
        response: {
          instructions: openingPrompt(opts.recipientName),
        },
      });
    });

    ws.addEventListener("message", (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (msg.type === "error") {
        console.error("[realtime:sideband] error", msg.error ?? msg);
        return;
      }

      const call = extractDoneToolCall(msg, pending);
      if (!call) return;
      if (!isKnownToolName(call.name) || !call.callId) {
        console.warn("[realtime:sideband] unknown tool call", call);
        return;
      }

      void runToolAndRespond(
        ws,
        opts.openaiCallId,
        call.callId,
        call.name,
        parseArgs(call.argumentsText),
      );
    });

    ws.addEventListener("close", () => {
      console.log("[realtime:sideband] closed", opts.openaiCallId);
      resolve();
    });

    ws.addEventListener("error", (event) => {
      console.error("[realtime:sideband] websocket error", event);
      reject(new Error("sideband websocket error"));
    });

    if (ws.readyState === WebSocket.OPEN) {
      ws.dispatchEvent(new Event("open"));
    }
  });
}
