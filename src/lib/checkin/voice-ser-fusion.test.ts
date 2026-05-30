import { describe, expect, it } from "vitest";
import { fuseEmotionSignals } from "./voice-ser-fusion";
import { mapEmotion2VecLabel, mapKesdyLabel } from "./voice-ser-mapping";

describe("voice-ser-mapping", () => {
  it("maps emotion2vec happy → joyful", () => {
    expect(mapEmotion2VecLabel("happy")).toBe("joyful");
  });

  it("maps KESDy angry → alert", () => {
    expect(mapKesdyLabel("angry")).toBe("alert");
  });
});

describe("voice-ser-fusion", () => {
  it("urgent condition keeps text emotion", () => {
    const r = fuseEmotionSignals({
      conditionLevel: "urgent",
      moodStatus: "좋음",
      serAppEmotionKey: "joyful",
      serConfidence: 0.9,
    });
    expect(r.source).toBe("text");
    expect(r.emotionKey).toBe("alert");
  });

  it("high-confidence SER overrides calm text when acoustic sad", () => {
    const r = fuseEmotionSignals({
      conditionLevel: "normal",
      moodStatus: "괜찮아요",
      serAppEmotionKey: "sad",
      serConfidence: 0.62,
    });
    expect(r.emotionKey).toBe("sad");
    expect(r.source).toBe("ser");
  });

  it("multimodal when SER and prosody agree", () => {
    const r = fuseEmotionSignals({
      conditionLevel: "normal",
      moodStatus: "보통",
      serAppEmotionKey: "tired",
      serConfidence: 0.48,
      browserProsodyHint: "tired",
    });
    expect(r.emotionKey).toBe("tired");
    expect(r.source).toBe("multimodal");
  });
});
