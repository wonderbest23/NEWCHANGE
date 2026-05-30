import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Mic, MicOff, PhoneOff, Phone, Sparkles, Loader2, Moon, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { EmotionRecommendationCollection } from "@/components/checkin/CheckinOverview";
import { cn } from "@/lib/utils";
import { createRealtimeSession } from "@/lib/voice-test-actions";
import {
  amendTodayCheckinReview,
  analyzeAndSaveCheckin,
  denyCareMemoryItem,
  getCheckinOpeningMemory,
  getTodayCheckin,
  recordCheckinQualityEvent,
} from "@/lib/checkin/checkin-actions";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import {
  queueCheckinSave,
  CHECKIN_SAVED_EVENT,
  clearCheckinCallDraft,
  loadCheckinCallDraft,
  saveCheckinCallDraft,
  type CheckinCallDraft,
} from "@/lib/checkin/background-save";
import {
  estimatePitchHz,
  summarizeProsodySession,
  summarizeProsodyTurn,
  type ProsodySample,
  type VoiceProsodyTurn,
} from "@/lib/checkin/voice-prosody";
import type { VoiceSerTurnClip } from "@/lib/checkin/voice-ser.types";
import { ANALYTICS_EVENTS } from "@/lib/analytics/eventNames";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { ALERT_LEVEL_LABEL, resolveAlert, resolveEmotion } from "@/lib/checkin/emotion";
import {
  buildCheckinStepAnswers,
  buildCheckinQuestionPlan,
  CHECKIN_STEPS,
  getPlannedStepById,
  type CheckinQuestionPlan,
  type CheckinStepAnswer,
  type CheckinStepId,
} from "@/lib/checkin/checkin-steps";
import { detectEvidenceBasedRisks, hasUrgentEvidenceRisk } from "@/lib/checkin/evidence-risk";
import {
  buildAssistantSpeakInstruction,
  createInitialCheckinState,
  decideAfterAnswer,
  getOpeningPrompt,
  isUnclearAnswerText,
  stripCheckinMetaPrompt,
  type CheckinMachineState,
} from "@/lib/checkin/checkin-state-machine";

type Transcript = { role: "user" | "ai"; text: string; ts: number; partial?: boolean };
type Status = "idle" | "connecting" | "live" | "ended" | "analyzing";
type TurnState = "idle" | "ai_speaking" | "user_can_speak" | "ending";
type SavedCheckinTurn = {
  id: string;
  turn_index?: number | null;
  step_id?: string | null;
  step_label?: string | null;
  ai_question?: string | null;
  user_answer?: string | null;
  corrected_answer?: string | null;
  corrected_at?: string | null;
  risk_matches?: unknown;
};

type AnalyzeResult = Awaited<ReturnType<typeof analyzeAndSaveCheckin>>;

function pickSerRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "audio/webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type ConnectPhase = "session" | "webrtc";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/** 클릭 이벤트와 같은 tick 에 시작해야 권한 팝업이 뜬다. */
function requestMicStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("이 브라우저에서는 마이크를 사용할 수 없어요."));
  }
  return navigator.mediaDevices
    .getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    .catch((err) => {
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") throw err;
      return navigator.mediaDevices.getUserMedia({ audio: true });
    });
}
type OpeningMemory = Awaited<ReturnType<typeof getCheckinOpeningMemory>>;
type AudioQualityStats = {
  samples: number;
  maxJitterMs: number;
  maxRttMs: number;
  maxPacketsLost: number;
  lastPacketsLost: number;
  lastPacketsReceived: number;
  sampledAt?: number;
};
type MicSignalStats = {
  samples: number;
  maxRms: number;
  avgRms: number;
  lowRmsSamples: number;
};

function stepLabel(stepId: CheckinStepId): string {
  return {
    Q1_MEAL: "식사",
    Q2_CONDITION: "몸 상태",
    Q3_PAIN: "통증과 불편",
    Q4_MEDICINE: "약",
    Q5_MOOD: "기분",
    Q6_HELP: "도움 요청",
  }[stepId];
}

/**
 * 시니어 홈에 임베드되는 매일 안부 통화 카드.
 * 큰 버튼 하나로 AI와 실시간 음성 통화 — 본인 건강 체크용.
 */
