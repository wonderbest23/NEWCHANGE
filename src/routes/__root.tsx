import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { MockAuthProvider } from "@/lib/auth/mock-auth";
import { supabase } from "@/integrations/supabase/client";
import { resumePendingCheckinSave } from "@/lib/checkin/background-save";
import { registerServiceWorker } from "@/lib/pwa/register";
import { PwaInstallPrompt } from "@/components/pwa/InstallPrompt";

import appCss from "../styles.css?url";

// 사용자에게 안전하게 노출할 수 있는 한국어 메시지로 변환.
// 원본 에러는 콘솔에 그대로 남겨 디버깅 가능.
function toSafeMessage(error: unknown): string {
  const raw = (error as { message?: string })?.message ?? "";
  if (!raw) return "일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
  if (/network|fetch|Failed to fetch|NetworkError/i.test(raw))
    return "네트워크 연결이 불안정해요. 잠시 후 다시 시도해주세요.";
  if (/401|403|JWT|auth|unauthor/i.test(raw))
    return "로그인이 필요하거나 세션이 만료됐어요. 다시 로그인해주세요.";
  if (/404|not.?found/i.test(raw))
    return "요청한 정보를 찾을 수 없어요.";
  if (/timeout/i.test(raw))
    return "응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.";
  // 기본 안내 — 원문 노출하지 않음
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
}

function logError(scope: "query" | "mutation", error: unknown, key?: unknown) {
  // 콘솔에 자세한 로그 (스택/키 포함) — 서버 로그 수집기에도 전달됨
  // eslint-disable-next-line no-console
  console.error(`[${scope}-error]`, { key, error });
}


function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const message = error?.message ?? "알 수 없는 오류가 발생했어요.";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold text-foreground">문제가 발생했어요</h1>
        <p className="mt-3 text-sm text-muted-foreground break-words">{message}</p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => {
              reset();
              router.invalidate();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            다시 시도
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "곁 — 가족이 함께하는 따뜻한 돌봄" },
      { name: "description", content: "보호자, 시니어, 돌봄 파트너가 한 곳에서 안부와 일상을 나누는 가족 돌봄 서비스." },
      { name: "author", content: "곁" },
      { property: "og:title", content: "곁 — 가족이 함께하는 따뜻한 돌봄" },
      { property: "og:description", content: "보호자, 시니어, 돌봄 파트너가 한 곳에서 안부와 일상을 나누는 가족 돌봄 서비스." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "곁 — 가족이 함께하는 따뜻한 돌봄" },
      { name: "twitter:description", content: "보호자, 시니어, 돌봄 파트너가 한 곳에서 안부와 일상을 나누는 가족 돌봄 서비스." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c94c5f85-151c-442c-adb3-c6e9153e6aea/id-preview-d924a9e6--9ba8150a-7373-4385-86ff-9c69e7e2800b.lovable.app-1777529461882.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c94c5f85-151c-442c-adb3-c6e9153e6aea/id-preview-d924a9e6--9ba8150a-7373-4385-86ff-9c69e7e2800b.lovable.app-1777529461882.png" },
      { name: "theme-color", content: "#22c55e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "곁" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/logo.png" },
      { rel: "icon", type: "image/png", href: "/logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // 요청별 새 QueryClient (SSR-safe). 전역 캐시/리패치 정책을 한곳에서 관리한다.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: 1,
            // 탭 전환/포커스만으로 모든 쿼리가 재실행되어 체감 렉이 발생하므로 비활성화.
            // 정말 즉시성이 필요한 쿼리는 라우트별로 옵션을 켤 수 있다.
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
          mutations: { retry: 0 },
        },
        // 전역 query 에러 핸들링: 콘솔 로그 + 안전한 토스트
        queryCache: new QueryCache({
          onError: (error, query) => {
            logError("query", error, query.queryKey);
            // meta.silent: true 이면 토스트를 띄우지 않음 (라우트별 자체 처리)
            if ((query.meta as { silent?: boolean } | undefined)?.silent) return;
            toast.error(toSafeMessage(error));
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            logError("mutation", error, mutation.options.mutationKey);
            if ((mutation.meta as { silent?: boolean } | undefined)?.silent) return;
            toast.error(toSafeMessage(error));
          },
        }),
      }),
  );

  // 로그아웃 시에만 캐시 초기화.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  // 페이지 이동/새로고침으로 중단된 안부 통화 저장을 자동 재개.
  useEffect(() => {
    resumePendingCheckinSave();
  }, []);

  // PWA Service Worker 등록. 첫 방문에는 install, 이후엔 기존 등록 재사용.
  // 실패는 silent (dev 환경/지원하지 않는 브라우저는 그냥 무시).
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <MockAuthProvider>
        <Outlet />
        <PwaInstallPrompt />
        <Toaster position="top-center" />
      </MockAuthProvider>
    </QueryClientProvider>
  );
}
