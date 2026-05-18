import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Mic, MicOff, PhoneOff, Phone, Sparkles, Loader2, Moon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createRealtimeSession } from "@/lib/voice-test-actions";
import { analyzeAndSaveCheckin } from "@/lib/checkin/checkin-actions";
import {
  queueCheckinSave,
  CHECKIN_SAVED_EVENT,
  clearCheckinCallDraft,
  loadCheckinCallDraft,
  saveCheckinCallDraft,
  type CheckinCallDraft,
} from "@/lib/checkin/background-save";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { ANALYTICS_EVENTS } from "@/lib/analytics/eventNames";
import { resolveEmotion } from "@/lib/checkin/emotion";

type Transcript = { role: "user" | "ai"; text: string; ts: number; partial?: boolean };
type Status = "idle" | "connecting" | "live" | "ended" | "analyzing";

type AnalyzeResult = Awaited<ReturnType<typeof analyzeAndSaveCheckin>>;

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
}: {
  nickname?: string;
  onAnalyzed?: (result: AnalyzeResult) => void;
  alreadyDoneToday?: boolean;
  todayCondition?: "good" | "normal" | "caution" | "urgent" | null;
  todayMood?: string | null;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [muted, setMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [draft, setDraft] = useState<CheckinCallDraft | null>(null);
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

  // 음성 안정화용 refs
  // - AI 발화 직후 짧은 잔향만 거르고, 사용자 답변은 최대한 보존
  // - 같은 transcript가 짧은 간격으로 중복되면 무시
  // - 응답 생성 중복 락
  const isAssistantSpeakingRef = useRef(false);
  const lastAssistantAudioAtRef = useRef(0);
  const isProcessingTurnRef = useRef(false);
  const lastUserTranscriptRef = useRef("");
  const lastUserTranscriptAtRef = useRef(0);
  const assistantSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMicEnabled = (enabled: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
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
      durationSec,
      shareWithGuardian: true,
      startedAt: startedAtRef.current,
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
    startedAtRef.current = saved.startedAt ?? Date.now() - saved.durationSec * 1000;
  }, []);

  // 통화 시작 시 카드를 화면 상단으로 스크롤 (모바일에서 통화 화면이 잘 보이도록)
  useEffect(() => {
    if (status === "live" || status === "connecting") {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  // transcripts/status 변경을 ref에 동기화 — 언마운트 시점에서도 최신 값 참조 가능
  useEffect(() => { transcriptsRef.current = transcripts; }, [transcripts]);
  useEffect(() => { statusRef.current = status; }, [status]);

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
    try { dcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    dcRef.current = null;
    localStreamRef.current = null;
    pcRef.current = null;
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
    setTranscripts((prev) => [...prev, { role: "user", text, ts: now }]);
  };

  const handleUserTranscript = (msg: any) => {
    const text = ((msg.transcript ?? msg.text ?? msg.delta ?? "") as string).trim();
    if (!text) return;

    // AI 음성이 막 끝난 직후 아주 짧은 잔향만 무시.
    // 실제 답변까지 버리면 서버/모바일 환경에서 기록 누락이 생긴다.
    if (isAssistantSpeakingRef.current && Date.now() - lastAssistantAudioAtRef.current < 180) return;

    if (!isMeaningfulUserText(text)) return;

    appendUserTranscript(text);

    // 사용자 음성 종료 의사 감지
    if (/그만|끊어|끊을|종료|안녕히\s*계세요|이만/.test(text) && !autoEndTriggeredRef.current) {
      autoEndTriggeredRef.current = true;
      setTimeout(() => endCallRef.current(), 1500);
    }
  };

  const handleEvent = (msg: any) => {
    const t = msg.type as string;
    if (
      t === "conversation.item.input_audio_transcription.completed" ||
      t === "conversation.item.input_audio_transcription.done" ||
      t === "input_audio_transcription.completed"
    ) {
      handleUserTranscript(msg);
    } else if (t === "response.created") {
      isProcessingTurnRef.current = true;
    } else if (t === "response.audio.delta" || t === "response.audio_transcript.delta") {
      // AI 음성 출력 시작/진행 중
      isAssistantSpeakingRef.current = true;
      lastAssistantAudioAtRef.current = Date.now();
      if (assistantSilenceTimerRef.current) {
        clearTimeout(assistantSilenceTimerRef.current);
        assistantSilenceTimerRef.current = null;
      }
      if (t === "response.audio_transcript.delta") {
        const delta = msg.delta || "";
        setTranscripts((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "ai" && last.partial) {
            return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
          }
          return [...prev, { role: "ai", text: delta, ts: Date.now(), partial: true }];
        });
      }
    } else if (t === "response.audio_transcript.done") {
      const finalText = (msg.transcript || "") as string;
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "ai" && last.partial) {
          return [...prev.slice(0, -1), { ...last, partial: false, text: finalText || last.text }];
        }
        return prev;
      });
      // AI 종료 신호 감지 → 자동 종료
      if (/통화를\s*마치겠습니다/.test(finalText) && !autoEndTriggeredRef.current) {
        autoEndTriggeredRef.current = true;
        // 마지막 오디오 재생을 위해 약간 대기 후 종료
        setTimeout(() => endCallRef.current(), 2500);
      }
    } else if (t === "response.done" || t === "response.audio.done") {
      // AI 발화가 완전히 끝나면 짧은 여유 후 입력 다시 허용
      // (길게 막으면 사용자의 빠른 답변이 전사에서 누락된다)
      if (assistantSilenceTimerRef.current) clearTimeout(assistantSilenceTimerRef.current);
      assistantSilenceTimerRef.current = setTimeout(() => {
        isAssistantSpeakingRef.current = false;
        isProcessingTurnRef.current = false;
      }, 220);
    } else if (t === "error") {
      const errMsg = (msg.error?.message ?? "") as string;
      // OpenAI Realtime 의 경쟁 상태(race) 에러 — 첫 응답은 정상 진행 중이고
      // 두 번째 response.create 만 거부된 무해한 케이스. UX 흐름 끊지 않게 무시.
      // 예) "Conversation already has an active response in progress"
      if (/active response in progress|already has an active/i.test(errMsg)) {
        return;
      }
      isProcessingTurnRef.current = false;
      setError(errMsg || "통화 중 오류가 발생했어요");
    }
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
    setError(null);
    const resumeContext = buildResumeContext();
    if (!draft) setTranscripts([]);
    setResult(null);
    setStatus("connecting");
    autoEndTriggeredRef.current = false;
    startedAtRef.current = draft?.startedAt ?? Date.now();
    void trackEvent({
      eventName: ANALYTICS_EVENTS.VOICE_CHECK_STARTED,
      userRole: "senior",
      targetType: "health_checkin",
    });
    try {
      const session = await createRealtimeSession({
        data: {
          personaName: nickname,
          personaContext: [
            "오늘의 안부 통화 — 컨디션, 식사, 약, 기분을 부드럽게 여쭤봐 주세요.",
            resumeContext,
          ].filter(Boolean).join("\n\n"),
        },
      });
      if (!session.client_secret) throw new Error("연결 토큰 발급 실패");

      // 마이크 입력 보정: 에코 제거 + 노이즈 억제 + 자동 게인 (브라우저 수준 1차 필터)
      const localStream = await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        })
        .catch(async () => navigator.mediaDevices.getUserMedia({ audio: true }));
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

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
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
          audioElRef.current.muted = false;
          audioElRef.current.volume = 1;
          audioElRef.current.play().catch((err) => {
            console.warn("[checkin-audio] playback blocked", err);
            setError("AI 목소리 재생이 차단됐어요. 휴대폰 무음 모드와 브라우저 권한을 확인해 주세요.");
          });
        }
      };
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (ev) => {
        try { handleEvent(JSON.parse(ev.data)); } catch {}
      };
      dc.onopen = () => {
        dc.send(JSON.stringify({
          type: "response.create",
          response: { modalities: ["audio", "text"] },
        }));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${session.client_secret}`,
            "Content-Type": "application/sdp",
          },
        },
      );
      if (!sdpResponse.ok) throw new Error(`연결 실패 (${sdpResponse.status})`);
      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setStatus("live");
      toast.success(draft ? "이어서 연결됐어요. 편하게 계속 이야기해 주세요." : "연결되었어요. 편하게 이야기해 주세요.");
    } catch (e: any) {
      console.error(e);
      setError(e.message || String(e));
      setStatus("idle");
      cleanup();
      toast.error("통화를 시작할 수 없어요");
    }
  };

  const endCall = () => {
    autoEndTriggeredRef.current = true;
    cleanup();
    const finalTranscripts = transcripts.filter((t) => t.text.trim().length > 0);
    const durationSec = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : 0;

    if (finalTranscripts.length < 2) {
      clearCheckinCallDraft();
      setDraft(null);
      setStatus("ended");
      toast("통화가 너무 짧아 분석은 생략했어요.");
      return;
    }

    // 분석 결과가 준비되는 동안 전문적인 진행 상태를 보여준다.
    setStatus("analyzing");

    queueCheckinSave({
      transcript: finalTranscripts.map((t) => ({ role: t.role, text: t.text })),
      durationSec,
      shareWithGuardian: true,
    })
      .then((r) => {
        const res = r as AnalyzeResult;
        clearCheckinCallDraft();
        setDraft(null);
        setResult(res);
        setStatus("ended");
        onAnalyzed?.(res);
        void trackEvent({
          eventName: ANALYTICS_EVENTS.VOICE_CHECK_COMPLETED,
          userRole: "senior",
          targetType: "health_checkin",
          targetId: res.checkin?.id ?? null,
          metadata: {
            durationSeconds: durationSec,
            conditionLevel: res.checkin?.condition_level,
            recommendationTags: res.report?.recommendation_tags ?? [],
          },
        });
        void trackEvent({
          eventName: ANALYTICS_EVENTS.REPORT_CREATED,
          userRole: "senior",
          targetType: "health_report",
          targetId: res.report?.id ?? null,
        });
        void trackEvent({
          eventName: ANALYTICS_EVENTS.REPORT_SHARED_TO_CAREGIVER,
          userRole: "senior",
          targetType: "health_report",
          targetId: res.report?.id ?? null,
        });
      })
      .catch((e) => {
        console.error("[checkin] analyze failed", e);
        saveDraftFromCurrentState("manual", finalTranscripts);
        setStatus("idle");
        toast.error("저장에 실패해서 통화를 일시저장했어요. 잠시 후 이어서 저장할 수 있어요.");
        void trackEvent({
          eventName: ANALYTICS_EVENTS.VOICE_CHECK_FAILED,
          userRole: "senior",
          targetType: "health_checkin",
        });
      });
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

  const toggleMute = () => {
    const stream = localStreamRef.current;
    const track = stream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const discardDraft = () => {
    clearCheckinCallDraft();
    setDraft(null);
    setTranscripts([]);
    startedAtRef.current = null;
    toast("일시저장된 통화를 지웠어요.");
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
    const emotion = resolveEmotion(condition, moodRaw);

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
            분석 완료
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

          <audio ref={audioElRef} autoPlay playsInline className="pointer-events-none absolute h-px w-px opacity-0" />
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
            {status === "connecting" && "AI와 연결하고 있어요…"}
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
              잠시만 기다려 주세요
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

      <audio ref={audioElRef} autoPlay playsInline className="pointer-events-none absolute h-px w-px opacity-0" />
    </div>
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
