import { useEffect, useRef, useState } from "react";
import { Loader2, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { monsterByKey } from "@/lib/game/monsters";
import { cn } from "@/lib/utils";

type Props = {
  monsterKey: string;
  rarityLabel: string;
  tapCount: number;
  tapsRequired?: number;
  useOrb?: boolean;
  onTap: () => void;
  onClose: () => void;
  disabled?: boolean;
};

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "카메라 권한을 허용해 주세요. 설정 → Safari/Chrome → 카메라에서 이 사이트를 허용할 수 있어요.";
    }
    if (err.name === "NotFoundError") {
      return "카메라를 찾을 수 없어요. 다른 기기로 시도해 주세요.";
    }
    if (err.name === "NotReadableError") {
      return "카메라가 다른 앱에서 사용 중일 수 있어요. 앱을 닫고 다시 시도해 주세요.";
    }
  }
  return "카메라를 켤 수 없어요. HTTPS 연결과 권한을 확인해 주세요.";
}

export function MonsterCatchCamera({
  monsterKey,
  rarityLabel,
  tapCount,
  tapsRequired = 3,
  useOrb,
  onTap,
  onClose,
  disabled,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const { offset, needsPermission, requestPermission } = useDeviceOrientation(status === "ready");

  const def = monsterByKey(monsterKey);

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setErrorText("이 브라우저는 카메라를 지원하지 않아요.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorText(cameraErrorMessage(err));
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, []);

  const handleClose = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            status !== "ready" && "opacity-0",
          )}
          playsInline
          muted
          autoPlay
          aria-hidden
        />

        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">카메라 켜는 중…</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-900 px-6 text-center text-white">
            <p className="text-fluid-sm leading-relaxed">{errorText}</p>
            <Button variant="secondary" onClick={handleClose}>
              닫기
            </Button>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
            <div className="pointer-events-none absolute left-0 right-0 top-[12%] flex flex-col items-center px-4 text-center">
              <p className="text-sm font-medium text-white/90">{def?.name ?? "몬스터"}</p>
              <p className="text-xs text-white/70">
                {rarityLabel}
                {useOrb ? " · 포획구 사용" : ""}
              </p>
              <span
                className="mt-4 text-[5.5rem] leading-none drop-shadow-lg transition-transform duration-75"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                }}
                role="img"
                aria-hidden
              >
                {def?.emoji ?? "✨"}
              </span>
              <p className="mt-3 text-sm text-white/85">
                폰을 움직이며 맞춘 뒤 {tapsRequired}번 탭하세요
              </p>
            </div>
            {needsPermission && (
              <div className="absolute left-4 right-4 top-4 z-20">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => void requestPermission()}
                >
                  <Smartphone className="h-4 w-4" />
                  AR 움직임 허용 (기울기)
                </Button>
              </div>
            )}
            <button
              type="button"
              className="absolute inset-0 z-10"
              onClick={onTap}
              disabled={disabled}
              aria-label={`포획 탭 ${tapCount} / ${tapsRequired}`}
            />
            <div className="pointer-events-none absolute bottom-28 left-0 right-0 text-center">
              <span className="inline-block rounded-full bg-black/50 px-5 py-2 text-lg font-semibold text-white">
                {tapCount} / {tapsRequired}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-black/80 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-xs text-white/60">카메라 + 기울기 AR · 베타</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={handleClose}
          aria-label="포획 취소"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
