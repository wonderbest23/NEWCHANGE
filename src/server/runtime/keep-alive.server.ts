/**
 * Cross-runtime "keep this Promise alive past the response" helper.
 *
 * Cloudflare Workers cancels any pending Promise after the request handler
 * returns unless `ctx.waitUntil(promise)` is called. TanStack Start does not
 * expose ctx.waitUntil through its server handler signature, so we use a
 * combination of hooks:
 *
 *   1) `registerWaitUntil(fn)` — call from a framework hook that has access to
 *      the Cloudflare ExecutionContext to register the real waitUntil for the
 *      duration of one request.
 *   2) `keepAlive(promise)` — call from any deep code path; routes the promise
 *      to the registered waitUntil if present, otherwise falls back to a
 *      module-level pinning Set (so at least the JS GC won't drop the promise).
 *
 * If your runtime is plain Node (e.g. local dev or non-CF deploy), waitUntil
 * is a no-op alias for "run in background and never await".
 */

type WaitUntil = (promise: Promise<unknown>) => void;

const PINNED = new Set<Promise<unknown>>();
let registered: WaitUntil | null = null;

export function registerWaitUntil(fn: WaitUntil | null | undefined): void {
  registered = typeof fn === "function" ? fn : null;
}

export function keepAlive(promise: Promise<unknown>): void {
  // Prevent unhandled rejections regardless of runtime.
  const safe = promise.catch((err) => {
    console.error("[keep-alive] background task failed", err);
  });

  if (registered) {
    try {
      registered(safe);
      return;
    } catch (err) {
      console.warn("[keep-alive] waitUntil threw, falling back to pin", err);
    }
  }

  PINNED.add(safe);
  safe.finally(() => PINNED.delete(safe));
}

/** Test helper — number of pinned promises (waitUntil unavailable path). */
export function _pinnedCount(): number {
  return PINNED.size;
}
