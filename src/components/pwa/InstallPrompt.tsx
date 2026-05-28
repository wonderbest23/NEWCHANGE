import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_TTL_DAYS = 14;

function recentlyDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const ageDays = (Date.now() - Number(ts)) / 86400000;
  return ageDays < DISMISS_TTL_DAYS;
}

/**
 * 홈화면 설치 권유 카드.
 * - Chrome/Edge: beforeinstallprompt 이벤트 캡처 → 사용자 클릭 시 native prompt.
 * - iOS Safari: 이벤트가 없으므로 안내 텍스트만 노출.
 * - 14일 내 닫은 적이 있으면 다시 보여주지 않는다.
 */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone;
    if (standalone) return; // 이미 설치/실행 중

    if (recentlyDismissed()) return;

    const ua = window.navigator.userAgent || "";
    const iosLike = /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

    if (iosLike) {
      setIsIos(true);
      setHidden(false);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // localStorage 차단된 모드는 무시
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setDeferred(null);
    setHidden(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4">
      <Card className="mx-auto flex max-w-md items-center gap-3 border-primary/40 bg-card p-3 shadow-lg">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Download className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">홈 화면에 추가</p>
          {isIos ? (
            <p className="text-xs text-foreground/65">
              Safari 공유 버튼 → "홈 화면에 추가"를 눌러주세요.
            </p>
          ) : (
            <p className="text-xs text-foreground/65">앱처럼 빠르게 실행하고 알림도 받을 수 있어요.</p>
          )}
        </div>
        {!isIos && deferred && (
          <Button size="sm" onClick={install}>
            설치
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={dismiss} aria-label="닫기">
          <X className="h-4 w-4" />
        </Button>
      </Card>
    </div>
  );
}
