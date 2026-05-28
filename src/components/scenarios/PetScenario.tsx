/**
 * AR 반려견 — end-to-end. 카메라 위 가상 강아지 (이모지 + 상태 애니메이션).
 *
 * 상호작용:
 *  - 쓰다듬기 (탭 또는 손바닥 펼침 제스처)
 *  - 먹이 (좌측 액션)
 *  - 놀기 (우측 액션, 공 던지기 시뮬레이션)
 *  - 친밀도/허기/기분 게이지 표시
 *
 * MediaPipe HandLandmarker 로 손바닥 펼치면 "쓰다듬기" 자동 트리거.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bone, Drumstick, Heart, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { getOrCreatePet, interactWithPet } from "@/lib/scenario/actions";
import { useHandTracker } from "@/lib/ar/useHandTracker";
import { fx } from "@/lib/game/fx";
import { ScenarioCameraShell } from "./ScenarioCameraShell";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";
import { cn } from "@/lib/utils";

type PetAction = "pet" | "feed" | "play" | "train";

const MOOD_EMOJI: Record<string, string> = {
  happy: "😊",
  playful: "🎉",
  hungry: "🍖",
  sleepy: "😴",
  sad: "😢",
};

export default function PetScenario({ onExit }: ScenarioRunnerProps) {
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);

  const petQ = useQuery({
    queryKey: ["pet"],
    queryFn: async () =>
      getOrCreatePet({
        headers: await authHeaders(),
      } as Parameters<typeof getOrCreatePet>[0]),
    staleTime: 30_000,
  });

  const actMut = useMutation({
    mutationFn: async (action: PetAction) =>
      interactWithPet({
        data: { action },
        headers: await authHeaders(),
      } as Parameters<typeof interactWithPet>[0]),
    onSuccess: (res) => {
      if (!res.ok) return;
      qc.invalidateQueries({ queryKey: ["pet"] });
      fx.hit();
      const r = res as Extract<typeof res, { ok: true }>;
      toast.success(`+${r.gained.exp} EXP · 친밀도 +${r.gained.dAff}`);
    },
  });

  // 손바닥 감지 → 자동 쓰다듬기 (10초 쿨다운)
  const lastPetByHandRef = useRef(0);
  const handTracker = useHandTracker({ enabled: true, video: videoRef.current });
  useEffect(() => {
    if (!handTracker.ready) return;
    const id = setInterval(() => handTracker.requestDetection(), 700);
    return () => clearInterval(id);
  }, [handTracker.ready, handTracker.requestDetection]);

  useEffect(() => {
    const h = handTracker.latest;
    if (!h) return;
    if (h.gesture === "open_palm" && Date.now() - lastPetByHandRef.current > 10_000) {
      lastPetByHandRef.current = Date.now();
      actMut.mutate("pet");
      toast.message("✋ 손바닥 인식 — 쓰다듬어줬어요");
    }
  }, [handTracker.latest, actMut]);

  const pet = useMemo(() => {
    const r = petQ.data;
    return r && r.ok ? r.pet : null;
  }, [petQ.data]);

  if (!pet) {
    return (
      <ScenarioCameraShell onExit={onExit}>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
          반려견 데이터 로딩…
        </div>
      </ScenarioCameraShell>
    );
  }

  const moodEmoji = MOOD_EMOJI[pet.mood] ?? "🐶";

  return (
    <ScenarioCameraShell onExit={onExit} videoRef={videoRef}>
      {/* 상단 펫 카드 */}
      <div className="pointer-events-auto absolute left-3 right-3 top-3 z-20 mx-auto max-w-md">
        <Card className="border-rose-400/40 bg-rose-950/80 p-3 text-white backdrop-blur-md">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{moodEmoji}</span>
              <div>
                <h2 className="font-display text-base leading-none">{pet.name}</h2>
                <p className="text-[11px] opacity-80">
                  Lv.{pet.level} · {pet.exp} EXP
                </p>
              </div>
            </div>
            <button onClick={onExit} className="text-xs underline opacity-80">
              나가기
            </button>
          </header>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <p className="mb-0.5 flex justify-between">
                <span>친밀도</span>
                <span>{pet.affinity}</span>
              </p>
              <Progress value={pet.affinity} className="h-1.5 bg-white/15" />
            </div>
            <div>
              <p className="mb-0.5 flex justify-between">
                <span>배고픔</span>
                <span>{pet.hunger}</span>
              </p>
              <Progress value={pet.hunger} className="h-1.5 bg-white/15" />
            </div>
          </div>
        </Card>
      </div>

      {/* 카메라 가운데 큰 강아지 이모지 (TODO: GLB 모델로 교체) */}
      <button
        type="button"
        onClick={() => actMut.mutate("pet")}
        className={cn(
          "pointer-events-auto absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 select-none text-[140px] drop-shadow-2xl",
          actMut.isPending && "animate-bounce",
        )}
        aria-label="강아지 쓰다듬기"
      >
        🐶
      </button>

      {/* 하단 액션 — 게임패드 스타일 */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-20 flex items-end justify-around gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PetActionButton
          label="먹이"
          icon={<Drumstick className="h-5 w-5" />}
          tone="bg-amber-500"
          disabled={actMut.isPending}
          onClick={() => actMut.mutate("feed")}
        />
        <PetActionButton
          label="쓰다듬기"
          icon={<Heart className="h-6 w-6" />}
          tone="bg-rose-500"
          disabled={actMut.isPending}
          big
          onClick={() => actMut.mutate("pet")}
        />
        <PetActionButton
          label="놀기"
          icon={<PartyPopper className="h-5 w-5" />}
          tone="bg-violet-500"
          disabled={actMut.isPending}
          onClick={() => actMut.mutate("play")}
        />
        <PetActionButton
          label="훈련"
          icon={<Bone className="h-5 w-5" />}
          tone="bg-emerald-500"
          disabled={actMut.isPending}
          onClick={() => actMut.mutate("train")}
        />
      </div>

      <p className="pointer-events-none absolute bottom-1 left-0 right-0 text-center text-[10px] text-white/45">
        ✋ 손바닥을 펴면 자동으로 쓰다듬어줘요
      </p>
    </ScenarioCameraShell>
  );
}

function PetActionButton({
  label,
  icon,
  tone,
  onClick,
  disabled,
  big,
}: {
  label: string;
  icon: React.ReactNode;
  tone: string;
  onClick: () => void;
  disabled?: boolean;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-full text-white shadow-lg active:scale-95",
        tone,
        big ? "h-20 w-20" : "h-16 w-16",
        disabled && "opacity-60",
      )}
    >
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}
