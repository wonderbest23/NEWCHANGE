import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { createRealtimeSession } from "@/lib/voice-test-actions";
import { Mic, MicOff, PhoneOff, Phone, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/voice-test")({
  head: () => ({
    meta: [{ title: "음성 통화 시뮬레이션 — 곁 운영" }],
  }),
  component: VoiceTestPage,
});

type Transcript = { role: "user" | "ai"; text: string; ts: number; partial?: boolean };

function VoiceTestPage() {
  const { loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";
  const [personaName, setPersonaName] = useState("김순자");
  const [personaContext, setPersonaContext] = useState(
    "75세, 고혈압 약 매일 아침 1회 복용, 무릎 관절염 있음, 혼자 거주",
  );
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [muted, setMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    try {
      dcRef.current?.close();
    } catch {}
    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    dcRef.current = null;
    localStreamRef.current = null;
    pcRef.current = null;
  };

  const handleEvent = (msg: any) => {
    // OpenAI Realtime 이벤트 타입별 자막 누적
    const t = msg.type as string;
    if (t === "conversation.item.input_audio_transcription.completed") {
      // 사용자(부모님 역할) 발화가 인식됨
      const text = msg.transcript || "";
      if (!text.trim()) return;
      setTranscripts((prev) => [...prev, { role: "user", text, ts: Date.now() }]);
    } else if (t === "response.audio_transcript.delta") {
      // AI가 말하는 동안 자막 누적
      const delta = msg.delta || "";
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "ai" && last.partial) {
          return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
        }
        return [...prev, { role: "ai", text: delta, ts: Date.now(), partial: true }];
      });
    } else if (t === "response.audio_transcript.done") {
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "ai" && last.partial) {
          return [...prev.slice(0, -1), { ...last, partial: false, text: msg.transcript || last.text }];
        }
        return prev;
      });
    } else if (t === "error") {
      console.error("Realtime error:", msg);
      setError(msg.error?.message || "Realtime 오류");
    }
  };

  const startCall = async () => {
    setError(null);
    setTranscripts([]);
    setStatus("connecting");

    try {
      // 1) 서버에서 ephemeral key 발급
      const session = await createRealtimeSession({
        data: { personaName, personaContext },
      });
      if (!session.client_secret) throw new Error("토큰 발급 실패");

      // 2) 마이크 권한
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;

      // 3) RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // AI 음성 수신 → <audio>로 재생
      pc.ontrack = (e) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
        }
      };

      // 마이크 송신
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      // 데이터채널: 이벤트(자막 등)
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (ev) => {
        try {
          handleEvent(JSON.parse(ev.data));
        } catch (e) {
          console.warn("dc parse fail", e);
        }
      };
      dc.onopen = () => {
        // 첫 인사를 AI가 시작하도록 트리거
        dc.send(
          JSON.stringify({
            type: "response.create",
            response: { modalities: ["audio", "text"] },
          }),
        );
      };

      // 4) SDP offer → OpenAI
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
      if (!sdpResponse.ok) {
        const t = await sdpResponse.text();
        throw new Error(`SDP 교환 실패 (${sdpResponse.status}): ${t.slice(0, 200)}`);
      }
      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setStatus("live");
      toast.success("연결되었습니다. 마이크에 대고 어르신처럼 응답해 보세요.");
    } catch (e: any) {
      console.error(e);
      setError(e.message || String(e));
      setStatus("idle");
      cleanup();
      toast.error("통화 시작 실패");
    }
  };

  const endCall = () => {
    cleanup();
    setStatus("ended");
    toast("통화가 종료되었습니다.");
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  if (loading || appStateLoading) return null;
  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Lock className="mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold">관리자 전용 페이지입니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">권한이 없습니다.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">음성 통화 시뮬레이션</h1>
            <Badge variant="secondary">관리자 전용</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Twilio 없이 브라우저에서 OpenAI Realtime과 직접 WebRTC 통화. 본인이 부모님 역할로 응답하면서
            AI 안부 통화 흐름을 점검할 수 있습니다.
          </p>
        </header>

        <Card className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="persona-name">가상 부모님 이름</Label>
              <Input
                id="persona-name"
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                disabled={status === "live" || status === "connecting"}
                placeholder="예: 김순자"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="persona-context">가상 부모님 컨텍스트</Label>
              <Textarea
                id="persona-context"
                value={personaContext}
                onChange={(e) => setPersonaContext(e.target.value)}
                disabled={status === "live" || status === "connecting"}
                rows={2}
                placeholder="나이, 복용약, 지병 등"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {status !== "live" ? (
              <Button onClick={startCall} disabled={status === "connecting"} size="lg">
                <Phone className="mr-2 h-4 w-4" />
                {status === "connecting" ? "연결 중..." : "통화 시작"}
              </Button>
            ) : (
              <>
                <Button onClick={endCall} variant="destructive" size="lg">
                  <PhoneOff className="mr-2 h-4 w-4" />
                  통화 종료
                </Button>
                <Button onClick={toggleMute} variant="outline" size="lg">
                  {muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                  {muted ? "마이크 켜기" : "마이크 끄기"}
                </Button>
              </>
            )}
            <Badge
              variant={status === "live" ? "default" : "secondary"}
              className={status === "live" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : ""}
            >
              {status === "idle" && "대기"}
              {status === "connecting" && "연결 중"}
              {status === "live" && "● 통화 중"}
              {status === "ended" && "종료됨"}
            </Badge>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">실시간 자막</h2>
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
            {transcripts.length === 0 && (
              <p className="text-sm text-muted-foreground">통화를 시작하면 대화가 여기에 표시됩니다.</p>
            )}
            {transcripts.map((t, i) => (
              <div
                key={i}
                className={`flex ${t.role === "ai" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    t.role === "ai"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  <div className="mb-0.5 text-[10px] font-medium opacity-70">
                    {t.role === "ai" ? "AI 상담원 (곁)" : `${personaName} (나)`}
                  </div>
                  {t.text}
                  {t.partial && <span className="ml-1 animate-pulse">▍</span>}
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </Card>

        <audio ref={audioElRef} autoPlay playsInline className="hidden" />

        <p className="text-xs text-muted-foreground">
          ⚠️ 이 시뮬레이터는 OpenAI에 직접 연결되며 Twilio·DB 저장 없이 음성 흐름만 점검합니다. 마이크 권한
          허용이 필요합니다.
        </p>
      </div>
    </AdminLayout>
  );
}
