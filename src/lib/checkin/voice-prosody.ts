/**
 * 안부 통화 사용자 발화 구간의 음성 prosody(파형) 요약.
 * 논문·음성 감정 연구에서 흔히 쓰는 저수준 특징(에너지, 발화 속도, pitch, jitter)을
 * 브라우저 AnalyserNode 샘플로 근사한다.
 *
 * 참고: Schuller et al. — speech emotion recognition의 pitch/energy/tempo 특징;
 *       저에너지·단조로운 pitch → sadness/fatigue, 고각성·빠른 tempo → anger/fear.
 */

export type ProsodySample = {
  rms: number;
  pitchHz: number | null;
  ts: number;
};

export type VoiceProsodyTurn = {
  durationMs: number;
  rmsMean: number;
  rmsStd: number;
  rmsMax: number;
  lowEnergyRatio: number;
  pitchHzMean: number | null;
  pitchVariability: number | null;
  jitterLike: number | null;
  speechRateCharsPerSec: number;
  activeSpeechMs: number;
};

export type VoiceProsodySessionSummary = {
  turnCount: number;
  rmsMean: number;
  pitchHzMean: number | null;
  pitchVariability: number | null;
  jitterLike: number | null;
  speechRateCharsPerSec: number;
  lowEnergyRatio: number;
  /** prosody-only emotion hint (text와 블렌딩) */
  prosodyEmotionHint: "joyful" | "calm" | "sad" | "tired" | "alert" | "anxious" | null;
  method: "browser_analyser_v1";
};

const LOW_RMS = 0.012;
const ACTIVE_RMS = 0.018;

/** Float32 time-domain buffer에서 autocorrelation 기반 pitch(Hz) 추정 */
export function estimatePitchHz(samples: Float32Array, sampleRate: number): number | null {
  if (samples.length < 256 || sampleRate <= 0) return null;

  let rms = 0;
  for (let i = 0; i < samples.length; i += 1) {
    rms += samples[i] * samples[i];
  }
  rms = Math.sqrt(rms / samples.length);
  if (rms < 0.004) return null;

  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 70);
  let bestLag = -1;
  let bestCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let corr = 0;
    for (let i = 0; i < samples.length - lag; i += 1) {
      corr += samples[i] * samples[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorr <= 0) return null;
  const hz = sampleRate / bestLag;
  if (hz < 70 || hz > 400) return null;
  return hz;
}

export function summarizeProsodyTurn(input: {
  samples: ProsodySample[];
  transcript: string;
  startedAt: number;
  endedAt: number;
}): VoiceProsodyTurn | null {
  const { samples, transcript, startedAt, endedAt } = input;
  const durationMs = Math.max(endedAt - startedAt, 1);
  if (samples.length === 0) {
    const chars = transcript.replace(/\s+/g, "").length;
    return {
      durationMs,
      rmsMean: 0,
      rmsStd: 0,
      rmsMax: 0,
      lowEnergyRatio: 1,
      pitchHzMean: null,
      pitchVariability: null,
      jitterLike: null,
      speechRateCharsPerSec: chars / (durationMs / 1000),
      activeSpeechMs: 0,
    };
  }

  const rmsValues = samples.map((s) => s.rms);
  const rmsMean = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  const rmsMax = Math.max(...rmsValues);
  const rmsStd = Math.sqrt(
    rmsValues.reduce((sum, v) => sum + (v - rmsMean) ** 2, 0) / rmsValues.length,
  );
  const lowEnergyRatio = rmsValues.filter((v) => v < LOW_RMS).length / rmsValues.length;

  const pitchValues = samples.map((s) => s.pitchHz).filter((v): v is number => v != null);
  const pitchHzMean = pitchValues.length
    ? pitchValues.reduce((a, b) => a + b, 0) / pitchValues.length
    : null;
  const pitchVariability = pitchValues.length >= 2
    ? Math.sqrt(
        pitchValues.reduce((sum, v) => sum + (v - (pitchHzMean ?? v)) ** 2, 0) / pitchValues.length,
      )
    : null;

  let jitterLike: number | null = null;
  if (pitchValues.length >= 3) {
    let jitterSum = 0;
    for (let i = 1; i < pitchValues.length; i += 1) {
      jitterSum += Math.abs(pitchValues[i] - pitchValues[i - 1]);
    }
    jitterLike = jitterSum / (pitchValues.length - 1);
  }

  const activeSpeechMs = samples.filter((s) => s.rms >= ACTIVE_RMS).length * 200;
  const chars = transcript.replace(/\s+/g, "").length;
  const speechSec = Math.max(activeSpeechMs / 1000, durationMs / 1000, 0.5);
  const speechRateCharsPerSec = chars / speechSec;

  return {
    durationMs,
    rmsMean,
    rmsStd,
    rmsMax,
    lowEnergyRatio,
    pitchHzMean,
    pitchVariability,
    jitterLike,
    speechRateCharsPerSec,
    activeSpeechMs,
  };
}

