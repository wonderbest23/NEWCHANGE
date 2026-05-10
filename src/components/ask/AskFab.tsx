import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link, useRouterState } from "@tanstack/react-router";
import { Mic, MicOff, Plus, Volume2, VolumeX, X, Loader2, Sparkles, AlertTriangle, Send, Lightbulb, ChevronRight, Pencil } from "lucide-react";
import { askSenior, type AskAnswer } from "@/lib/ask/ask-actions";
import { synthesizeAnswerSpeech } from "@/lib/ask/tts-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/mock-auth";
import { Phone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Phase = "idle" | "listening" | "review" | "thinking" | "answer";

// 브라우저 SpeechRecognition 타입(최소)
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r: SR = new Ctor();
  r.lang = "ko-KR";
  r.continuous = false;
  r.interimResults = true;
  return r;
}

// OpenAI TTS 재생 — 브라우저 SpeechSynthesis 대신 자연스러운 한국어 음성 사용
let currentAudio: HTMLAudioElement | null = null;
const ttsCache = new Map<string, string>(); // text -> object URL

function stopSpeak() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      /* noop */
    }
    currentAudio = null;
  }
  if (typeof window !== "undefined") {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
  }
}

async function speak(
  text: string,
  fetchAudio: (input: { data: { text: string } }) => Promise<{ audio: string; mime: string }>,
  opts?: { onEnd?: () => void; onStart?: () => void; onError?: (e: unknown) => void },
) {
  if (typeof window === "undefined") return;
  stopSpeak();
  try {
    let url = ttsCache.get(text);
    if (!url) {
      const res = await fetchAudio({ data: { text } });
      const bin = atob(res.audio);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: res.mime || "audio/mpeg" });
      url = URL.createObjectURL(blob);
      ttsCache.set(text, url);
    }
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onplay = () => opts?.onStart?.();
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      opts?.onEnd?.();
    };
    audio.onerror = (e) => {
      if (currentAudio === audio) currentAudio = null;
      opts?.onError?.(e);
      opts?.onEnd?.();
    };
    await audio.play();
  } catch (e) {
    console.error("[tts] play failed", e);
    opts?.onError?.(e);
    opts?.onEnd?.();
  }
}

function buildSpeakText(a: AskAnswer): string {
  const parts: string[] = [];
  if (a.title) parts.push(a.title);
  if (a.summary) parts.push(a.summary);
  a.steps.forEach((s, i) => parts.push(`${i + 1}단계, ${s.title}. ${s.detail}`));
  if (a.caution) parts.push(`주의하세요. ${a.caution}`);
  return parts.join(". ");
}

