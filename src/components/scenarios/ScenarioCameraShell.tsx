/**
 * ScenarioCameraShell — 카메라 + 옵션 children + 종료 버튼.
 *
 * edu/game 시나리오 어디서나 같은 카메라 lifecycle 을 쓰도록 추출.
 * children 으로 시나리오별 UI/3D 합성을 받음.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  onCameraReady?: (video: HTMLVideoElement) => void;
  onExit?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  /** 풀스크린 오버레이 children */
  children?: ReactNode;
}

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError")
      return "카메라 권한을 허용해 주세요. 브라우저 설정에서 변경할 수 있어요.";
    if (err.name === "NotFoundError") return "카메라를 찾을 수 없어요.";
    if (err.name === "NotReadableError")
      return "카메라가 다른 앱에서 사용 중일 수 있어요.";
  }
  return "카메라를 켤 수 없어요. HTTPS 연결과 권한을 확인해 주세요.";
}

export function ScenarioCameraShell({ onCameraReady, onExit, videoRef, children }: Props) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const ref = (videoRef ?? internalRef) as React.RefObject<HTMLVideoElement>;
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (ref.current) ref.current.srcObject = null;
    };
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setErr("이 브라우저는 카메라를 지원하지 않아요.");
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
        const v = ref.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => null);
          onCameraReady?.(v);
        }
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setErr(cameraErrorMessage(e));
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40 bg-black">
      <video
        ref={ref}
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
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-zinc-900 px-6 text-center text-white">
          <p className="text-sm leading-relaxed">{err}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              다시 시도
            </Button>
            {onExit && (
              <Button variant="outline" onClick={onExit}>
                나가기
              </Button>
            )}
          </div>
        </div>
      )}
      {status === "ready" && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
          {children}
        </>
      )}
    </div>
  );
}
