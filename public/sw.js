/**
 * Service Worker — 오프라인 셸 + 정적 자산 캐싱 + Web Push 수신.
 *
 * 전략:
 *  - precache: 앱 셸(루트 + manifest + 로고)
 *  - runtime: same-origin GET 요청 stale-while-revalidate
 *  - API(POST/PUT/DELETE)와 외부 요청은 캐싱하지 않고 통과
 *  - push 이벤트: 알림 표시, notificationclick: 앱 포커스/이동
 *
 * SW 자체 캐시 이름에 버전을 박아 배포마다 옛 캐시 제거.
 */

const CACHE_VERSION = "v2";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// "/" 는 항상 /home 으로 307 리다이렉트되는 경로다. cache.addAll 이 리다이렉트를
// 따라가 "redirected" 응답을 저장하면, 이후 navigation 요청에 그 응답을 돌려줄 때
// 브라우저가 보안상 거부하여 net::ERR_FAILED(-2) 가 발생한다. 따라서 셸에 넣지 않는다.
const SHELL_ASSETS = ["/manifest.webmanifest", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API / server functions — 항상 네트워크. SW가 stale auth state를 캐싱하면 위험.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn/") ||
    url.pathname.startsWith("/__tanstack-")
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((response) => {
          // 200 + 리다이렉트되지 않은 응답만 캐시. redirected 응답을 캐시하면
          // navigation 요청에 되돌려줄 때 net::ERR_FAILED(-2) 가 발생한다.
          if (
            response &&
            response.status === 200 &&
            response.type === "basic" &&
            !response.redirected
          ) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => cached);
      // 캐시된 응답이 redirected 면 navigation 에 쓸 수 없으므로 네트워크로 우회.
      if (cached && cached.redirected) return fetchPromise;
      // stale-while-revalidate: 캐시 있으면 즉답하고 백그라운드 갱신.
      return cached || fetchPromise;
    }),
  );
});

// Web Push 수신.
// 서버는 VAPID 키로 서명된 push 메시지를 보내고, payload 는 JSON 문자열.
self.addEventListener("push", (event) => {
  let payload = { title: "곁", body: "새 알림이 도착했어요" };
  try {
    if (event.data) {
      const text = event.data.text();
      const parsed = JSON.parse(text);
      payload = { ...payload, ...parsed };
    }
  } catch {
    // payload parse 실패해도 기본 메시지로 표시.
  }

  const options = {
    body: payload.body,
    icon: payload.icon || "/logo.png",
    badge: payload.badge || "/logo.png",
    data: payload.url ? { url: payload.url } : undefined,
    tag: payload.tag,
    renotify: !!payload.renotify,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
