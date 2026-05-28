/**
 * 가벼운 효과음 / 진동 헬퍼.
 *
 * - 외부 사운드 파일 없이 WebAudio Oscillator 로 짧은 비프 톤 생성.
 *   브라우저별 audio policy 때문에 사용자 제스처 안에서 한 번은 호출되어야 함.
 * - navigator.vibrate 는 iOS 미지원, Android Chrome 만 작동.
 * - 모듈 레벨 AudioContext 를 lazy 로 만들어 재사용.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Cls =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Cls) return null;
  try {
    ctx = new Cls();
    return ctx;
  } catch {
    return null;
  }
}

interface BeepOpts {
  freq?: number;
  durationMs?: number;
  type?: OscillatorType;
  gain?: number;
  /** 끝부분 freq slide (사이렌, 폭발용) */
  endFreq?: number;
}

function beep(opts: BeepOpts) {
  const c = getCtx();
  if (!c) return;
  // suspend 상태이면 사용자 제스처에서 재개.
  if (c.state === "suspended") c.resume().catch(() => null);

  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "triangle";
  const startF = opts.freq ?? 600;
  osc.frequency.setValueAtTime(startF, c.currentTime);
  if (opts.endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, opts.endFreq),
      c.currentTime + (opts.durationMs ?? 120) / 1000,
    );
  }
  const peak = opts.gain ?? 0.15;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(peak, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (opts.durationMs ?? 120) / 1000);

  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + (opts.durationMs ?? 120) / 1000 + 0.02);
}

export const fx = {
  /** 명중 — 짧고 밝은 톤 */
  hit() {
    beep({ freq: 880, endFreq: 660, durationMs: 90, type: "square", gain: 0.12 });
    vibrate(35);
  },
  /** 결정타 — 두 톤 빠른 콤보 + 진동 */
  finish() {
    beep({ freq: 1100, endFreq: 600, durationMs: 200, type: "sawtooth", gain: 0.18 });
    setTimeout(
      () => beep({ freq: 1500, endFreq: 1200, durationMs: 220, type: "triangle", gain: 0.16 }),
      80,
    );
    vibrate([40, 40, 80]);
  },
  /** 빗나감 — 낮고 무딘 톤 */
  miss() {
    beep({ freq: 200, endFreq: 120, durationMs: 110, type: "sine", gain: 0.08 });
  },
  /** 캡처 시퀀스 시작 */
  capture() {
    beep({ freq: 500, endFreq: 1400, durationMs: 350, type: "triangle", gain: 0.18 });
    vibrate([20, 40, 20, 40, 20]);
  },
};

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    // 사용자가 진동 거부했거나 미지원 — 무시
  }
}
