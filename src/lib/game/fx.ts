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
  // ── 낚시 전용 ─────────────────────────────────────────────
  /** 입질 — 짧고 깊은 두 톤 + 가벼운 burst 진동 */
  fishingBite() {
    beep({ freq: 320, endFreq: 220, durationMs: 110, type: "sine", gain: 0.13 });
    setTimeout(
      () =>
        beep({ freq: 420, endFreq: 320, durationMs: 90, type: "triangle", gain: 0.12 }),
      120,
    );
    vibrate([30, 20, 60]);
  },
  /** 잡힘 — 환호 톤 + 길게 두근 진동 */
  fishingCatch() {
    beep({ freq: 700, endFreq: 1200, durationMs: 220, type: "triangle", gain: 0.18 });
    setTimeout(
      () =>
        beep({
          freq: 1400,
          endFreq: 1700,
          durationMs: 280,
          type: "triangle",
          gain: 0.16,
        }),
      130,
    );
    vibrate([50, 30, 80]);
  },
  /** 놓침 — 낮고 무딘 톤 + 한 번 진동 */
  fishingEscape() {
    beep({ freq: 220, endFreq: 110, durationMs: 220, type: "sine", gain: 0.1 });
    vibrate(40);
  },
  /** 캐스트 릴리즈 — 바람 소리형 스윕 (power 0..1) */
  fishingCastRelease(power = 0.5) {
    const p = Math.max(0, Math.min(1, power));
    beep({
      freq: 140 + p * 80,
      endFreq: 55 + p * 30,
      durationMs: 120 + p * 100,
      type: "sine",
      gain: 0.07 + p * 0.09,
    });
    setTimeout(
      () =>
        beep({
          freq: 320 + p * 200,
          endFreq: 180,
          durationMs: 90,
          type: "triangle",
          gain: 0.06,
        }),
      70,
    );
    vibrate([12, 8, 18 + Math.round(p * 22)]);
  },
  captureBallThrow(power = 0.5) {
    const p = Math.max(0, Math.min(1, power));
    beep({
      freq: 180 + p * 120,
      endFreq: 420 + p * 200,
      durationMs: 100 + p * 80,
      type: "triangle",
      gain: 0.1,
    });
    vibrate(18);
  },
  captureBallHit() {
    beep({ freq: 640, endFreq: 920, durationMs: 120, type: "square", gain: 0.14 });
    vibrate(45);
  },
  captureBallMiss() {
    beep({ freq: 160, endFreq: 90, durationMs: 140, type: "sine", gain: 0.07 });
  },
  captureWiggle() {
    beep({ freq: 380, endFreq: 280, durationMs: 80, type: "sawtooth", gain: 0.09 });
    vibrate([25, 15, 25]);
  },
  captureFlee() {
    beep({ freq: 240, endFreq: 100, durationMs: 280, type: "sine", gain: 0.1 });
    vibrate([30, 50, 30]);
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
