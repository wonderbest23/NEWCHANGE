import { describe, expect, it } from "vitest";
import {
  estimatePitchHz,
  inferProsodyEmotionHint,
  summarizeProsodySession,
  summarizeProsodyTurn,
} from "@/lib/checkin/voice-prosody";

describe("voice-prosody", () => {
  it("estimates pitch from synthetic sine buffer", () => {
    const sampleRate = 44100;
    const freq = 180;
    const buffer = new Float32Array(sampleRate / freq * 4);
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.3;
    }
    const hz = estimatePitchHz(buffer, sampleRate);
    expect(hz).not.toBeNull();
    expect(hz!).toBeGreaterThan(150);
    expect(hz!).toBeLessThan(220);
  });

  it("summarizes session and hints tired for low energy", () => {
    const turn = summarizeProsodyTurn({
      samples: Array.from({ length: 8 }, (_, i) => ({
        rms: 0.008,
        pitchHz: 120,
        ts: i * 200,
      })),
      transcript: "음...",
      startedAt: 0,
      endedAt: 1600,
    });
    expect(turn).not.toBeNull();
    const session = summarizeProsodySession([turn!]);
    expect(session?.prosodyEmotionHint).toBe("tired");
  });

  it("hints anxious for high jitter-like pitch movement", () => {
    const hint = inferProsodyEmotionHint({
      rmsMean: 0.04,
      lowEnergyRatio: 0.3,
      pitchHzMean: 210,
      pitchVariability: 40,
      jitterLike: 35,
      speechRateCharsPerSec: 3.5,
    });
    expect(hint).toBe("anxious");
  });
});
