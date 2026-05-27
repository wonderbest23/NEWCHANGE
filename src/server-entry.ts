/**
 * Cloudflare Worker entry — TanStack Start 기본 handler 를 감싸 매 요청마다
 * Cloudflare ExecutionContext 의 `waitUntil` 을 keep-alive 헬퍼에 등록한다.
 *
 * 이 wiring 이 있어야 `keepAlive(promise)` 가 호출된 비동기 작업이
 * fetch 응답 반환 후에도 끊기지 않고 끝까지 실행된다 (sideband WebSocket,
 * 지연된 hangup, ops alert SMS enqueue 등).
 *
 * wrangler.jsonc 의 `main` 이 이 파일을 가리키도록 설정한다.
 */

import defaultEntry from "@tanstack/react-start/server-entry";
import { registerWaitUntil } from "@/server/runtime/keep-alive.server";

type WorkerCtx = { waitUntil?: (p: Promise<unknown>) => void };

// TanStack 의 RequestHandler 시그니처는 (request, opts?) 만 타입화되어 있지만,
// Cloudflare 런타임은 실제로 (request, env, ctx) 를 전달한다. fetch 를 통째로
// 다른 시그니처로 호출하기 위해 unknown[]-spread cast 를 쓴다.
const innerFetch = defaultEntry.fetch as unknown as (...args: unknown[]) => Promise<Response>;

export default {
  async fetch(request: Request, env: unknown, ctx: WorkerCtx): Promise<Response> {
    // Register before delegating so any handler — including streaming routes —
    // can call keepAlive() and have it routed to the real waitUntil.
    registerWaitUntil(ctx?.waitUntil?.bind(ctx));
    try {
      return await innerFetch(request, env, ctx);
    } finally {
      // Clear so a stale ctx from a finished request can't leak into the next one.
      registerWaitUntil(null);
    }
  },

  // Cloudflare Cron Triggers — wrangler.jsonc 의 `triggers.crons` 에 등록된
  // 스케줄에서 호출된다. internal cron secret 으로 self-call 한다.
  async scheduled(event: { cron: string }, env: Record<string, string | undefined>, ctx: WorkerCtx): Promise<void> {
    registerWaitUntil(ctx?.waitUntil?.bind(ctx));
    try {
      const baseUrl = env.PUBLIC_BASE_URL;
      const secret = env.INTERNAL_CRON_SECRET;
      if (!baseUrl || !secret) {
        console.error("[scheduled] PUBLIC_BASE_URL or INTERNAL_CRON_SECRET missing — skip", {
          cron: event.cron,
        });
        return;
      }

      // 스케줄별 라우팅. 같은 endpoint 를 여러 cron 으로 분리하면 비용/지연 분리가 쉽다.
      // 현재는 두 가지 cron 만 사용한다.
      const ROUTES_BY_CRON: Record<string, string[]> = {
        // 매 1분: 발신 due job 처리 (안부전화 핵심 루프)
        "* * * * *": ["/api/internal/call-jobs/run", "/api/internal/notifications/dispatch"],
        // 매 5분: rule engine 재평가 + 누락 fallback 점검
        "*/5 * * * *": ["/api/internal/rules/run"],
      };

      const routes = ROUTES_BY_CRON[event.cron] ?? [];
      if (routes.length === 0) {
        console.warn("[scheduled] no routes mapped for cron", event.cron);
        return;
      }

      await Promise.allSettled(
        routes.map(async (path) => {
          const url = `${baseUrl.replace(/\/$/, "")}${path}`;
          try {
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "x-internal-secret": secret,
                "content-type": "application/json",
              },
              body: "{}",
            });
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              console.error("[scheduled] non-2xx", { url, status: res.status, body: text.slice(0, 500) });
            } else {
              console.log("[scheduled] ok", { url, status: res.status });
            }
          } catch (err) {
            console.error("[scheduled] fetch failed", { url, err });
          }
        }),
      );
    } finally {
      registerWaitUntil(null);
    }
  },
};
