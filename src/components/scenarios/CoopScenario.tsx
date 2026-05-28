/**
 * 친구와 합체 (Coop) — Supabase Realtime presence + paired catch broadcast.
 *
 * 흐름:
 *  1) Host: "코드 생성" → 6자 pair_code 발급. 친구에게 공유.
 *  2) Guest: 코드 입력 → joinCoopPair → status='active'.
 *  3) 활성화되면 둘 다 같은 supabase channel("coop:<pair_id>")에 join.
 *     - presence 로 둘 다 온라인 표시.
 *     - 한쪽이 "축포!" 누르면 broadcast 이벤트 → 양쪽 화면에 effect.
 *     - DB shared_catches 증가는 host 가 권위.
 *
 * 본 시나리오는 멀티플레이의 *최소 단위* — 같은 산책 몬스터/낚시 게임을 둘이서
 * 진행하는 동기화는 후속 작업 (현재는 presence + 셀러브레이션 ping 만).
 */

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, PartyPopper, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import {
  createCoopPair,
  endCoopPair,
  joinCoopPair,
} from "@/lib/scenario/actions";
import { supabase } from "@/integrations/supabase/client";
import { ScenarioCameraShell } from "./ScenarioCameraShell";
import { fx } from "@/lib/game/fx";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";

type Stage = "lobby" | "waiting" | "active";

export default function CoopScenario({ onExit }: ScenarioRunnerProps) {
  const [stage, setStage] = useState<Stage>("lobby");
  const [pairId, setPairId] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [celebrationCount, setCelebrationCount] = useState(0);

  const createMut = useMutation({
    mutationFn: async () =>
      createCoopPair({
        headers: await authHeaders(),
      } as Parameters<typeof createCoopPair>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error("코드 생성 실패 — 다시 시도해 주세요");
        return;
      }
      setPairId(res.pair.id);
      setPairCode(res.pair.pair_code);
      setStage("waiting");
    },
  });

  const joinMut = useMutation({
    mutationFn: async (code: string) =>
      joinCoopPair({
        data: { pair_code: code },
        headers: await authHeaders(),
      } as Parameters<typeof joinCoopPair>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        const msg =
          res.reason === "not_found"
            ? "그런 코드는 없어요"
            : res.reason === "self_pair"
              ? "본인 코드는 사용할 수 없어요"
              : "참여 실패";
        toast.error(msg);
        return;
      }
      setPairId(res.pair_id);
      setStage("active");
    },
  });

  const endMut = useMutation({
    mutationFn: async (id: string) =>
      endCoopPair({
        data: { pair_id: id },
        headers: await authHeaders(),
      } as Parameters<typeof endCoopPair>[0]),
  });

  // Supabase Realtime channel — pair_id 발급되면 join
  useEffect(() => {
    if (!pairId) return;
    const channel = supabase.channel(`coop:${pairId}`, {
      config: { presence: { key: pairId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const memberCount = Object.values(state).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0,
        );
        setPartnerOnline(memberCount >= 2);
        if (memberCount >= 2 && stage === "waiting") setStage("active");
      })
      .on("broadcast", { event: "celebrate" }, (payload) => {
        setCelebrationCount((n) => n + 1);
        fx.finish();
        const from = (payload.payload as { from?: string } | undefined)?.from;
        toast.success(`🎉 ${from ?? "친구"}가 축포!`);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user: "me", at: Date.now() });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pairId, stage]);

  const sendCelebration = useCallback(() => {
    if (!pairId) return;
    const channel = supabase.channel(`coop:${pairId}`);
    void channel.send({
      type: "broadcast",
      event: "celebrate",
      payload: { from: "me", at: Date.now() },
    });
    setCelebrationCount((n) => n + 1);
    fx.finish();
  }, [pairId]);

  const handleExit = useCallback(() => {
    if (pairId) endMut.mutate(pairId);
    onExit();
  }, [pairId, endMut, onExit]);

  return (
    <ScenarioCameraShell onExit={handleExit}>
      {/* 로비: host 코드 생성 / guest 코드 입력 */}
      {stage === "lobby" && (
        <div className="pointer-events-auto absolute left-1/2 top-1/2 z-20 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2">
          <Card className="border-violet-400/40 bg-violet-950/85 p-5 text-white backdrop-blur-md">
            <header className="mb-3 flex items-center gap-2">
              <Users className="h-5 w-5" />
              <h2 className="font-display text-lg">친구와 합체</h2>
            </header>
            <p className="mb-4 text-xs opacity-85">
              한 명이 코드를 만들고, 다른 한 명이 그 코드를 입력하세요.
            </p>
            <div className="space-y-3">
              <Button
                size="lg"
                className="h-12 w-full bg-violet-500 hover:bg-violet-400"
                disabled={createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                내가 코드 만들기
              </Button>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="예: A2K7XQ"
                  className="flex-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-center font-mono uppercase tracking-widest text-white"
                />
                <Button
                  disabled={joinInput.length !== 6 || joinMut.isPending}
                  onClick={() => joinMut.mutate(joinInput)}
                >
                  참여
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* waiting: 코드 표시 + 친구 입장 대기 */}
      {stage === "waiting" && pairCode && (
        <div className="pointer-events-auto absolute left-1/2 top-1/2 z-20 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2">
          <Card className="border-amber-400/40 bg-amber-950/85 p-5 text-center text-white backdrop-blur-md">
            <h2 className="mb-2 font-display text-base">친구에게 이 코드를 알려주세요</h2>
            <p className="my-4 font-mono text-5xl font-bold tracking-widest text-amber-300">
              {pairCode}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => {
                navigator.clipboard?.writeText(pairCode).catch(() => null);
                toast.success("코드 복사 완료");
              }}
            >
              <Copy className="h-4 w-4" />
              복사
            </Button>
            <p className="mt-4 text-xs opacity-75">친구가 참여하면 자동으로 시작돼요…</p>
          </Card>
        </div>
      )}

      {/* active: 합체 진행 — 같은 화면, 축포 broadcast */}
      {stage === "active" && (
        <>
          <div className="pointer-events-auto absolute left-3 right-3 top-3 z-20 mx-auto max-w-md">
            <Card className="border-emerald-400/40 bg-emerald-950/80 p-3 text-white backdrop-blur-md">
              <header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <div>
                    <h2 className="font-display text-base leading-none">합체 중</h2>
                    <p className="text-[11px] opacity-85">
                      {partnerOnline ? "친구 온라인" : "친구 연결 중…"}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={handleExit} className="text-white">
                  나가기
                </Button>
              </header>
              <p className="mt-2 text-[11px] opacity-80">
                축포 {celebrationCount}회 · 함께 사냥하세요!
              </p>
            </Card>
          </div>

          {/* 축포 버튼 */}
          <div className="pointer-events-auto absolute bottom-8 left-1/2 z-30 -translate-x-1/2 pb-[env(safe-area-inset-bottom)]">
            <button
              type="button"
              onClick={sendCelebration}
              className="flex h-24 w-24 items-center justify-center gap-1 rounded-full bg-violet-500 text-white shadow-2xl active:scale-95"
            >
              <PartyPopper className="h-7 w-7" />
            </button>
            <p className="mt-2 text-center text-[10px] text-white/85">축포!</p>
          </div>

          <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/45">
            * 실시간 공유 사냥은 추후. 지금은 presence + 축포 broadcast.
          </p>
        </>
      )}
    </ScenarioCameraShell>
  );
}