export function summarizeProsodySession(turns: VoiceProsodyTurn[]): VoiceProsodySessionSummary | null {
  if (turns.length === 0) return null;

  const rmsMean = turns.reduce((s, t) => s + t.rmsMean, 0) / turns.length;
  const lowEnergyRatio = turns.reduce((s, t) => s + t.lowEnergyRatio, 0) / turns.length;
  const speechRateCharsPerSec = turns.reduce((s, t) => s + t.speechRateCharsPerSec, 0) / turns.length;

  const pitchMeans = turns.map((t) => t.pitchHzMean).filter((v): v is number => v != null);
  const pitchHzMean = pitchMeans.length
    ? pitchMeans.reduce((a, b) => a + b, 0) / pitchMeans.length
    : null;

  const pitchVars = turns.map((t) => t.pitchVariability).filter((v): v is number => v != null);
  const pitchVariability = pitchVars.length
    ? pitchVars.reduce((a, b) => a + b, 0) / pitchVars.length
    : null;

  const jitters = turns.map((t) => t.jitterLike).filter((v): v is number => v != null);
  const jitterLike = jitters.length
    ? jitters.reduce((a, b) => a + b, 0) / jitters.length
    : null;

  return {
    turnCount: turns.length,
    rmsMean,
    pitchHzMean,
    pitchVariability,
    jitterLike,
    speechRateCharsPerSec,
    lowEnergyRatio,
    prosodyEmotionHint: inferProsodyEmotionHint({
      rmsMean,
      lowEnergyRatio,
      pitchHzMean,
      pitchVariability,
      jitterLike,
      speechRateCharsPerSec,
    }),
    method: "browser_analyser_v1",
  };
}

export function inferProsodyEmotionHint(features: {
  rmsMean: number;
  lowEnergyRatio: number;
  pitchHzMean: number | null;
  pitchVariability: number | null;
  jitterLike: number | null;
  speechRateCharsPerSec: number;
}): VoiceProsodySessionSummary["prosodyEmotionHint"] {
  const {
    rmsMean,
    lowEnergyRatio,
    pitchHzMean,
    pitchVariability,
    jitterLike,
    speechRateCharsPerSec,
  } = features;

  if (lowEnergyRatio > 0.72 && rmsMean < 0.025) return "tired";
  if (pitchVariability != null && pitchVariability < 18 && speechRateCharsPerSec < 2.2) return "sad";
  if (jitterLike != null && jitterLike > 28 && pitchHzMean != null && pitchHzMean > 180) return "anxious";
  if (rmsMean > 0.06 && speechRateCharsPerSec > 4.5) return "alert";
  if (rmsMean > 0.035 && speechRateCharsPerSec > 3.2 && pitchVariability != null && pitchVariability > 35) {
    return "joyful";
  }
  if (lowEnergyRatio < 0.45 && speechRateCharsPerSec >= 2 && speechRateCharsPerSec <= 4) return "calm";
  return null;
}