export function AskFab() {
  const { userId, isAuthenticated } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCommunity = pathname.startsWith("/community");
  const ask = useServerFn(askSenior);
  const tts = useServerFn(synthesizeAnswerSpeech);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [supported, setSupported] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const recRef = useRef<SR | null>(null);

  // 안부 통화 중에는 + 물어보기 버튼이 화면을 가리지 않도록 숨긴다
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setCallActive(!!detail?.active);
    };
    window.addEventListener("checkin-call-active", handler);
    return () => window.removeEventListener("checkin-call-active", handler);
  }, []);

  const playFullAnswer = useCallback(
    (a: AskAnswer) => {
      void speak(buildSpeakText(a), tts, {
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
        onError: () => toast.error("음성을 재생하지 못했어요. 잠시 후 다시 시도해 주세요."),
      });
    },
    [tts],
  );

  const toggleSpeak = useCallback(() => {
    if (isSpeaking) {
      stopSpeak();
      setIsSpeaking(false);
    } else if (answer) {
      playFullAnswer(answer);
    }
  }, [isSpeaking, answer, playFullAnswer]);

  useEffect(() => {
    setSupported(!!getRecognition());
  }, []);

  const reset = useCallback(() => {
    recRef.current?.abort();
    recRef.current = null;
    setTranscript("");
    setInterim("");
    setAnswer(null);
    setPhase("idle");
    stopSpeak();
    setIsSpeaking(false);
  }, []);

  const close = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);

  const noSpeechRetryRef = useRef(0);
  const stopListening = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, []);

  const startListening = useCallback(() => {
    // 1) 보안 컨텍스트 체크 — 브라우저는 HTTPS/localhost 외에서 마이크를 차단함
    if (typeof window !== "undefined") {
      const { protocol, hostname } = window.location;
      const secure =
        protocol === "https:" ||
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";
      if (!secure) {
        toast.error(
          `음성은 HTTPS 또는 localhost 에서만 사용할 수 있어요. (현재: ${hostname}) 글자로 입력해 주세요.`,
        );
        return;
      }
    }

    const r = getRecognition();
    if (!r) {
      setSupported(false);
      toast.error("이 브라우저에서는 음성 인식을 지원하지 않아요. 글자로 입력해 주세요.");
      return;
    }

    setTranscript("");
    setInterim("");
    setPhase("listening");
    noSpeechRetryRef.current = 0;

    r.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (finalText) {
        setTranscript((prev) => (prev + " " + finalText).trim());
        // 사용자 발화가 들어오면 재시도 카운터 리셋
        noSpeechRetryRef.current = 0;
      }
      setInterim(interimText);
    };

    r.onerror = (e: any) => {
      const code = e?.error as string | undefined;
      console.error("[speech]", code, e);
      // no-speech 는 사용자가 침묵한 것 — 1회 자동 재시작 후, 그래도 없으면 안내
      if (code === "no-speech") {
        if (noSpeechRetryRef.current < 1) {
          noSpeechRetryRef.current += 1;
          try { r.start(); return; } catch { /* fallthrough */ }
        }
        toast.message("음성을 못 들었어요. 마이크 가까이서 천천히 말씀해 주세요.");
        setPhase("idle");
        return;
      }
      if (code === "not-allowed" || code === "service-not-allowed") {
        toast.error("마이크 권한이 거부됐어요. 주소창의 자물쇠 아이콘에서 허용으로 바꿔주세요.");
        setPhase("idle");
        return;
      }
      if (code === "audio-capture") {
        toast.error("마이크를 찾지 못했어요. 마이크가 연결돼 있는지 확인해 주세요.");
        setPhase("idle");
        return;
      }
      if (code === "network") {
        toast.error("네트워크 문제로 음성 인식에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setPhase("idle");
        return;
      }
      if (code === "aborted") {
        // 사용자가 의도적으로 중단 — 조용히 review 로
        setPhase((p) => (p === "listening" ? "review" : p));
        return;
      }
      // 그 외 알 수 없는 에러
      toast.error(`음성 인식 오류 (${code ?? "unknown"}). 글자로 입력해 주세요.`);
      setPhase("idle");
    };

    r.onend = () => {
      setInterim("");
      setPhase((p) => {
        if (p !== "listening") return p;
        // 발화가 있었으면 review 로, 아예 없었으면 idle 로 돌아감
        return "review";
      });
    };

    recRef.current = r;
    try {
      r.start();
    } catch (err: any) {
      console.error("[speech.start]", err);
      // 가장 흔한 원인: 권한 미허용 (start() 동기 throw)
      const msg = err?.message ?? "";
      if (/not.?allowed|permission/i.test(msg)) {
        toast.error("마이크 권한이 필요해요. 브라우저 권한을 허용해 주세요.");
      } else if (/already.*started|InvalidStateError/i.test(msg)) {
        // 이미 진행 중인 인식이 있는 경우 — 한 번 abort 후 재시도
        try { r.abort(); } catch { /* noop */ }
        setTimeout(() => { try { r.start(); } catch { /* noop */ } }, 200);
        return;
      } else {
        toast.error("음성 인식을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      setPhase("idle");
    }
  }, []);

  const submit = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question) return;
      setPhase("thinking");
      try {
        const result = await ask({ data: { question, userId: userId ?? null } });
        setAnswer(result);
        setPhase("answer");
        playFullAnswer(result);
      } catch (err) {
        console.error(err);
        toast.error("답변을 가져오지 못했어요. 다시 시도해 주세요.");
        setPhase("review");
      }
    },
    [ask, playFullAnswer, userId],
  );

  return (
    <>
      {/* 커뮤니티 페이지: 글쓰기 + 물어보기 하단 고정 액션바 */}
      {isCommunity && !callActive && (
        <div
          className="fixed inset-x-0 z-50 flex gap-3 bg-background/95 px-5 py-3 backdrop-blur-xl border-t border-border/50"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 82px)" }}
        >
          {isAuthenticated ? (
            <Link
              to="/community/write"
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-background text-base font-bold text-foreground transition active:scale-[0.98] hover:border-primary/50"
            >
              <Pencil className="h-5 w-5" />
              글쓰기
            </Link>
          ) : (
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-background text-base font-bold text-foreground transition active:scale-[0.98] hover:border-primary/50"
            >
              <Pencil className="h-5 w-5" />
              글쓰기
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-soft transition active:scale-[0.98] hover:opacity-90"
          >
            <Plus className="h-5 w-5" strokeWidth={2.6} />
            물어보기
          </button>
        </div>
      )}

      {/* 일반 페이지: 플로팅 물어보기 버튼 — 안부 통화 중에는 숨김 */}
      {!isCommunity && !callActive && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="무엇이든 물어보기"
          className={cn(
            "fixed z-50 flex items-center gap-2 rounded-full bg-primary px-5 text-lg font-bold text-primary-foreground shadow-soft-lg transition-transform active:scale-95",
            "h-16 min-w-[64px] pr-6",
          )}
          style={{
            right: "max(1rem, env(safe-area-inset-right))",
            bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)",
          }}
        >
          <Plus className="h-7 w-7" strokeWidth={2.6} />
          <span className="pr-1">물어보기</span>
        </button>
      )}

      {/* 모달 */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
            <header className="flex items-center justify-between border-b-2 border-border/60 px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                <h2 className="text-fluid-xl font-bold">무엇이든 물어보세요</h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="닫기"
                className="flex h-12 w-12 items-center justify-center rounded-full text-foreground/70 hover:bg-surface"
              >
                <X className="h-7 w-7" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-6">
              {/* IDLE / LISTENING */}
              {(phase === "idle" || phase === "listening") && (
                <div className="flex flex-col items-center gap-6 py-6 text-center">
                  <p className="text-fluid-lg text-foreground/80">
                    {phase === "listening"
                      ? "듣고 있어요. 천천히 말씀해 주세요."
                      : "큰 버튼을 누르고 궁금한 것을 말씀해 보세요."}
                  </p>
                  <button
                    type="button"
                    onClick={phase === "listening" ? stopListening : startListening}
                    aria-label={phase === "listening" ? "그만 말하기" : "말하기 시작"}
                    className={cn(
                      "flex h-32 w-32 items-center justify-center rounded-full border-4 transition-all",
                      phase === "listening"
                        ? "animate-pulse border-destructive bg-destructive text-destructive-foreground"
                        : "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {phase === "listening" ? <MicOff className="h-14 w-14" /> : <Mic className="h-14 w-14" />}
                  </button>
                  {(transcript || interim) && (
                    <p className="text-fluid-base text-foreground/70">
                      {transcript} <span className="text-foreground/40">{interim}</span>
                    </p>
                  )}
                  {!supported && (
                    <p className="text-fluid-sm text-foreground/60">
                      음성을 못 쓰는 기기예요. 아래에 글자로 적어주세요.
                    </p>
                  )}
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="또는 여기에 직접 적어 주세요"
                    rows={3}
                    className="w-full rounded-2xl border-2 border-border bg-surface p-4 text-fluid-lg outline-none focus:border-primary"
                  />
                  {transcript.trim() && (
                    <Button
                      size="lg"
                      className="h-14 w-full rounded-2xl text-fluid-lg"
                      onClick={() => submit(transcript)}
                    >
                      <Send className="mr-2 h-5 w-5" /> 이대로 물어보기
                    </Button>
                  )}
                </div>
              )}

              {/* REVIEW */}
              {phase === "review" && (
                <div className="flex flex-col gap-5">
                  <p className="text-fluid-base text-foreground/60">이렇게 들었어요. 맞나요?</p>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border-2 border-border bg-surface p-4 text-fluid-xl leading-relaxed outline-none focus:border-primary"
                  />
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-14 flex-1 rounded-2xl text-fluid-lg"
                      onClick={() => {
                        setTranscript("");
                        startListening();
                      }}
                    >
                      <Mic className="mr-2 h-5 w-5" /> 다시 말하기
                    </Button>
                    <Button
                      size="lg"
                      className="h-14 flex-1 rounded-2xl text-fluid-lg"
                      onClick={() => submit(transcript)}
                      disabled={!transcript.trim()}
                    >
                      <Send className="mr-2 h-5 w-5" /> 물어보기
                    </Button>
                  </div>
                </div>
              )}

              {/* THINKING */}
              {phase === "thinking" && (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-fluid-lg text-foreground/70">답을 만들고 있어요…</p>
                </div>
              )}

              {/* ANSWER */}
              {phase === "answer" && answer && (
                <div className="flex flex-col gap-5">
                  <div className="rounded-3xl border-2 border-primary/30 bg-primary/5 p-5">
                    <p className="text-fluid-sm font-semibold uppercase tracking-[0.14em] text-primary">
                      질문
                    </p>
                    <p className="mt-2 text-fluid-lg text-foreground">{transcript}</p>
                  </div>

                  <div>
                    <h3 className="text-fluid-2xl font-bold text-foreground">{answer.title}</h3>
                    {answer.summary && (
                      <p className="mt-2 text-fluid-lg leading-relaxed text-foreground/80">
                        {answer.summary}
                      </p>
                    )}
                  </div>

                  {answer.expertGuidance && (
                    <section
                      aria-label="전문가 상담 안내"
                      className="rounded-3xl border-2 border-amber-500/60 bg-amber-50 p-5 text-amber-950 shadow-soft dark:bg-amber-950/30 dark:text-amber-100"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-6 w-6 shrink-0" />
                        <h4 className="text-fluid-lg font-bold">{answer.expertGuidance.label}</h4>
                      </div>
                      <p className="mt-2 text-fluid-base leading-relaxed">
                        {answer.expertGuidance.message}
                      </p>
                      <ul className="mt-3 flex flex-col gap-2">
                        {answer.expertGuidance.contacts.map((c, i) => (
                          <li key={i}>
                            {c.phone ? (
                              <a
                                href={`tel:${c.phone}`}
                                className="flex items-center gap-3 rounded-2xl border-2 border-amber-500/40 bg-background/70 p-3 transition-colors hover:bg-background"
                              >
                                <Phone className="h-5 w-5 text-amber-700" />
                                <div className="flex-1">
                                  <p className="text-fluid-base font-bold text-foreground">{c.name}</p>
                                  {c.note && (
                                    <p className="text-fluid-sm text-foreground/65">{c.note}</p>
                                  )}
                                </div>
                                <span className="text-fluid-base font-bold text-primary">{c.phone}</span>
                              </a>
                            ) : (
                              <div className="flex items-center gap-3 rounded-2xl border-2 border-amber-500/40 bg-background/70 p-3">
                                <ShieldAlert className="h-5 w-5 text-amber-700" />
                                <div className="flex-1">
                                  <p className="text-fluid-base font-bold text-foreground">{c.name}</p>
                                  {c.note && (
                                    <p className="text-fluid-sm text-foreground/65">{c.note}</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-fluid-sm text-amber-900/80 dark:text-amber-200/80">
                        아래 단계는 참고용 안내입니다. 결정 전 위 전문가에게 꼭 확인해 주세요.
                      </p>
                    </section>
                  )}

                  <ol className="flex flex-col gap-3">
                    {answer.steps.map((s, i) => (
                      <li
                        key={i}
                        className="flex gap-4 rounded-2xl border-2 border-border bg-surface p-5"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-fluid-xl font-bold text-primary-foreground">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-fluid-lg font-bold text-foreground">{s.title}</p>
                          <p className="mt-1 text-fluid-base leading-relaxed text-foreground/75">
                            {s.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {answer.caution && (
                    <div className="flex gap-3 rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="h-6 w-6 shrink-0" />
                      <p className="text-fluid-base leading-relaxed">{answer.caution}</p>
                    </div>
                  )}

                  {answer.relatedTips && answer.relatedTips.length > 0 && (
                    <section aria-label="관련 꿀팁">
                      <div className="mb-2 flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-primary" />
                        <h4 className="text-fluid-lg font-bold text-foreground">관련 꿀팁 보기</h4>
                      </div>
                      <ul className="flex flex-col gap-2">
                        {answer.relatedTips.map((tip) => (
                          <li key={tip.id}>
                            <Link
                              to="/tips/$tipId"
                              params={{ tipId: tip.id }}
                              onClick={() => close()}
                              className="flex items-center gap-3 rounded-2xl border-2 border-border bg-background p-4 transition-colors hover:border-primary/60 hover:bg-surface"
                            >
                              <div className="flex-1">
                                <p className="text-fluid-base font-bold text-foreground">{tip.title}</p>
                                <p className="mt-0.5 line-clamp-2 text-fluid-sm text-foreground/65">
                                  {tip.summary}
                                </p>
                              </div>
                              <ChevronRight className="h-6 w-6 shrink-0 text-foreground/45" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant={isSpeaking ? "default" : "outline"}
                      size="lg"
                      className="h-14 flex-1 rounded-2xl text-fluid-lg"
                      onClick={toggleSpeak}
                      aria-pressed={isSpeaking}
                    >
                      {isSpeaking ? (
                        <>
                          <VolumeX className="mr-2 h-5 w-5" /> 그만 듣기
                        </>
                      ) : (
                        <>
                          <Volume2 className="mr-2 h-5 w-5" /> 다시 들려주세요
                        </>
                      )}
                    </Button>
                    <Button
                      size="lg"
                      className="h-14 flex-1 rounded-2xl text-fluid-lg"
                      onClick={reset}
                    >
                      <Mic className="mr-2 h-5 w-5" /> 또 물어보기
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