export function DailyVoiceCheckin({
  nickname,
  onAnalyzed,
  alreadyDoneToday = false,
  todayCondition = null,
  todayMood = null,
  savedTurns = [],
}: {
  nickname?: string;
  onAnalyzed?: (result: AnalyzeResult) => void;
  alreadyDoneToday?: boolean;
  todayCondition?: "good" | "normal" | "caution" | "urgent" | null;
  todayMood?: string | null;
  savedTurns?: SavedCheckinTurn[];
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [connectPhase, setConnectPhase] = useState<ConnectPhase | null>(null);
  const [muted, setMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [draft, setDraft] = useState<CheckinCallDraft | null>(null);
  const [turnState, setTurnState] = useState<TurnState>("idle");
  const [stepAnswers, setStepAnswers] = useState<CheckinStepAnswer[]>([]);
  const [urgentNotice, setUrgentNotice] = useState<string | null>(null);
  const [showConversationReview, setShowConversationReview] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const autoEndTriggeredRef = useRef(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const endCallRef = useRef<() => void>(() => {});
  // 자동 저장(언마운트/페이지 이동/탭 종료 시)을 위해 최신 값을 ref에 동기화
  const transcriptsRef = useRef<Transcript[]>([]);
  const statusRef = useRef<Status>("idle");
  const mutedRef = useRef(false);
  const stepAnswersRef = useRef<CheckinStepAnswer[]>([]);
  const currentStepIdRef = useRef<CheckinStepId>("Q1_MEAL");
  const currentQuestionRef = useRef("오늘 식사는 하셨어요?");
  const currentQuestionTsRef = useRef<number | undefined>(undefined);
  const questionPlanRef = useRef<CheckinQuestionPlan>(buildCheckinQuestionPlan());
  const machineStateRef = useRef<CheckinMachineState>(
    createInitialCheckinState("Q1_MEAL", questionPlanRef.current),
  );
  const openingMemoryRef = useRef<OpeningMemory | null>(null);
  const openingMemoryCheckedRef = useRef(false);

  // 음성 안정화용 refs
  // - AI 발화 중에는 마이크를 잠가 스피커 잔향/끼어들기 전사를 막고, 발화가 끝난 뒤에만 답변을 받는다
  // - 같은 transcript가 짧은 간격으로 중복되면 무시
  // - 응답 생성 중복 락
  const isAssistantSpeakingRef = useRef(false);
  const lastAssistantAudioAtRef = useRef(0);
  const isProcessingTurnRef = useRef(false);
  const lastUserTranscriptRef = useRef("");
  const lastUserTranscriptAtRef = useRef(0);
  const assistantSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openingGreetingSentRef = useRef(false);
  const remoteReadyRef = useRef(false);
  const pendingAutoEndRef = useRef(false);
  const pendingAutoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assistantAudioActiveRef = useRef(false);
  const assistantTurnEpochRef = useRef(0);
  const assistantUnlockAtRef = useRef<number | null>(null);
  const assistantCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assistantWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteSilenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteAudioHeardRef = useRef(false);
  const lastRemoteAudioAtRef = useRef(0);
  const assistantGenerationDoneRef = useRef(false);
  const userProsodySamplesRef = useRef<ProsodySample[]>([]);
  const userProsodyTurnStartedRef = useRef<number | null>(null);
  const voiceProsodyTurnsRef = useRef<VoiceProsodyTurn[]>([]);
  const voiceSerTurnClipsRef = useRef<VoiceSerTurnClip[]>([]);
  const serRecorderRef = useRef<MediaRecorder | null>(null);
  const serChunksRef = useRef<Blob[]>([]);
  const pendingSerClipTasksRef = useRef<Promise<void>[]>([]);
  const draftAutosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micSignalRef = useRef<MicSignalStats>({
    samples: 0,
    maxRms: 0,
    avgRms: 0,
    lowRmsSamples: 0,
  });
  const audioQualityRef = useRef<AudioQualityStats>({
    samples: 0,
    maxJitterMs: 0,
    maxRttMs: 0,
    maxPacketsLost: 0,
    lastPacketsLost: 0,
    lastPacketsReceived: 0,
  });

  const setMicEnabled = (enabled: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled && !mutedRef.current;
    });
  };

  const resetAudioQualityStats = () => {
    audioQualityRef.current = {
      samples: 0,
      maxJitterMs: 0,
      maxRttMs: 0,
      maxPacketsLost: 0,
      lastPacketsLost: 0,
      lastPacketsReceived: 0,
    };
  };

  const resetMicSignalStats = () => {
    micSignalRef.current = {
      samples: 0,
      maxRms: 0,
      avgRms: 0,
      lowRmsSamples: 0,
    };
  };

  const startMicSignalSampling = (stream: MediaStream) => {
    stopMicSignalSampling();
    resetMicSignalStats();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioContextRef.current = ctx;
      micAnalyserRef.current = analyser;
      const buffer = new Uint8Array(analyser.fftSize);
      micLevelTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        let peak = 0;
        for (const v of buffer) {
          const centered = (v - 128) / 128;
          sumSquares += centered * centered;
          peak = Math.max(peak, Math.abs(centered));
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const prev = micSignalRef.current;
        const samples = prev.samples + 1;
        micSignalRef.current = {
          samples,
          maxRms: Math.max(prev.maxRms, peak, rms),
          avgRms: (prev.avgRms * prev.samples + rms) / samples,
          lowRmsSamples: prev.lowRmsSamples + (rms < 0.012 ? 1 : 0),
        };

        if (
          !isAssistantSpeakingRef.current &&
          !pendingAutoEndRef.current &&
          statusRef.current === "live"
        ) {
          const floatBuffer = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(floatBuffer);
          const pitchHz = estimatePitchHz(floatBuffer, ctx.sampleRate);
          userProsodySamplesRef.current.push({ rms, pitchHz, ts: Date.now() });
        }
      }, 350);
    } catch (e) {
      console.warn("[checkin-audio] mic level sampling failed", e);
    }
  };

  const stopMicSignalSampling = () => {
    if (micLevelTimerRef.current) {
      clearInterval(micLevelTimerRef.current);
      micLevelTimerRef.current = null;
    }
    try { audioContextRef.current?.close(); } catch {}
    audioContextRef.current = null;
    micAnalyserRef.current = null;
  };

  const sampleAudioQuality = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const reports = await pc.getStats();
      const next = { ...audioQualityRef.current };
      next.samples += 1;
      next.sampledAt = Date.now();

      reports.forEach((report: any) => {
        const isAudio = report.kind === "audio" || report.mediaType === "audio";
        if (!isAudio) return;

        if (report.type === "inbound-rtp") {
          if (typeof report.jitter === "number") {
            next.maxJitterMs = Math.max(next.maxJitterMs, Math.round(report.jitter * 1000));
          }
          if (typeof report.packetsLost === "number") {
            next.lastPacketsLost = report.packetsLost;
            next.maxPacketsLost = Math.max(next.maxPacketsLost, report.packetsLost);
          }
          if (typeof report.packetsReceived === "number") {
            next.lastPacketsReceived = report.packetsReceived;
          }
        }

        if (report.type === "remote-inbound-rtp" && typeof report.roundTripTime === "number") {
          next.maxRttMs = Math.max(next.maxRttMs, Math.round(report.roundTripTime * 1000));
        }
      });

      audioQualityRef.current = next;
    } catch (e) {
      console.warn("[checkin-quality] getStats failed", e);
    }
  };

  const startAudioQualitySampling = () => {
    resetAudioQualityStats();
    if (qualityTimerRef.current) clearInterval(qualityTimerRef.current);
    void sampleAudioQuality();
    qualityTimerRef.current = setInterval(() => {
      void sampleAudioQuality();
    }, 5000);
  };

  const stopAudioQualitySampling = () => {
    if (qualityTimerRef.current) {
      clearInterval(qualityTimerRef.current);
      qualityTimerRef.current = null;
    }
  };

  const isWeakMicSignal = () => {
    const stats = micSignalRef.current;
    if (stats.samples < 4) return false;
    const lowRatio = stats.lowRmsSamples / stats.samples;
    return stats.maxRms < 0.035 && lowRatio >= 0.75;
  };

  const isAmbiguousTranscript = (text: string) => {
    const compact = text.replace(/[.,!?…~\s]/g, "");
    if (isUnclearAnswerText(text)) return true;
    if (compact.length <= 1) return true;
    if (compact.length <= 3 && isWeakMicSignal()) return true;
    return false;
  };

  const runPendingAutoEnd = () => {
    if (autoEndTriggeredRef.current || !pendingAutoEndRef.current) return;
    pendingAutoEndRef.current = false;
    if (statusRef.current === "live" || statusRef.current === "connecting") {
      endCallRef.current();
    }
  };

  const cancelPendingAutoEnd = () => {
    pendingAutoEndRef.current = false;
    if (pendingAutoEndTimerRef.current) {
      clearTimeout(pendingAutoEndTimerRef.current);
      pendingAutoEndTimerRef.current = null;
    }
  };

  /** 마무리 멘트 TTS가 끝난 뒤에만 통화를 종료한다. */
  const armClosingAutoEnd = () => {
    pendingAutoEndRef.current = true;
    setTurnState("ending");
    setMicEnabled(false);
  };

  const scheduleClosingAutoEnd = () => {
    if (!pendingAutoEndRef.current || autoEndTriggeredRef.current) return;
    if (pendingAutoEndTimerRef.current) clearTimeout(pendingAutoEndTimerRef.current);
    // 마무리 멘트 TTS가 끝날 시간을 준다 (1.5초는 문장 중간에 끊기기 쉬움)
    pendingAutoEndTimerRef.current = setTimeout(runPendingAutoEnd, 4500);
  };

  const startSerTurnRecording = () => {
    const stream = localStreamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") return;
    if (serRecorderRef.current?.state === "recording") return;
    try {
      serChunksRef.current = [];
      const mimeType = pickSerRecorderMime();
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) serChunksRef.current.push(event.data);
      };
      recorder.start(200);
      serRecorderRef.current = recorder;
    } catch (e) {
      console.warn("[checkin-ser] recording start failed", e);
    }
  };

  const finalizeSerTurnRecording = (transcript: string, stepId: CheckinStepId): Promise<void> => {
    const recorder = serRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return Promise.resolve();
    serRecorderRef.current = null;

    const task = new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        try {
          const blob = new Blob(serChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          serChunksRef.current = [];
          if (blob.size > 400) {
            const audioBase64 = await blobToBase64(blob);
            voiceSerTurnClipsRef.current.push({
              stepId,
              transcript,
              audioBase64,
              mimeType: blob.type || "audio/webm",
            });
          }
        } catch (e) {
          console.warn("[checkin-ser] clip finalize failed", e);
        }
        resolve();
      };
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
    pendingSerClipTasksRef.current.push(task);
    return task;
  };

  const stopSerTurnRecording = () => {
    const recorder = serRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    try {
      recorder.stop();
    } catch {}
    serRecorderRef.current = null;
  };

  const canAutoEndNow = () => machineStateRef.current.ended;

  const clearAssistantTurnTimers = () => {
    assistantUnlockAtRef.current = null;
    if (assistantCompleteTimerRef.current) {
      clearTimeout(assistantCompleteTimerRef.current);
      assistantCompleteTimerRef.current = null;
    }
    if (assistantWatchdogTimerRef.current) {
      clearTimeout(assistantWatchdogTimerRef.current);
      assistantWatchdogTimerRef.current = null;
    }
  };

  const completeAssistantTurn = (opts: { force?: boolean } = {}) => {
    const force = opts.force === true;
    if (!force && !isAssistantSpeakingRef.current && !pendingAutoEndRef.current) return;
    if (!force && pendingAutoEndRef.current && !assistantGenerationDoneRef.current) return;

    clearAssistantTurnTimers();
    assistantAudioActiveRef.current = false;
    remoteAudioHeardRef.current = false;

    if (pendingAutoEndRef.current) {
      scheduleClosingAutoEnd();
      return;
    }

    isAssistantSpeakingRef.current = false;
    isProcessingTurnRef.current = false;
    setTurnState("user_can_speak");
    setMicEnabled(true);
    startSerTurnRecording();
  };

  const scheduleAssistantTurnComplete = (delayMs: number) => {
    const epoch = assistantTurnEpochRef.current;
    const unlockAt = Date.now() + delayMs;
    if (assistantUnlockAtRef.current !== null && assistantUnlockAtRef.current <= unlockAt) {
      return;
    }
    assistantUnlockAtRef.current = unlockAt;
    if (assistantCompleteTimerRef.current) clearTimeout(assistantCompleteTimerRef.current);
    assistantCompleteTimerRef.current = setTimeout(() => {
      if (assistantTurnEpochRef.current !== epoch) return;
      completeAssistantTurn();
    }, delayMs);
  };

  const noteAssistantPlaybackFinished = (source: "buffer" | "generation" | "response") => {
    if (!isAssistantSpeakingRef.current && !pendingAutoEndRef.current) return;
    assistantGenerationDoneRef.current = true;
    const delayMs = source === "buffer" ? 600 : source === "generation" ? 1000 : 1200;
    scheduleAssistantTurnComplete(delayMs);
  };

  const stopRemoteAudioMonitoring = () => {
    if (remoteSilenceTimerRef.current) {
      clearInterval(remoteSilenceTimerRef.current);
      remoteSilenceTimerRef.current = null;
    }
    try { remoteAudioContextRef.current?.close(); } catch {}
    remoteAudioContextRef.current = null;
    remoteAnalyserRef.current = null;
    remoteAudioHeardRef.current = false;
    lastRemoteAudioAtRef.current = 0;
  };

  const startRemoteAudioMonitoring = (stream: MediaStream) => {
    stopRemoteAudioMonitoring();
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      remoteAudioContextRef.current = ctx;
      remoteAnalyserRef.current = analyser;

      remoteSilenceTimerRef.current = setInterval(() => {
        if (!isAssistantSpeakingRef.current || !remoteAnalyserRef.current) return;
        const buffer = new Uint8Array(remoteAnalyserRef.current.frequencyBinCount);
        remoteAnalyserRef.current.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const centered = (buffer[i] - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        if (rms >= 0.018) {
          remoteAudioHeardRef.current = true;
          lastRemoteAudioAtRef.current = Date.now();
          return;
        }
        // TTS 생성/전송 중 문장 사이 쉼은 '말 끝'이 아니다.
        if (!assistantGenerationDoneRef.current) return;
        if (!remoteAudioHeardRef.current) return;
        if (Date.now() - lastRemoteAudioAtRef.current >= 1400) {
          completeAssistantTurn();
        }
      }, 200);
    } catch (e) {
      console.warn("[checkin-audio] remote silence monitor failed", e);
    }
  };

  const startDraftAutosave = () => {
    if (draftAutosaveTimerRef.current) clearInterval(draftAutosaveTimerRef.current);
    draftAutosaveTimerRef.current = setInterval(() => {
      if (statusRef.current === "live" || statusRef.current === "connecting") {
        saveDraftFromCurrentState("manual");
      }
    }, 5000);
  };

  const stopDraftAutosave = () => {
    if (draftAutosaveTimerRef.current) {
      clearInterval(draftAutosaveTimerRef.current);
      draftAutosaveTimerRef.current = null;
    }
  };

  const summarizeQuality = (
    statusValue: "completed" | "failed" | "too_short" | "draft_saved" | "review_corrected",
    sourceTranscripts = transcriptsRef.current,
    sourceStepAnswers = stepAnswersRef.current,
  ) => {
    const completed = new Set(sourceStepAnswers.map((answer) => answer.stepId));
    const expectedPlan = questionPlanRef.current.length ? questionPlanRef.current : CHECKIN_STEPS;
    const missingStepIds = expectedPlan
      .map((step) => step.id)
      .filter((stepId) => !completed.has(stepId));
    const audio = audioQualityRef.current;
    const issueFlags = [
      missingStepIds.length > 0 ? "missing_steps" : null,
      audio.maxJitterMs >= 80 ? "high_jitter" : null,
      audio.maxRttMs >= 500 ? "high_rtt" : null,
      audio.maxPacketsLost > 0 ? "packet_loss_seen" : null,
      statusValue === "failed" ? "save_failed" : null,
      statusValue === "too_short" ? "too_short" : null,
      urgentNotice ? "urgent_notice" : null,
    ].filter(Boolean) as string[];

    return {
      expectedStepCount: expectedPlan.length,
      completedStepCount: completed.size,
      missingStepIds,
      transcriptTurnCount: sourceTranscripts.length,
      userTurnCount: sourceTranscripts.filter((turn) => turn.role === "user").length,
      assistantTurnCount: sourceTranscripts.filter((turn) => turn.role === "ai").length,
      urgentDetected: !!urgentNotice || sourceStepAnswers.some((answer) =>
        (answer.riskMatches ?? []).some((risk) => risk.severity === "urgent"),
      ),
      issueFlags,
      audioStats: {
        samples: audio.samples,
        maxJitterMs: audio.maxJitterMs,
        maxRttMs: audio.maxRttMs,
        maxPacketsLost: audio.maxPacketsLost,
        lastPacketsLost: audio.lastPacketsLost,
        lastPacketsReceived: audio.lastPacketsReceived,
        micSamples: micSignalRef.current.samples,
        micMaxRms: Number(micSignalRef.current.maxRms.toFixed(4)),
        micAvgRms: Number(micSignalRef.current.avgRms.toFixed(4)),
        micLowRmsSamples: micSignalRef.current.lowRmsSamples,
      },
    };
  };

  const recordQuality = async (
    statusValue: "completed" | "failed" | "too_short" | "draft_saved" | "review_corrected",
    opts: {
      checkinId?: string | null;
      durationSec?: number;
      transcripts?: Transcript[];
      stepAnswers?: CheckinStepAnswer[];
      correctionCount?: number;
      draftReason?: string | null;
    } = {},
  ) => {
    const sourceTranscripts = opts.transcripts ?? transcriptsRef.current;
    const sourceStepAnswers = opts.stepAnswers ?? stepAnswersRef.current;
    const durationSec = opts.durationSec ?? (startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : 0);
    const summary = summarizeQuality(statusValue, sourceTranscripts, sourceStepAnswers);
    await recordCheckinQualityEvent({
      headers: await authHeaders(),
      data: {
        checkinId: opts.checkinId ?? null,
        status: statusValue,
        durationSec,
        ...summary,
        correctionCount: opts.correctionCount ?? 0,
        resumedFromDraft: !!draft,
        draftReason: opts.draftReason ?? draft?.reason ?? null,
      },
    } as Parameters<typeof recordCheckinQualityEvent>[0]);
  };

  const prepareAssistantTurn = () => {
    isProcessingTurnRef.current = true;
    setTurnState("ai_speaking");
    setUserSpeaking(false);
    setMicEnabled(false);
  };

  const beginAssistantTurn = () => {
    prepareAssistantTurn();
    isAssistantSpeakingRef.current = true;
    assistantAudioActiveRef.current = false;
    assistantGenerationDoneRef.current = false;
    remoteAudioHeardRef.current = false;
    lastRemoteAudioAtRef.current = 0;
    lastAssistantAudioAtRef.current = Date.now();
    clearAssistantTurnTimers();
    const epoch = ++assistantTurnEpochRef.current;
    assistantWatchdogTimerRef.current = setTimeout(() => {
      if (assistantTurnEpochRef.current !== epoch) return;
      completeAssistantTurn({ force: true });
    }, pendingAutoEndRef.current ? 25000 : 18000);
    if (pendingAutoEndRef.current) {
      if (pendingAutoEndTimerRef.current) clearTimeout(pendingAutoEndTimerRef.current);
      pendingAutoEndTimerRef.current = setTimeout(runPendingAutoEnd, 25000);
    }
  };

  const noteAssistantAudioDelta = () => {
    assistantAudioActiveRef.current = true;
    lastAssistantAudioAtRef.current = Date.now();
  };

  const saveDraftFromCurrentState = (
    reason: NonNullable<CheckinCallDraft["reason"]>,
    source = transcriptsRef.current,
  ) => {
    const clean = source.filter((t) => t.text.trim().length > 0 && !t.partial);
    if (clean.length === 0) return;
    const durationSec = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : draft?.durationSec ?? 0;
    saveCheckinCallDraft({
      transcript: clean.map((t) => ({ role: t.role, text: t.text })),
      stepAnswers: stepAnswersRef.current,
      durationSec,
      shareWithGuardian: true,
      startedAt: startedAtRef.current,
      currentStepId: currentStepIdRef.current,
      lastQuestion: currentQuestionRef.current,
      questionPlan: questionPlanRef.current,
      urgentNotice,
      reason,
    });
    setDraft(loadCheckinCallDraft());
  };

  const pauseCall = (
    reason: NonNullable<CheckinCallDraft["reason"]>,
    message = "통화를 일시저장했어요. 돌아오면 이어서 할 수 있어요.",
  ) => {
    autoEndTriggeredRef.current = true;
    saveDraftFromCurrentState(reason);
    void recordQuality("draft_saved", { draftReason: reason }).catch((e) =>
      console.warn("[checkin-quality] draft event failed", e),
    );
    cleanup();
    setStatus("idle");
    toast(message);
  };


  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [transcripts]);

  useEffect(() => {
    const saved = loadCheckinCallDraft();
    if (!saved) return;
    setDraft(saved);
    setTranscripts(saved.transcript.map((t, i) => ({
      ...t,
      ts: saved.savedAt + i,
    })));
    setStepAnswers(saved.stepAnswers ?? []);
    if (saved.questionPlan?.length) {
      questionPlanRef.current = saved.questionPlan;
    }
    if (saved.currentStepId) {
      currentStepIdRef.current = saved.currentStepId;
      machineStateRef.current = createInitialCheckinState(saved.currentStepId, questionPlanRef.current);
    }
    if (saved.lastQuestion) currentQuestionRef.current = saved.lastQuestion;
    if (saved.urgentNotice) setUrgentNotice(saved.urgentNotice);
    startedAtRef.current = saved.startedAt ?? Date.now() - saved.durationSec * 1000;
  }, []);

  // 통화 시작 시 카드를 화면 상단으로 스크롤 (모바일에서 통화 화면이 잘 보이도록)
  useEffect(() => {
    if (status === "live" || status === "connecting") {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  // connecting 상태가 끝없이 이어지면 강제로 idle 복귀
  useEffect(() => {
    if (status !== "connecting") return;
    const timer = setTimeout(() => {
      if (statusRef.current !== "connecting") return;
      console.error("[checkin] connect watchdog timeout");
      setConnectPhase(null);
      setError("연결 시간이 초과됐어요. 마이크 권한과 네트워크를 확인한 뒤 다시 시도해 주세요.");
      setStatus("idle");
      cleanup();
      toast.error("통화 연결 시간이 초과됐어요");
    }, 60_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // transcripts/status 변경을 ref에 동기화 — 언마운트 시점에서도 최신 값 참조 가능
  useEffect(() => { transcriptsRef.current = transcripts; }, [transcripts]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { stepAnswersRef.current = stepAnswers; }, [stepAnswers]);

  useEffect(() => {
    if (status !== "live" && status !== "connecting") return;
    if (stepAnswers.length === 0) return;
    saveDraftFromCurrentState("manual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepAnswers, status]);

  // 통화 활성 상태를 전역에 알려 다른 플로팅 UI(예: AskFab)가 숨도록 함
  useEffect(() => {
    const active = status === "live" || status === "connecting";
    window.dispatchEvent(new CustomEvent("checkin-call-active", { detail: { active } }));
    return () => {
      if (active) {
        window.dispatchEvent(new CustomEvent("checkin-call-active", { detail: { active: false } }));
      }
    };
  }, [status]);

  // 언마운트(페이지 이동/카드 사라짐) 시: 통화 중이었다면 최종 분석 대신 일시저장
  useEffect(() => {
    return () => {
      const wasActive = statusRef.current === "live" || statusRef.current === "connecting";
      cleanup();
      if (!wasActive) return;
      saveDraftFromCurrentState("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 통화 도중 앱이 숨겨지거나 페이지가 닫히면 분석 완료가 아니라 일시저장한다.
  useEffect(() => {
    if (status !== "live" && status !== "connecting") return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        saveDraftFromCurrentState("hidden");
      }
    };
    const handlePageHide = () => saveDraftFromCurrentState("pagehide");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [status]);

  const cleanup = () => {
    stopDraftAutosave();
    stopAudioQualitySampling();
    stopMicSignalSampling();
    if (pendingAutoEndTimerRef.current) {
      clearTimeout(pendingAutoEndTimerRef.current);
      pendingAutoEndTimerRef.current = null;
    }
    pendingAutoEndRef.current = false;
    cancelPendingAutoEnd();
    clearAssistantTurnTimers();
    stopRemoteAudioMonitoring();
    stopSerTurnRecording();
    if (assistantSilenceTimerRef.current) {
      clearTimeout(assistantSilenceTimerRef.current);
      assistantSilenceTimerRef.current = null;
    }
    try { dcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    try {
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.srcObject = null;
      }
    } catch {}
    dcRef.current = null;
    localStreamRef.current = null;
    pcRef.current = null;
    isAssistantSpeakingRef.current = false;
    isProcessingTurnRef.current = false;
    assistantAudioActiveRef.current = false;
    assistantTurnEpochRef.current += 1;
    setTurnState("idle");
    setUserSpeaking(false);
  };

  const rememberAssistantQuestion = (stepId: CheckinStepId, text: string, ts = Date.now()) => {
    currentStepIdRef.current = stepId;
    currentQuestionRef.current = text.trim();
    currentQuestionTsRef.current = ts;
  };

  const sendDirectedAssistantPrompt = (prompt: string, stepId: CheckinStepId | null) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    const spokenLine = stripCheckinMetaPrompt(prompt);
    if (stepId !== null) {
      cancelPendingAutoEnd();
    }
    if (stepId) rememberAssistantQuestion(stepId, getPlannedStepById(stepId, questionPlanRef.current).prompt, Date.now());
    prepareAssistantTurn();
    dc.send(JSON.stringify({
      type: "response.create",
      response: {
        instructions: buildAssistantSpeakInstruction(spokenLine),
      },
    }));
  };

  const isMeaningfulUserText = (text: string) => {
    const cleaned = text.replace(/[.,!?…~\s]/g, "");
    if (!cleaned) return false;
    // "네", "응" 같은 한국어 짧은 답변은 실제 답변이므로 버리면 안 된다.
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ0-9]/.test(cleaned)) return true;
    return cleaned.length >= 2;
  };

  const appendUserTranscript = (text: string) => {
    const now = Date.now();
    if (
      text === lastUserTranscriptRef.current &&
      now - lastUserTranscriptAtRef.current < 3000
    ) {
      return;
    }
    lastUserTranscriptRef.current = text;
    lastUserTranscriptAtRef.current = now;

    void finalizeSerTurnRecording(text, currentStepIdRef.current);

    const prosodyTurn = summarizeProsodyTurn({
      samples: userProsodySamplesRef.current,
      transcript: text,
      startedAt: userProsodyTurnStartedRef.current ?? now - 800,
      endedAt: now,
    });
    if (prosodyTurn) voiceProsodyTurnsRef.current.push(prosodyTurn);
    userProsodySamplesRef.current = [];
    userProsodyTurnStartedRef.current = null;

    const riskMatches = detectEvidenceBasedRisks([{ role: "user", text }]);
    const ambiguousTranscript = isAmbiguousTranscript(text);
    const decision = decideAfterAnswer({
      state: machineStateRef.current,
      answerText: text,
      riskMatches,
      forceUnclear: ambiguousTranscript,
    });
    machineStateRef.current = decision.state;

    const nextTranscripts = [...transcriptsRef.current, { role: "user" as const, text, ts: now }];
    transcriptsRef.current = nextTranscripts;
    setTranscripts(nextTranscripts);

    if (!openingMemoryCheckedRef.current && openingMemoryRef.current?.id) {
      openingMemoryCheckedRef.current = true;
      if (/(아니|아니요|그런적없|그런 적 없|잘못|틀렸|몰라)/.test(text.replace(/\s+/g, ""))) {
        const memoryId = openingMemoryRef.current.id;
        void (async () => {
          await denyCareMemoryItem({
            data: { memoryId },
            headers: await authHeaders(),
          });
        })().catch((e) => console.warn("[care-memory] 기억 부정 처리 실패", e));
      }
    }

    if (decision.recordAnswer) {
      const stepAnswer: CheckinStepAnswer = {
        stepId: currentStepIdRef.current,
        stepLabel: stepLabel(currentStepIdRef.current),
        question: currentQuestionRef.current,
        answer: text,
        askedAt: currentQuestionTsRef.current,
        answeredAt: now,
        riskMatches,
      };
      const nextStepAnswers = [...stepAnswersRef.current, stepAnswer];
      stepAnswersRef.current = nextStepAnswers;
      setStepAnswers(nextStepAnswers);
    }

    saveDraftFromCurrentState("manual", nextTranscripts);

    if (hasUrgentEvidenceRisk(riskMatches)) {
      setUrgentNotice("긴급 확인이 필요한 표현이 기록됐어요. 보호자나 119에 바로 연락해 주세요.");
      setMicEnabled(false);
    }

    if (decision.escalate) {
      setUrgentNotice("긴급 확인이 필요한 표현이 기록됐어요. 보호자나 119에 바로 연락해 주세요.");
    }

    if (decision.unclear) {
      toast("목소리 인식이 약해서 다시 확인할게요.");
    }

    if (decision.end && decision.nextStepId === null && canAutoEndNow()) {
      armClosingAutoEnd();
      toast.message("오늘 안부 확인을 마무리할게요.", { duration: 3000 });
    } else {
      cancelPendingAutoEnd();
    }

    sendDirectedAssistantPrompt(decision.prompt, decision.nextStepId);
  };

  const handleUserTranscript = (msg: any) => {
    const text = ((msg.transcript ?? msg.text ?? msg.delta ?? "") as string).trim();
    if (!text) return;

    // AI 음성/질문 진행 중, 마무리 멘트 중에는 사용자 전사를 받지 않는다.
    if (isAssistantSpeakingRef.current || pendingAutoEndRef.current) {
      return;
    }

    if (!isMeaningfulUserText(text)) return;

    setUserSpeaking(false);
    appendUserTranscript(text);

    // 종료 의사는 상태머신에서만 처리한다. 잘못 전사된 한 문장 때문에 즉시 끊지 않는다.
  };

  const handleEvent = (msg: any) => {
    const t = msg.type as string;
    if (
      t === "conversation.item.input_audio_transcription.completed" ||
      t === "conversation.item.input_audio_transcription.done" ||
      t === "input_audio_transcription.completed"
    ) {
      handleUserTranscript(msg);
    } else if (t === "input_audio_buffer.speech_started" || t === "input_audio_buffer.speech_start") {
      if (
        !isAssistantSpeakingRef.current &&
        !pendingAutoEndRef.current
      ) {
        if (!userProsodyTurnStartedRef.current) {
          userProsodyTurnStartedRef.current = Date.now();
          userProsodySamplesRef.current = [];
          startSerTurnRecording();
        }
        setUserSpeaking(true);
      }
    } else if (t === "input_audio_buffer.speech_stopped" || t === "input_audio_buffer.speech_stop") {
      setUserSpeaking(false);
    } else if (t === "response.created") {
      beginAssistantTurn();
    } else if (t === "session.created" || t === "session.updated") {
      requestOpeningGreeting();
    } else if (t === "response.audio.delta" || t === "response.output_audio.delta") {
      noteAssistantAudioDelta();
    } else if (
      t === "response.audio_transcript.delta" ||
      t === "response.output_audio_transcript.delta"
    ) {
      if (t === "response.audio_transcript.delta" || t === "response.output_audio_transcript.delta") {
        const delta = msg.delta || "";
        setTranscripts((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "ai" && last.partial) {
            return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
          }
          return [...prev, { role: "ai", text: delta, ts: Date.now(), partial: true }];
        });
      }
    } else if (t === "response.audio_transcript.done" || t === "response.output_audio_transcript.done") {
      const finalText = (msg.transcript || "") as string;
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "ai" && last.partial) {
          return [...prev.slice(0, -1), { ...last, partial: false, text: finalText || last.text }];
        }
        return prev;
      });
    } else if (t === "output_audio_buffer.stopped") {
      noteAssistantPlaybackFinished("buffer");
    } else if (t === "response.output_audio.done" || t === "response.audio.done") {
      noteAssistantPlaybackFinished("generation");
    } else if (t === "response.done") {
      noteAssistantPlaybackFinished("response");
    } else if (t === "error") {
      const errMsg = (msg.error?.message ?? "") as string;
      // OpenAI Realtime 의 경쟁 상태(race) 에러 — 첫 응답은 정상 진행 중이고
      // 두 번째 response.create 만 거부된 무해한 케이스. UX 흐름 끊지 않게 무시.
      // 예) "Conversation already has an active response in progress"
      if (/active response in progress|already has an active/i.test(errMsg)) {
        return;
      }
      isProcessingTurnRef.current = false;
      console.error("[checkin-realtime] error", msg.error ?? msg);
      setError(errMsg || "통화 중 오류가 발생했어요");
    }
  };

  const requestOpeningGreeting = () => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open" || openingGreetingSentRef.current || !remoteReadyRef.current) return;
    openingGreetingSentRef.current = true;
    const resumeStepId = draft?.currentStepId ?? currentStepIdRef.current;
    const prompt = draft
      ? `이어서 여쭤볼게요. ${getPlannedStepById(resumeStepId, questionPlanRef.current).prompt}`
      : getOpeningPrompt(nickname, null, questionPlanRef.current);
    rememberAssistantQuestion(resumeStepId, prompt, Date.now());
    prepareAssistantTurn();
    dc.send(JSON.stringify({
      type: "response.create",
      response: {
        instructions: buildAssistantSpeakInstruction(prompt),
      },
    }));
  };

  const ensureRemoteAudioElement = () => {
    if (typeof document === "undefined") return null;
    if (!audioElRef.current) {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.preload = "auto";
      audio.style.position = "fixed";
      audio.style.left = "-9999px";
      audio.style.width = "1px";
      audio.style.height = "1px";
      audio.style.opacity = "0";
      audio.style.pointerEvents = "none";
      document.body.appendChild(audio);
      audioElRef.current = audio;
    }
    audioElRef.current.muted = false;
    audioElRef.current.volume = 1;
    return audioElRef.current;
  };

  const buildResumeContext = () => {
    if (!draft || transcripts.length === 0) return "";
    const recent = transcripts
      .filter((t) => t.text.trim().length > 0)
      .slice(-10)
      .map((t) => `${t.role === "ai" ? "AI" : "사용자"}: ${t.text}`)
      .join("\n");
    if (!recent) return "";
    return [
      "이전 안부 통화가 중간에 끊겨 이어서 진행합니다.",
      "아래 대화를 반복해서 다시 묻지 말고, 빠진 항목만 자연스럽게 이어서 확인하세요.",
      recent,
    ].join("\n");
  };

  const startCall = async () => {
    if (alreadyDoneToday) {
      toast("오늘은 이미 안부 통화를 완료했어요. 내일 다시 만나요.");
      return;
    }

    // setState/await 전에 마이크 요청을 시작 — 그렇지 않으면 권한 팝업이 안 뜰 수 있음
    try {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {}
    localStreamRef.current = null;
    const micPromise = requestMicStream();

    setError(null);
    const resumeContext = buildResumeContext();
    if (!draft) setTranscripts([]);
    if (!draft) setStepAnswers([]);
    setUrgentNotice(null);
    setShowConversationReview(false);
    setResult(null);
    setStatus("connecting");
    setConnectPhase("session");
    setTurnState("idle");
    autoEndTriggeredRef.current = false;
    pendingAutoEndRef.current = false;
    assistantAudioActiveRef.current = false;
    assistantGenerationDoneRef.current = false;
    userProsodySamplesRef.current = [];
    userProsodyTurnStartedRef.current = null;
    voiceProsodyTurnsRef.current = [];
    voiceSerTurnClipsRef.current = [];
    pendingSerClipTasksRef.current = [];
    assistantTurnEpochRef.current = 0;
    cancelPendingAutoEnd();
    clearAssistantTurnTimers();
    openingGreetingSentRef.current = false;
    openingMemoryCheckedRef.current = false;
    remoteReadyRef.current = false;
    currentQuestionTsRef.current = undefined;
    startedAtRef.current = draft?.startedAt ?? Date.now();
    resetAudioQualityStats();
    void trackEvent({
      eventName: ANALYTICS_EVENTS.VOICE_CHECK_STARTED,
      userRole: "senior",
      targetType: "health_checkin",
    });
    try {
      startDraftAutosave();

      const headers = await withTimeout(authHeaders(), 8_000, "로그인 확인");

      // 연결을 막지 않도록 기억 불러오기는 백그라운드 — 실패해도 통화는 시작
      if (!draft) {
        void withTimeout(getCheckinOpeningMemory({ headers }), 8_000, "지난 안부 불러오기")
          .then((memory) => {
            openingMemoryRef.current = memory;
            questionPlanRef.current = buildCheckinQuestionPlan(new Date(), memory);
          })
          .catch((memoryError) => {
            console.warn("[checkin] opening memory skipped", memoryError);
          });
      } else {
        openingMemoryRef.current = null;
      }

      const session = await withTimeout(
        createRealtimeSession({
          data: {
            personaName: nickname,
            checkinMode: true,
            personaContext: [
              "오늘의 안부 통화 — 컨디션, 식사, 약, 기분을 부드럽게 여쭤봐 주세요.",
              resumeContext,
            ].filter(Boolean).join("\n\n"),
          },
          headers,
        }),
        30_000,
        "AI 연결 준비",
      );

      questionPlanRef.current = draft?.questionPlan?.length
        ? draft.questionPlan
        : buildCheckinQuestionPlan(new Date(), openingMemoryRef.current);
      machineStateRef.current = createInitialCheckinState(draft?.currentStepId ?? "Q1_MEAL", questionPlanRef.current);
      currentStepIdRef.current = draft?.currentStepId ?? "Q1_MEAL";
      currentQuestionRef.current = draft?.lastQuestion ?? getPlannedStepById("Q1_MEAL", questionPlanRef.current).prompt;
      if (!session.client_secret) throw new Error("연결 토큰 발급 실패");

      setConnectPhase("webrtc");
      const localStream = await withTimeout(micPromise, 25_000, "마이크 권한");
      localStreamRef.current = localStream;
      startMicSignalSampling(localStream);
      mutedRef.current = false;
      setMuted(false);
      setMicEnabled(false);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      startAudioQualitySampling();
      const remoteAudio = ensureRemoteAudioElement();

      // 네트워크 단절·서버측 종료 등으로 PeerConnection이 끊기면 자동 저장 흐름으로 진입
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if ((s === "failed" || s === "disconnected" || s === "closed") &&
            (statusRef.current === "live" || statusRef.current === "connecting")) {
          if (autoEndTriggeredRef.current) return;
          autoEndTriggeredRef.current = true;
          setTimeout(() => {
            pauseCall("disconnect", "연결이 끊어졌어요. 지금까지 대화를 일시저장했어요.");
          }, 300);
        }
      };

      pc.ontrack = (e) => {
        const audio = remoteAudio ?? ensureRemoteAudioElement();
        if (audio) {
          audio.srcObject = e.streams[0];
          audio.muted = false;
          audio.volume = 1;
          audio.play().catch((err) => {
            console.warn("[checkin-audio] playback blocked", err);
            setError("AI 목소리 재생이 차단됐어요. 휴대폰 무음 모드와 브라우저 권한을 확인해 주세요.");
          });
        }
        startRemoteAudioMonitoring(e.streams[0]);
      };
      localStream.getAudioTracks().forEach((track) => {
        pc.addTransceiver(track, {
          direction: "sendrecv",
          streams: [localStream],
        });
      });

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (ev) => {
        try { handleEvent(JSON.parse(ev.data)); } catch {}
      };
      dc.onopen = () => requestOpeningGreeting();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await withTimeout(
        fetch(OPENAI_REALTIME_CALLS_URL, {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${session.client_secret}`,
            "Content-Type": "application/sdp",
          },
          signal: AbortSignal.timeout(30_000),
        }),
        35_000,
        "음성 연결",
      );
      if (!sdpResponse.ok) throw new Error(`연결 실패 (${sdpResponse.status})`);
      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      remoteReadyRef.current = true;
      requestOpeningGreeting();

      setConnectPhase(null);
      setStatus("live");
      toast.success(draft ? "이어서 연결됐어요. 편하게 계속 이야기해 주세요." : "연결되었어요. 편하게 이야기해 주세요.");
    } catch (e: any) {
      console.error(e);
      setConnectPhase(null);
      const raw = e?.name === "NotAllowedError"
        ? "마이크 권한이 필요해요. 브라우저 설정에서 마이크를 허용해 주세요."
        : e?.message || String(e);
      setError(raw);
      setStatus("idle");
      void recordQuality("failed", { draftReason: "connect_failed" }).catch((err) =>
        console.warn("[checkin-quality] failed event failed", err),
      );
      cleanup();
      toast.error(raw.includes("시간이 초과") ? raw : `통화를 시작할 수 없어요. ${raw}`);
    }
  };

  const endCall = () => {
    autoEndTriggeredRef.current = true;
    cleanup();
    const finalTranscripts = transcriptsRef.current.filter((t) => t.text.trim().length > 0);
    const durationSec = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : 0;

    if (finalTranscripts.length < 2) {
      void recordQuality("too_short", {
        durationSec,
        transcripts: finalTranscripts,
      }).catch((e) => console.warn("[checkin-quality] too_short event failed", e));
      clearCheckinCallDraft();
      setDraft(null);
      setStatus("ended");
      toast("통화가 너무 짧아 분석은 생략했어요.");
      return;
    }

    // 통화 종료 즉시 완료 화면 — 저장·분석은 서버 백그라운드
    setStatus("ended");

    void (async () => {
      await Promise.race([
        Promise.all(pendingSerClipTasksRef.current),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      pendingSerClipTasksRef.current = [];

      queueCheckinSave({
        transcript: finalTranscripts.map((t) => ({ role: t.role, text: t.text })),
        stepAnswers: stepAnswersRef.current.length
          ? stepAnswersRef.current
          : buildCheckinStepAnswers(finalTranscripts),
        durationSec,
        shareWithGuardian: true,
        voiceProsodySummary: summarizeProsodySession(voiceProsodyTurnsRef.current),
        voiceSerTurnClips: voiceSerTurnClipsRef.current.length
          ? voiceSerTurnClipsRef.current
          : undefined,
      })
        .then((r) => {
          const res = r as AnalyzeResult;
          clearCheckinCallDraft();
          setDraft(null);
          setResult(res);
          onAnalyzed?.(res);
          void recordQuality("completed", {
            checkinId: res.checkin?.id ?? null,
            durationSec,
            transcripts: finalTranscripts,
            stepAnswers: stepAnswersRef.current.length
              ? stepAnswersRef.current
              : buildCheckinStepAnswers(finalTranscripts),
          }).catch((e) => console.warn("[checkin-quality] completed event failed", e));
          if (!res.processing) {
            void trackEvent({
              eventName: ANALYTICS_EVENTS.VOICE_CHECK_COMPLETED,
              userRole: "senior",
              targetType: "health_checkin",
              targetId: res.checkin?.id ?? null,
              metadata: {
                durationSeconds: durationSec,
                conditionLevel: res.checkin?.condition_level,
                recommendationTags: res.report?.recommendation_tags ?? [],
                voiceFusionSource: res.voiceAnalysis?.fusionSource ?? null,
              },
            });
          }
        })
        .catch((e) => {
          console.error("[checkin] analyze failed", e);
          saveDraftFromCurrentState("manual", finalTranscripts);
          setStatus("idle");
          toast.error("저장에 실패해서 통화를 일시저장했어요. 잠시 후 이어서 저장할 수 있어요.");
          void recordQuality("failed", {
            durationSec,
            transcripts: finalTranscripts,
            draftReason: "save_failed",
          }).catch((err) => console.warn("[checkin-quality] failed event failed", err));
          void trackEvent({
            eventName: ANALYTICS_EVENTS.VOICE_CHECK_FAILED,
            userRole: "senior",
            targetType: "health_checkin",
          });
        });
    })();
  };

  // 다른 곳(앱 부트 시 자동 재개 포함)에서 저장이 완료되면 부모에게 알린다.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as AnalyzeResult | undefined;
      if (detail) {
        setResult(detail);
        onAnalyzed?.(detail);
      }
    };
    window.addEventListener(CHECKIN_SAVED_EVENT, handler);
    return () => window.removeEventListener(CHECKIN_SAVED_EVENT, handler);
  }, [onAnalyzed]);

  // 빠른 저장 후 서버 백그라운드 리포트 완료까지 폴링
  useEffect(() => {
    if (!(result as AnalyzeResult & { processing?: boolean })?.processing) return;
    let cancelled = false;

    void (async () => {
      for (let i = 0; i < 40 && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const today = await getTodayCheckin({
            headers: await authHeaders(),
          } as Parameters<typeof getTodayCheckin>[0]);
          if (today?.report?.senior_report_text) {
            const full = { ...today, processing: false } as AnalyzeResult;
            setResult(full);
            onAnalyzed?.(full);
            toast.success("오늘의 안부 리포트가 준비됐어요.");
            return;
          }
        } catch {
          /* retry */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [(result as AnalyzeResult & { processing?: boolean })?.processing, onAnalyzed]);

  const toggleMute = () => {
    const stream = localStreamRef.current;
    const track = stream?.getAudioTracks()[0];
    if (!track) return;
    mutedRef.current = !mutedRef.current;
    track.enabled = !mutedRef.current
      && !isAssistantSpeakingRef.current
      && !pendingAutoEndRef.current;
    setMuted(mutedRef.current);
  };

  const discardDraft = () => {
    clearCheckinCallDraft();
    setDraft(null);
    setTranscripts([]);
    startedAtRef.current = null;
    toast("일시저장된 통화를 지웠어요.");
  };

  const saveReviewCorrections = async (answers: CheckinStepAnswer[]) => {
    if (answers.length === 0) return;
    setReviewSaving(true);
    try {
      const res = await amendTodayCheckinReview({
        headers: await authHeaders(),
        data: {
          stepAnswers: answers.map((answer) => ({
            stepId: answer.stepId,
            stepLabel: answer.stepLabel,
            question: answer.question,
            answer: answer.answer,
            answeredAt: answer.answeredAt,
          })),
        },
      } as Parameters<typeof amendTodayCheckinReview>[0]);
      const next = res as AnalyzeResult;
      setStepAnswers(answers);
      setResult(next);
      onAnalyzed?.(next);
      void recordQuality("review_corrected", {
        checkinId: next.checkin?.id ?? null,
        stepAnswers: answers,
        correctionCount: answers.length,
      }).catch((err) => console.warn("[checkin-quality] correction event failed", err));
      toast.success("수정한 내용까지 다시 저장했어요.");
    } catch (e) {
      console.error("[checkin-review] correction failed", e);
      toast.error(e instanceof Error ? e.message : "수정 저장에 실패했어요.");
    } finally {
      setReviewSaving(false);
    }
  };

  // 최신 endCall 함수를 ref에 동기화 (자동 종료 타이머에서 사용)
  useEffect(() => {
    endCallRef.current = endCall;
  });

  const isLive = status === "live";
  const isConnecting = status === "connecting";
  // 오늘 이미 완료 (서버에서 내려온 값) 또는 방금 통화 완료 후 분석까지 끝난 경우
  const showCompleted = alreadyDoneToday || status === "ended";

  // ✅ 오늘 통화 완료 — 분석 완료 리빌 카드
  if (showCompleted && status !== "analyzing") {
    const condition = result?.checkin?.condition_level ?? todayCondition ?? "normal";
    const moodRaw = (result?.checkin as any)?.mood_status ?? todayMood ?? null;
    const fusedEmotionKey = result?.voiceAnalysis?.fusedEmotionKey ?? null;
    const emotion = resolveEmotion(condition, moodRaw, fusedEmotionKey);
    const emotionAlert = resolveAlert(emotion.key, condition);
    const savedStepAnswers: CheckinStepAnswer[] = savedTurns
      .filter((turn) => (turn.user_answer ?? turn.corrected_answer ?? "").trim().length > 0)
      .map((turn, index) => ({
        stepId: (turn.step_id ?? "Q1_MEAL") as CheckinStepId,
        stepLabel: turn.step_label ?? stepLabel((turn.step_id ?? "Q1_MEAL") as CheckinStepId),
        question: turn.ai_question ?? "",
        answer: (turn.corrected_answer || turn.user_answer || "").trim(),
        answeredAt: index + 1,
        riskMatches: Array.isArray(turn.risk_matches) ? (turn.risk_matches as CheckinStepAnswer["riskMatches"]) : [],
      }));
    const savedTranscripts: Transcript[] = savedTurns.flatMap((turn, index) => {
      const ts = index * 2;
      const question = (turn.ai_question ?? "").trim();
      const answer = (turn.corrected_answer || turn.user_answer || "").trim();
      return [
        ...(question ? [{ role: "ai" as const, text: question, ts }] : []),
        ...(answer ? [{ role: "user" as const, text: answer, ts: ts + 1 }] : []),
      ];
    });
    const reviewAnswers = stepAnswers.length > 0 ? stepAnswers : savedStepAnswers;
    const reviewTranscripts = transcripts.filter((t) => t.text.trim().length > 0 && !t.partial);
    const fullConversation = reviewTranscripts.length > 0 ? reviewTranscripts : savedTranscripts;

    // 각성도(arousal 0~1) → 회전·궤도·호흡 속도 동적 조절
    // 높을수록(분노/긴장/기쁨) 빠르고 강렬, 낮을수록(평온/지침) 느리고 잔잔
    const a = emotion.arousal;
    const spinDur = `${Math.round(28 - a * 18)}s`;       // 28s → 10s
    const spinRevDur = `${Math.round(36 - a * 22)}s`;    // 36s → 14s
    const breatheDur = `${(5.4 - a * 2.4).toFixed(1)}s`; // 5.4s → 3.0s
    const auraDur = `${(4.6 - a * 2.6).toFixed(1)}s`;    // 4.6s → 2.0s
    const orbitDur = `${Math.round(14 - a * 8)}s`;       // 14s → 6s
    const orbitDur2 = `${Math.round(18 - a * 10)}s`;     // 18s → 8s
    const auraScale = 1 + a * 0.35;                       // 1.0 → 1.35
    const blurPx = `${Math.round(16 + a * 24)}px`;       // 16px → 40px

    return (
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-background p-6 shadow-soft sm:p-8"
        role="status"
        aria-live="polite"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-amber-warm to-sage animate-result-sheen" aria-hidden />
        <div className="flex flex-col items-center gap-5 text-center animate-result-pop">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
            <Sparkles className="h-4 w-4" />
            {(result as AnalyzeResult & { processing?: boolean })?.processing
              ? "저장 완료 · 리포트 작성 중"
              : "분석 완료"}
          </span>

          {/* 미래형 감정 시계(Emotion Orb) */}
          <div
            className="relative h-36 w-36 sm:h-40 sm:w-40"
            aria-label={`오늘 감정: ${emotion.label}`}
            role="img"
          >
            {/* 외곽 글로우 오라 — 각성도 높을수록 빠르고 크게 */}
            <div
              className="absolute inset-0 rounded-full animate-emotion-aura"
              style={{
                background: `radial-gradient(circle, ${emotion.glow} 0%, transparent 70%)`,
                filter: `blur(${blurPx})`,
                animationDuration: auraDur,
                ["--aura-scale" as any]: auraScale,
              }}
              aria-hidden
            />
            {/* 회전하는 conic 그라데이션 본체 */}
            <div
              className="absolute inset-0 rounded-full animate-emotion-spin"
              style={{ background: emotion.conic, animationDuration: spinDur }}
              aria-hidden
            />
            {/* 역방향 빛나는 호(arc) */}
            <div
              className="absolute inset-0 rounded-full animate-emotion-spin-rev"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.0) 200deg, rgba(255,255,255,0.85) 280deg, rgba(255,255,255,0.0) 340deg, transparent 360deg)",
                mixBlendMode: "overlay",
                animationDuration: spinRevDur,
              }}
              aria-hidden
            />
            {/* 유리 링 테두리 */}
            <div
              className="absolute inset-1 rounded-full border border-white/40"
              style={{
                boxShadow:
                  "inset 0 0 24px rgba(255,255,255,0.35), inset 0 0 60px rgba(0,0,0,0.15)",
              }}
              aria-hidden
            />
            {/* 중앙 유리 디스크 — 각성도 높을수록 빠르게 호흡 */}
            <div
              className="absolute inset-[14%] rounded-full backdrop-blur-md animate-emotion-breathe"
              style={{
                background:
                  "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.55), rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.08) 70%)",
                boxShadow:
                  "inset 0 2px 12px rgba(255,255,255,0.6), 0 8px 24px rgba(0,0,0,0.18)",
                animationDuration: breatheDur,
              }}
              aria-hidden
            />
            {/* 궤도 위를 도는 빛 입자 — 각성도 반영 */}
            <div className="absolute inset-0" aria-hidden>
              <div
                className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.95)] animate-emotion-orbit"
                style={{ ["--orbit-r" as any]: "58px", animationDuration: orbitDur }}
              />
              <div
                className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-emotion-orbit"
                style={{
                  ["--orbit-r" as any]: "66px",
                  animationDirection: "reverse",
                  animationDuration: orbitDur2,
                }}
              />
            </div>
            {/* 중앙 이모지 + 라벨 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
              <span className="text-4xl drop-shadow-md sm:text-5xl" aria-hidden>
                {emotion.emoji}
              </span>
              <span className="text-base font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] sm:text-lg">
                {emotion.label}
              </span>
            </div>
          </div>

          <div className="space-y-2 px-1">
            <p className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
              쨘, 오늘 기록이 정리됐어요
            </p>
            <p className="text-lg leading-relaxed text-foreground/75">
              오늘 상태는 <span className={cn("font-bold", emotion.textTone)}>{emotion.label}</span> 쪽으로 보여요.
            </p>
          </div>

          <CheckinStepReview
            answers={reviewAnswers}
            showConversation={showConversationReview}
            onToggleConversation={() => setShowConversationReview((v) => !v)}
            transcripts={fullConversation}
            saving={reviewSaving}
            onSave={saveReviewCorrections}
          />

          {emotionAlert.level !== "low" && (
            <div
              className={cn(
                "w-full rounded-2xl border px-4 py-4 text-left",
                emotionAlert.level === "high"
                  ? "border-primary/40 bg-primary/5"
                  : "border-amber-warm/40 bg-amber-warm/10",
              )}
              role="status"
            >
              <p
                className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  emotionAlert.level === "high" ? "text-primary" : "text-amber-warm",
                )}
              >
                {ALERT_LEVEL_LABEL[emotionAlert.level]}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/85">{emotionAlert.message}</p>
              {emotionAlert.hotline && emotionAlert.hotline.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {emotionAlert.hotline.map((line) => (
                    <li key={line.tel}>
                      <a
                        href={`tel:${line.tel}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {line.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <EmotionRecommendationCollection
            className="w-full"
            condition={result?.checkin?.condition_level ?? todayCondition}
            mood={result?.checkin?.mood_status ?? todayMood}
            fusedEmotionKey={result?.voiceAnalysis?.fusedEmotionKey ?? null}
            voiceAnalysisSource={result?.voiceAnalysis?.fusionSource ?? null}
            checkinId={result?.checkin?.id ?? null}
          />

          <NextCallNotice />

          {error && (
            <div className="w-full rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ───────────────────────── 통화 중: 풀스크린 채팅 레이아웃 ─────────────────────────
  if (isLive) {
    // 부모 컨테이너에 transform/animate-rise-in 등이 걸려 있어 position: fixed 가
    // viewport 가 아닌 부모 박스에 갇히는 문제가 있어 Portal 로 body 에 직접 렌더한다.
    const overlay = (
      <>
        <div
          ref={cardRef}
          className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-rose-soft via-amber-soft to-background"
          role="dialog"
          aria-label="안부 통화 중"
        >
          {/* 상단 상태 바 */}
          <header
            className="flex items-center justify-between border-b border-border/40 bg-background/70 px-4 py-3 backdrop-blur"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 text-base font-semibold text-foreground/80">
              <Sparkles className="h-4 w-4 text-primary" /> 안부 통화
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-sage/15 px-3 py-1.5 text-base font-bold text-sage">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sage" />
              </span>
              통화 중
            </span>
          </header>

          <div className="border-b border-border/30 bg-background/55 px-4 py-3 text-center backdrop-blur">
            <p
              className={cn(
                "mx-auto max-w-2xl rounded-2xl px-4 py-3 text-base font-bold",
                turnState === "ai_speaking"
                  ? "bg-primary/10 text-primary"
                  : turnState === "user_can_speak"
                    ? "bg-sage/15 text-sage"
                    : turnState === "ending"
                      ? "bg-amber-100 text-amber-900"
                    : "bg-muted text-foreground/65",
              )}
            >
              {turnState === "ai_speaking" && "AI가 질문하고 있어요. 질문이 끝나면 말씀해 주세요."}
              {turnState === "user_can_speak" && (userSpeaking ? "말씀을 듣고 있어요. 기록 중이에요." : "질문이 끝났어요. 지금 말씀해 주세요.")}
              {turnState === "ending" && "AI가 마무리 인사 중이에요. 잠시 후 통화가 자동으로 끝나요."}
              {turnState === "idle" && "통화를 준비하고 있어요."}
            </p>
            {urgentNotice && (
              <div className="mx-auto mt-3 max-w-2xl rounded-2xl border-2 border-destructive/50 bg-destructive/10 px-4 py-3 text-left shadow-soft">
                <p className="text-base font-bold text-destructive">긴급 확인 필요</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-destructive/90">
                  {urgentNotice}
                </p>
              </div>
            )}
          </div>

          {/* 채팅 영역 — 화면 대부분을 차지 */}
          <div className="flex-1 overflow-y-auto px-4 py-5">
            {transcripts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-foreground/60">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-lg font-medium">편하게 이야기해 주세요…</p>
                <p className="text-sm text-foreground/50">대화 내용이 여기에 표시돼요.</p>
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                {transcripts.map((t, i) => (
                  <div
                    key={i}
                    className={`flex ${t.role === "ai" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-fluid-base leading-relaxed shadow-soft ${
                        t.role === "ai"
                          ? "bg-background text-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {t.text}
                      {t.partial && <span className="ml-1 animate-pulse">▍</span>}
                    </div>
                  </div>
                ))}
                {userSpeaking && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-primary/90 px-4 py-3 text-fluid-base font-bold leading-relaxed text-primary-foreground shadow-soft">
                      <span className="mr-2 align-middle">말씀 기록 중</span>
                      <span className="inline-flex items-end gap-1 align-middle" aria-hidden>
                        <span className="h-2 w-1.5 animate-[pulse_0.8s_ease-in-out_infinite] rounded-full bg-current opacity-70" />
                        <span className="h-3 w-1.5 animate-[pulse_0.8s_ease-in-out_0.12s_infinite] rounded-full bg-current opacity-80" />
                        <span className="h-2.5 w-1.5 animate-[pulse_0.8s_ease-in-out_0.24s_infinite] rounded-full bg-current opacity-70" />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </div>

          {/* 하단 컨트롤 — 마이크 / 종료 / 자동저장 안내 */}
          <footer
            className="border-t border-border/40 bg-background/85 px-4 pt-4 backdrop-blur"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="mx-auto flex max-w-2xl items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-border bg-background text-foreground transition-transform active:scale-95"
                  aria-label={muted ? "마이크 켜기" : "마이크 끄기"}
                >
                  {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </button>
                <span className="text-xs font-semibold text-foreground/70">
                  {muted ? "마이크 꺼짐" : "마이크"}
                </span>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={endCall}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-transform active:scale-95"
                  aria-label="통화 종료"
                >
                  <PhoneOff className="h-9 w-9" />
                </button>
                <span className="text-sm font-bold text-destructive">통화 끝내기</span>
              </div>
            </div>

            <p className="mx-auto mt-3 max-w-2xl text-center text-xs text-foreground/60">
              <span className="font-semibold text-primary">자동 저장 중</span> · 화면을 닫거나 연결이 끊겨도 대화는 안전하게 저장돼요.
            </p>

            {error && (
              <div className="mx-auto mt-3 max-w-2xl rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </footer>

        </div>
      </>
    );

    return (
      <>
        {/* 카드 자리 유지 — 부모 레이아웃이 무너지지 않도록 */}
        <div aria-hidden className="h-[280px] sm:h-[360px]" />
        {typeof document !== "undefined"
          ? createPortal(overlay, document.body)
          : null}
      </>
    );
  }

  // ───────────────────────── idle / connecting / analyzing 카드 ─────────────────────────
  return (
    <div
      ref={cardRef}
      className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-rose-soft via-background to-amber-soft p-7 shadow-elevated scroll-mt-20 sm:p-10 animate-rise-in"
    >
      {/* 배경 장식 */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/8 blur-3xl animate-blob" aria-hidden />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-44 w-44 rounded-full bg-amber-warm/10 blur-3xl animate-blob delay-300" aria-hidden />

      {/* 헤더 */}
      <div className="relative flex items-center justify-between mb-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-4 py-1.5 text-sm font-semibold text-foreground/70 backdrop-blur">
          <Sparkles className="h-4 w-4 text-primary" /> 오늘의 안부 통화
        </span>
        {!isConnecting && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/15 px-3 py-1.5 text-xs font-bold text-sage">
            <span className="h-1.5 w-1.5 rounded-full bg-sage animate-pulse" />
            AI 준비 완료
          </span>
        )}
      </div>

      {/* 중앙: 펄스 링 + 버튼 */}
      <div className="relative flex flex-col items-center gap-8">
        <div className="relative flex h-52 w-52 items-center justify-center">
          {/* 펄스 링 — idle 상태에서만 */}
          {!isConnecting && (
            <>
              <div className="absolute h-52 w-52 rounded-full border-2 border-primary/12 animate-pulse-ring" />
              <div className="absolute h-44 w-44 rounded-full border-2 border-primary/18 animate-pulse-ring delay-500" />
              <div className="absolute h-36 w-36 rounded-full border-2 border-primary/26 animate-pulse-ring delay-200" />
            </>
          )}
          {/* 연결 중 스피너 링 */}
          {isConnecting && (
            <div className="absolute h-44 w-44 rounded-full border-4 border-primary/20 border-t-primary animate-spin" style={{ animationDuration: "1.2s" }} />
          )}

          {/* 메인 버튼 */}
          <button
            type="button"
            onClick={startCall}
            disabled={isConnecting || alreadyDoneToday}
            className={cn(
              "relative z-10 flex h-28 w-28 items-center justify-center rounded-full transition-all duration-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:h-32 sm:w-32",
              "bg-primary text-primary-foreground",
              "shadow-[0_0_0_8px_oklch(0.52_0.16_22_/_0.12),0_12px_36px_-8px_oklch(0.52_0.16_22_/_0.45)]",
              !isConnecting && !alreadyDoneToday && "animate-float hover:shadow-[0_0_0_14px_oklch(0.52_0.16_22_/_0.18),0_16px_48px_-8px_oklch(0.52_0.16_22_/_0.55)]",
            )}
            aria-label={alreadyDoneToday ? "오늘 통화 완료" : "안부 통화 시작"}
          >
            {isConnecting ? (
              <Loader2 className="h-12 w-12 animate-spin" />
            ) : (
              <Phone className="h-12 w-12" />
            )}
          </button>
        </div>

        {/* 사운드 웨이브 바 */}
        <div className="flex items-end justify-center gap-[3px] h-10" aria-hidden>
          {[35, 65, 50, 90, 60, 100, 55, 80, 45, 70, 40].map((h, i) => (
            <div
              key={i}
              className={cn(
                "w-[5px] rounded-full transition-all duration-300",
                isConnecting
                  ? "bg-primary/70 animate-wave"
                  : "bg-primary/25",
              )}
              style={{
                height: `${h}%`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>

        <div className="text-center space-y-1.5">
          <p className="text-xl font-bold text-foreground">
            {status === "idle" && (draft ? "이전 통화를 이어서 할 수 있어요" : "버튼을 눌러 통화를 시작해요")}
            {status === "connecting" && connectPhase === "session" && "AI 연결을 준비하고 있어요…"}
            {status === "connecting" && connectPhase === "webrtc" && "마이크와 음성 연결을 맺고 있어요…"}
            {status === "connecting" && !connectPhase && "AI와 연결하고 있어요…"}
            {status === "analyzing" && "통화 내용을 정리하고 있어요…"}
          </p>
          {status === "idle" && !draft && (
            <p className="text-sm text-foreground/50">
              매일 한 번, 건강과 기분을 확인해드려요
            </p>
          )}
          {status === "idle" && draft && (
            <div className="mx-auto mt-3 max-w-sm rounded-2xl border border-primary/20 bg-background/85 p-4 shadow-soft">
              <p className="text-sm font-bold text-primary">
                {draft.transcript.length}개 대화가 일시저장되어 있어요
              </p>
              <p className="mt-1 text-xs text-foreground/55">
                통화 버튼을 누르면 이어서 질문해드려요.
              </p>
              <button
                type="button"
                onClick={discardDraft}
                className="mt-3 text-xs font-semibold text-foreground/55 underline underline-offset-4"
              >
                처음부터 다시 하기
              </button>
            </div>
          )}
          {status === "connecting" && (
            <p className="text-sm text-foreground/50">
              {connectPhase === "webrtc"
                ? "마이크 허용 창이 보이면 허용을 눌러 주세요"
                : "잠시만 기다려 주세요"}
            </p>
          )}
        </div>
      </div>

      {status === "analyzing" && <AnalysisProgress />}

      {error && (
        <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

    </div>
  );
}

function CheckinStepReview({
  answers,
  transcripts,
  showConversation,
  onToggleConversation,
  saving,
  onSave,
}: {
  answers: CheckinStepAnswer[];
  transcripts: Transcript[];
  showConversation: boolean;
  onToggleConversation: () => void;
  saving: boolean;
  onSave: (answers: CheckinStepAnswer[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<CheckinStepAnswer[]>(answers);

  useEffect(() => {
    if (!editing) setDraftAnswers(answers);
  }, [answers, editing]);

  const visibleAnswers = answers.filter((answer) => answer.answer.trim().length > 0);
  const editableAnswers = draftAnswers.filter((answer) => answer.answer.trim().length > 0);
  const displayAnswers = editing ? editableAnswers : visibleAnswers;
  const urgentCount = visibleAnswers.reduce(
    (sum, answer) => sum + answer.riskMatches.filter((risk) => risk.severity === "urgent").length,
    0,
  );

  if (visibleAnswers.length === 0 && transcripts.length === 0) return null;

  return (
    <section className="w-full rounded-[1.5rem] border border-border/70 bg-background/90 text-left shadow-soft">
      <button
        type="button"
        onClick={onToggleConversation}
        className="flex w-full items-center gap-3 p-4 text-left"
        aria-expanded={showConversation}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            urgentCount > 0 ? "bg-destructive/10 text-destructive" : "bg-sage/15 text-sage",
          )}
        >
          {urgentCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-foreground">오늘 이렇게 기록했어요</p>
          <p className="mt-0.5 truncate text-sm text-foreground/60">
            {visibleAnswers.length > 0 ? `답변 ${visibleAnswers.length}개 저장 · 눌러서 대화 보기` : "눌러서 오늘 대화 보기"}
          </p>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-foreground/45 transition-transform", showConversation && "rotate-180")} />
      </button>

      {showConversation && urgentCount > 0 && (
        <div className="mx-4 mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-bold text-destructive">긴급 확인 표현 {urgentCount}건</p>
          <p className="mt-1 text-sm leading-relaxed text-destructive/90">
            쇼크, 호흡 곤란, 의식 저하 같은 표현은 출처 기반 근거와 함께 보호자 확인 대상으로 기록돼요.
          </p>
        </div>
      )}

      {showConversation && displayAnswers.length > 0 && (
        <ul className="space-y-2.5 px-4 pb-4">
          {displayAnswers.map((answer, index) => {
            const hasRisk = answer.riskMatches.length > 0;
            return (
              <li
                key={`${answer.stepId}-${answer.answeredAt}-${index}`}
                className={cn(
                  "rounded-2xl border px-4 py-3",
                  hasRisk ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-surface/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-foreground/50">{answer.stepLabel}</p>
                  {hasRisk && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
                      확인 필요
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-foreground/60">
                  {answer.question}
                </p>
                {editing ? (
                  <textarea
                    value={answer.answer}
                    onChange={(event) => {
                      const next = event.target.value;
                      setDraftAnswers((prev) =>
                        prev.map((item) =>
                          item.answeredAt === answer.answeredAt && item.stepId === answer.stepId
                            ? { ...item, answer: next }
                            : item,
                        ),
                      );
                    }}
                    className="mt-2 min-h-20 w-full resize-none rounded-2xl border border-border bg-background px-3 py-2 text-base font-bold leading-relaxed text-foreground outline-none focus:border-primary"
                    aria-label={`${answer.stepLabel} 답변 수정`}
                  />
                ) : (
                  <p className="mt-2 text-base font-bold leading-relaxed text-foreground">
                    {answer.answer}
                  </p>
                )}
                {hasRisk && (
                  <div className="mt-2 space-y-1">
                    {answer.riskMatches.map((risk) => (
                      <p key={`${risk.category}-${risk.matchedTerms.join(",")}`} className="text-xs font-semibold leading-relaxed text-destructive/90">
                        근거: {risk.matchedTerms.join(", ")} · {risk.sources.map((s) => s.name).join(", ")}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showConversation && visibleAnswers.length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraftAnswers(answers);
                  setEditing(false);
                }}
                disabled={saving}
                className="rounded-full border border-border bg-background px-4 py-3 text-sm font-bold text-foreground/70 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  const cleaned = draftAnswers
                    .map((answer) => ({ ...answer, answer: answer.answer.trim() }))
                    .filter((answer) => answer.answer.length > 0);
                  await onSave(cleaned);
                  setEditing(false);
                }}
                disabled={saving}
                className="rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "저장 중…" : "수정 저장"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftAnswers(answers);
                setEditing(true);
              }}
              className="col-span-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary"
            >
              잘못 기록된 답변 수정하기
            </button>
          )}
        </div>
      )}

      {showConversation && transcripts.length > 0 && (
        <div className="border-t border-border/60 px-4 py-4">
            <p className="mb-2 text-xs font-bold text-foreground/50">원문 대화</p>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl bg-surface/70 p-3">
              {transcripts.map((turn, index) => (
                <div
                  key={`${turn.ts}-${index}`}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    turn.role === "ai"
                      ? "bg-background text-foreground/75"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  <span className="mb-0.5 block text-[11px] font-bold opacity-70">
                    {turn.role === "ai" ? "AI" : "나"}
                  </span>
                  {turn.text}
                </div>
              ))}
            </div>
        </div>
      )}
    </section>
  );
}

/**
 * 다음 통화 가능 시각 안내 (KST 기준 자정 = 다음 날 00:00).
 * 완료 화면에서는 긴 문장 대신 작고 가벼운 게이지 칩으로만 보여준다.
 */
function NextCallNotice() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // KST 기준 다음 자정 계산
  const kstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const nextMidnightKst = new Date(kstNow);
  nextMidnightKst.setHours(24, 0, 0, 0);

  const diffMs = nextMidnightKst.getTime() - kstNow.getTime();
  const totalMin = Math.max(0, Math.floor(diffMs / 60_000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;

  const remainText =
    hours > 0
      ? `${hours}시간 ${minutes}분 후`
      : `${minutes}분 후`;
  const progress = Math.min(100, Math.max(0, (diffMs / 86_400_000) * 100));

  // 사용자 표시용 날짜 (한국어, KST)
  const tomorrowLabel = nextMidnightKst.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div
      className="w-full"
      aria-label={`다음 통화는 ${tomorrowLabel} 새벽 0시부터 가능합니다. ${remainText}에 다시 가능해요.`}
      title={`다음 통화: ${tomorrowLabel} 새벽 0시`}
    >
      <div className="relative mx-auto flex min-h-12 w-full max-w-[320px] items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 px-4 text-primary shadow-sm">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary/15 transition-[width] duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
        <span className="relative flex items-center gap-2 text-sm font-bold">
          <Moon className="h-4 w-4" />
          {remainText}에 다시 가능해요
        </span>
      </div>
    </div>
  );
}


function AnalysisProgress() {
  const steps = ["음성 정리", "상태 확인", "오늘 기록 준비"];

  return (
    <div className="mt-6 rounded-2xl border border-border/70 bg-background/85 p-5 text-foreground shadow-soft backdrop-blur animate-rise-in">
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <span className="absolute h-12 w-12 rounded-full border-2 border-primary/20" />
          <span className="absolute h-12 w-12 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          <Sparkles className="h-6 w-6 text-primary animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-foreground">통화 내용을 분석하고 있어요</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            잠시 후 오늘 기록이 정리되어 나타나요
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {steps.map((step, i) => (
          <div key={step} className="rounded-xl bg-surface px-3 py-2 text-center">
            <span
              className="mx-auto mb-1 block h-1.5 rounded-full bg-primary/70 animate-analysis-step"
              style={{ animationDelay: `${i * 0.35}s` }}
            />
            <span className="text-xs font-bold text-foreground/70">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
