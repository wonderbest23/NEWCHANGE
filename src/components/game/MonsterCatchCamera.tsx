import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Smartphone, X, Crosshair, Hand, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { monsterByKey, type MonsterRarity } from "@/lib/game/monsters";
import { cn } from "@/lib/utils";

// Three.js bundle 무거우므로 capture 화면 열렸을 때만 로드.
const MonsterArScene = lazy(() =>
  import("@/components/game/MonsterArScene").then((m) => ({ default: m.MonsterArScene })),
);

export type CaptureMode = "aim" | "tap" | "rhythm";

type Props = {
  monsterKey: string;
  rarity: MonsterRarity;
  rarityLabel: string;
  hits: number;
  hitsRequired?: number;
  useOrb?: boolean;
  onHit: () => void;
  onMiss?: () => void;
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

function pickInitialMode(rarity: MonsterRarity): CaptureMode {
  // common: 조준(aim) 기본 / rare: 조준 + 더 작은 hitbox / legendary: 리듬게임
  if (rarity === "legendary") return "rhythm";
  return "aim";
}

const RHYTHM_INTERVAL_MS = 850; // 비트 간격
const RHYTHM_WINDOW_MS = 220; // 명중 허용 윈도우

export function MonsterCatchCamera({
  monsterKey,
  rarity,
  rarityLabel,
  hits,
  hitsRequired = 3,
  useOrb,
  onHit,
  onMiss,
  onClose,
  disabled,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [mode, setMode] = useState<CaptureMode>(() => pickInitialMode(rarity));
  const { offset, needsPermission, requestPermission } = useDeviceOrientation(status === "ready");

  const def = monsterByKey(monsterKey);

  // ── 카메라 lifecycle ─────────────────────────────────────────
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

  // ── Rhythm 모드 비트 펄스 ─────────────────────────────────────
  const [beatPulse, setBeatPulse] = useState(0);
  const beatRef = useRef<{ lastBeatAt: number; nextBeatAt: number }>({
    lastBeatAt: 0,
    nextBeatAt: 0,
  });

  useEffect(() => {
    if (mode !== "rhythm" || status !== "ready") return;
    const start = performance.now();
    beatRef.current.lastBeatAt = start;
    beatRef.current.nextBeatAt = start + RHYTHM_INTERVAL_MS;

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      if (now >= beatRef.current.nextBeatAt) {
        beatRef.current.lastBeatAt = now;
        beatRef.current.nextBeatAt = now + RHYTHM_INTERVAL_MS;
        setBeatPulse((n) => n + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, status]);

  const handleArAim = (hit: boolean) => {
    if (disabled) return;
    if (mode === "aim") {
      if (hit) onHit();
      else onMiss?.();
    } else if (mode === "tap") {
      // tap 모드에서는 화면 어디든 명중. 3D는 hover/시각 효과만.
      onHit();
    } else if (mode === "rhythm") {
      // beat ± WINDOW 안에서 탭했고 + 몬스터 mesh에 명중했으면 hit.
      const now = performance.now();
      const closestBeat = Math.abs(now - beatRef.current.lastBeatAt) <
        Math.abs(now - beatRef.current.nextBeatAt)
        ? beatRef.current.lastBeatAt
        : beatRef.current.nextBeatAt;
      const inWindow = Math.abs(now - closestBeat) <= RHYTHM_WINDOW_MS;
      if (inWindow && hit) onHit();
      else onMiss?.();
    }
  };

  const overlayHint = useMemo(() => {
    if (mode === "aim") return "몬스터를 조준해 정확히 탭하세요";
    if (mode === "tap") return "화면을 빠르게 탭해 잡으세요";
    return "비트에 맞춰 몬스터를 탭! (★ 전설 전용)";
  }, [mode]);

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
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/65" />

            {/* 3D AR 씬 — 카메라 위에 합성 */}
            <Suspense fallback={null}>
              <MonsterArScene
                monsterKey={monsterKey}
                rarity={rarity}
                hits={hits}
                hitsRequired={hitsRequired}
                orientation={offset}
                onAim={handleArAim}
                monsterName={def?.name}
              />
            </Suspense>

            {/* 상단 라벨 */}
            <div className="pointer-events-none absolute left-0 right-0 top-[8%] flex flex-col items-center px-4 text-center">
              <p className="text-sm font-medium text-white/90">{def?.name ?? "몬스터"}</p>
              <p className="text-xs text-white/70">
                {rarityLabel}
                {useOrb ? " · 포획구 사용" : ""}
              </p>
            </div>

            {/* 가운데 십자선 — aim 모드에서만 */}
            {mode === "aim" && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 rounded-full border-2 border-white/60" />
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/40" />
                  <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/40" />
                </div>
              </div>
            )}

            {/* Rhythm 비트 표시 */}
            {mode === "rhythm" && (
              <div className="pointer-events-none absolute bottom-[40%] left-1/2 -translate-x-1/2">
                <div
                  key={beatPulse}
                  className="h-3 w-24 origin-center animate-ping rounded-full bg-amber-300/80"
                />
                <p className="mt-2 text-center text-xs text-white/85">박자에 맞춰 탭!</p>
              </div>
            )}

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

            {/* hit 카운터 */}
            <div className="pointer-events-none absolute bottom-32 left-0 right-0 text-center">
              <span className="inline-block rounded-full bg-black/55 px-5 py-2 text-lg font-semibold text-white">
                {hits} / {hitsRequired}
              </span>
              <p className="mt-2 text-xs text-white/75">{overlayHint}</p>
            </div>
          </>
        )}
      </div>

      {/* 하단 모드 선택 + 닫기 */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-black/85 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
          <ModeChip
            active={mode === "aim"}
            disabled={disabled}
            icon={<Crosshair className="h-3.5 w-3.5" />}
            label="조준"
            onClick={() => setMode("aim")}
          />
          <ModeChip
            active={mode === "tap"}
            disabled={disabled}
            icon={<Hand className="h-3.5 w-3.5" />}
            label="연타"
            onClick={() => setMode("tap")}
          />
          <ModeChip
            active={mode === "rhythm"}
            disabled={disabled || rarity !== "legendary"}
            icon={<Music className="h-3.5 w-3.5" />}
            label={rarity === "legendary" ? "리듬" : "리듬(전설만)"}
            onClick={() => rarity === "legendary" && setMode("rhythm")}
          />
        </div>
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

function ModeChip({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/20 bg-white/5 text-white/85 hover:bg-white/10",
        disabled && "opacity-40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
