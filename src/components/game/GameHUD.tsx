/**
 * GameHUD — AR 화면 위에 떠 있는 게임패드형 컨트롤.
 *
 * 레이아웃:
 *  ┌───────────────────────────────────────────┐
 *  │  topLeft                       topRight    │
 *  │                                            │
 *  │           [centerHint]                     │
 *  │                                            │
 *  │  ┌──────────┐                              │
 *  │  │ PRIMARY  │                  ┌─┐         │
 *  │  │  ATTACK  │                  │○│         │
 *  │  └──────────┘                  │○│         │
 *  │                                │○│         │
 *  │                                └─┘         │
 *  └───────────────────────────────────────────┘
 *
 * 사용:
 *   <GameHUD primary={...} secondaries={[...]} topLeft={...} topRight={...} />
 *
 * 모든 props 는 optional. null/undefined 인 zone 은 안 그림.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PrimaryAction, PrimaryTone, SecondaryAction } from "@/lib/game/action-context";

interface GameHUDProps {
  primary?: PrimaryAction | null;
  secondaries?: SecondaryAction[];
  topLeft?: ReactNode;
  topRight?: ReactNode;
  centerHint?: ReactNode;
  /** 추가 자식 — primary 좌측 추가 슬롯 등에 필요할 때 */
  children?: ReactNode;
}

export function GameHUD({
  primary,
  secondaries = [],
  topLeft,
  topRight,
  centerHint,
  children,
}: GameHUDProps) {
  return (
    <>
      {/* 상단 — 상태/메뉴 영역 */}
      {(topLeft || topRight) && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto">{topLeft}</div>
          <div className="pointer-events-auto flex items-center gap-1">{topRight}</div>
        </div>
      )}

      {/* 중앙 힌트 */}
      {centerHint && (
        <div className="pointer-events-none absolute left-0 right-0 top-1/3 z-10 flex justify-center px-4">
          <div className="rounded-full bg-black/50 px-4 py-1.5 text-center text-sm font-medium text-white shadow-lg backdrop-blur-sm">
            {centerHint}
          </div>
        </div>
      )}

      {/* 하단 컨트롤 영역 */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="relative flex items-end justify-between gap-4">
          {/* 좌측 primary (큰 원형 스틱) */}
          <div className="pointer-events-auto">
            {primary ? (
              <PrimaryStick action={primary} />
            ) : (
              <div className="h-[88px] w-[88px]" /> /* 자리 유지 */
            )}
          </div>

          {/* 가운데 슬롯 (확장용) */}
          <div className="flex-1">{children}</div>

          {/* 우측 secondary stack (세로 작은 원형 버튼들) */}
          <div className="pointer-events-auto flex flex-col-reverse items-end gap-2">
            {secondaries.map((s) => (
              <SecondaryDot key={s.id} action={s} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Primary stick — 큰 원형 버튼 ─────────────────────────────────────

const TONE_BG: Record<PrimaryTone, string> = {
  primary: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white",
  amber: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950",
  rose: "bg-gradient-to-br from-rose-400 to-rose-600 text-white",
  blue: "bg-gradient-to-br from-sky-400 to-sky-600 text-white",
  neutral: "bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-900",
};

const TONE_RING: Record<PrimaryTone, string> = {
  primary: "ring-emerald-300/60",
  amber: "ring-amber-300/60",
  rose: "ring-rose-300/60",
  blue: "ring-sky-300/60",
  neutral: "ring-zinc-300/60",
};

function PrimaryStick({ action }: { action: PrimaryAction }) {
  const tone = action.tone ?? "primary";
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (action.disabled) return;
    action.onPress?.();
  };
  const handlePointerUp = () => {
    if (action.disabled) return;
    action.onRelease?.();
  };

  return (
    <div className="relative">
      {/* 외곽 펄스 ring — 강조용 */}
      {action.pulse && !action.disabled && (
        <div
          className={cn(
            "absolute inset-0 -m-1 animate-ping rounded-full ring-4",
            TONE_RING[tone],
          )}
          aria-hidden
        />
      )}
      {/* 진행도 ring (capturing 등) */}
      {action.progress != null && (
        <svg
          className="absolute inset-0 -m-1 rotate-[-90deg]"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <circle
            cx={50}
            cy={50}
            r={46}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={4}
            fill="none"
            strokeDasharray={`${Math.min(1, action.progress) * 289} 289`}
            strokeLinecap="round"
          />
        </svg>
      )}
      <button
        type="button"
        disabled={action.disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={action.onRelease ? handlePointerUp : undefined}
        className={cn(
          "relative flex h-[88px] w-[88px] flex-col items-center justify-center gap-0.5 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.45)] outline-none transition-transform active:scale-95",
          TONE_BG[tone],
          action.disabled && "grayscale opacity-60 cursor-not-allowed active:scale-100",
          action.holdable && !action.disabled && "ring-2 ring-white/40",
        )}
        aria-label={action.label}
      >
        <span className="text-[22px] leading-none">{action.icon}</span>
        <span className="text-[13px] font-bold leading-tight">{action.label}</span>
        {action.sublabel && (
          <span className="text-[9px] font-medium opacity-85 leading-none">
            {action.sublabel}
          </span>
        )}
      </button>
    </div>
  );
}

// ── Secondary dot — 우측 작은 원형 ───────────────────────────────────

function SecondaryDot({ action }: { action: SecondaryAction }) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={action.onPress}
      className={cn(
        "relative flex h-[56px] w-[56px] flex-col items-center justify-center gap-0.5 rounded-full bg-black/55 text-white shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur-sm outline-none transition-transform active:scale-95",
        action.active && "ring-2 ring-white/80 bg-black/75",
        action.disabled && "opacity-50",
      )}
      aria-label={action.label}
    >
      <span className="text-[18px] leading-none">{action.icon}</span>
      <span className="text-[9px] font-medium leading-none opacity-90">{action.label}</span>
      {action.badge != null && (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white shadow">
          {action.badge}
        </span>
      )}
    </button>
  );
}
