/**
 * Service Worker 등록 + Web Push 구독 헬퍼.
 *
 * - registerServiceWorker(): 마운트 시 1회 호출. 이미 등록되어 있으면 skip.
 * - subscribePush({vapidPublicKey}): 사용자 알림 권한이 grant 된 상태에서 호출.
 *     PushSubscription 객체를 백엔드에 등록할 수 있도록 반환.
 *
 * SSR 안전: 모든 window/navigator 접근을 typeof guard.
 */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.warn("[pwa] service worker registration failed", err);
    return null;
  }
}

export async function unregisterServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

export interface PushSubscribeResult {
  ok: boolean;
  subscription?: PushSubscription;
  reason?: "no_window" | "unsupported" | "permission_denied" | "no_vapid" | "failed";
}

export async function subscribePush(opts: {
  vapidPublicKey?: string;
}): Promise<PushSubscribeResult> {
  if (typeof window === "undefined") return { ok: false, reason: "no_window" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }

  // Notification permission 먼저 확인 — 사용자 제스처가 있을 때만 호출되어야 함.
  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "permission_denied" };
  } else if (Notification.permission !== "granted") {
    return { ok: false, reason: "permission_denied" };
  }

  if (!opts.vapidPublicKey) return { ok: false, reason: "no_vapid" };

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: "failed" };

  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { ok: true, subscription: existing };

    // pushManager.subscribe 의 applicationServerKey 타입은 BufferSource.
    // Uint8Array 의 underlying buffer 를 ArrayBuffer 로 캐스팅해 전달.
    const keyBytes = urlBase64ToUint8Array(opts.vapidPublicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer as ArrayBuffer,
    });
    return { ok: true, subscription };
  } catch (err) {
    console.warn("[pwa] push subscribe failed", err);
    return { ok: false, reason: "failed" };
  }
}

export async function unsubscribePush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  return await sub.unsubscribe();
}
