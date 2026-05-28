/**
 * useFishingSession — 낚시 전체 상태머신.
 *
 * 외부 사용:
 *   const s = useFishingSession({ onReward });
 *   s.phase, s.castPower, s.tension, s.fishKey, s.nearbyPlayers
 *   s.startFishing() / s.startCasting() / s.releaseCast() / s.jiggle()
 *   s.hookFish() / s.reelHold() / s.reelRelease()
 *
 * 책임:
 *  - phase 전환 (spot_select → ready → casting → floating → waiting → bite → ...)
 *  - 타이머 (입질 대기, bite window, fighting 텐션 자동 변화)
 *  - 클라이언트 측 캐스팅 힘/장력 계산
 *  - 물고기 hp / 텐션 zone 판정
 *  - 결과(잡힘/놓침)를 onReward 콜백으로 외부에 전달
 *
 * 서버:
 *  - 본 모듈은 보상 결정·DB 기록 안 함. 호출자가 onReward 안에서 server fn 호출.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fx } from "@/lib/game/fx";
import type { FishingPhase } from "./action-context";

export type FishKey = "minnow" | "bass" | "carp" | "goldfish";

interface FishMeta {
  key: FishKey;
  name: string;
  emoji: string;
  rarity: "common" | "rare" | "legendary";
  hp: number; // fight 길이 영향
  xp: number;
  coins: number;
  fightSpeed: number; // 텐션 변동 속도 배수 (1.0=기본)
}

export const FISH_META: Record<FishKey, FishMeta> = {
  minnow: { key: "minnow", name: "송사리", emoji: "🐟", rarity: "common", hp: 40, xp: 8, coins: 4, fightSpeed: 1.0 },
  bass: { key: "bass", name: "배스", emoji: "🐠", rarity: "common", hp: 60, xp: 12, coins: 6, fightSpeed: 1.2 },
  carp: { key: "carp", name: "잉어", emoji: "🐡", rarity: "rare", hp: 90, xp: 30, coins: 18, fightSpeed: 1.5 },
  goldfish: { key: "goldfish", name: "황금잉어", emoji: "🥇", rarity: "legendary", hp: 140, xp: 80, coins: 50, fightSpeed: 2.0 },
};

function pickFishByLuck(luck = 1): FishKey {
  const r = Math.random();
  // luck 가중치 (1.0=기본, >1 더 좋음)
  const legendaryT = 0.06 * luck;
  const rareT = legendaryT + 0.19 * luck;
  const bassT = rareT + 0.4;
  if (r < legendaryT) return "goldfish";
  if (r < rareT) return "carp";
  if (r < bassT) return "bass";
  return "minnow";
}

const SPOT_NAMES = [
  "달빛 연못",
  "노을 호숫가",
  "새벽안개 강가",
  "이슬숲 계곡",
  "별빛 못",
];

interface UseFishingSessionOpts {
  onReward?: (params: { fish: FishMeta; success: boolean }) => void;
  /** 사용 가능한 미끼 효과 (행운 가중치). 1.0=기본. */
  baitLuck?: number;
}

export interface FishingSessionApi {
  phase: FishingPhase;
  spotName: string;
  nearbyPlayers: number;
  castPower: number; // 0..1
  bobberX: number; // 0..1 화면 정규화
  bobberY: number; // 0..1
  biteRemainingMs: number; // bite window 남은 시간
  tension: number; // 0..1 (fighting 중)
  fishHp: number; // 0..1
  fishKey: FishKey | null;
  message: string | null; // 일시 메시지 ("물결이 일렁여요" 등)
  // actions
  enterSpot: () => void;
  startCasting: () => void;
  releaseCast: () => void;
  jiggle: () => void;
  hookFish: () => void;
  reelHold: () => void;
  reelRelease: () => void;
  loosen: () => void;
  tighten: () => void;
  retry: () => void;
  reset: () => void;
}

export function useFishingSession(opts: UseFishingSessionOpts = {}): FishingSessionApi {
  const { onReward, baitLuck = 1.0 } = opts;

  const [phase, setPhase] = useState<FishingPhase>("spot_select");
  const [spotName, setSpotName] = useState<string>(() =>
    SPOT_NAMES[Math.floor(Math.random() * SPOT_NAMES.length)],
  );
  const [nearbyPlayers, setNearbyPlayers] = useState<number>(0);
  const [castPower, setCastPower] = useState(0);
  const [bobberX, setBobberX] = useState(0.5);
  const [bobberY, setBobberY] = useState(0.7);
  const [biteRemainingMs, setBiteRemainingMs] = useState(0);
  const [tension, setTension] = useState(0.5);
  const [fishHp, setFishHp] = useState(1);
  const [fishKey, setFishKey] = useState<FishKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const holdStartRef = useRef<number | null>(null);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fightRafRef = useRef<number>(0);
  const reelingRef = useRef(false);
  const tensionRef = useRef(0.5);
  const fishHpRef = useRef(1);
  const fishMetaRef = useRef<FishMeta | null>(null);

  // 가짜 다중 플레이어 — 추후 supabase presence channel 로 교체.
  useEffect(() => {
    const t = setInterval(() => {
      setNearbyPlayers(Math.max(0, Math.floor(Math.random() * 5) + 1));
    }, 9000);
    setNearbyPlayers(Math.max(0, Math.floor(Math.random() * 4) + 1));
    return () => clearInterval(t);
  }, []);

  function clearTimers() {
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    if (biteIntervalRef.current) clearInterval(biteIntervalRef.current);
    if (fightRafRef.current) cancelAnimationFrame(fightRafRef.current);
    waitTimerRef.current = null;
    biteIntervalRef.current = null;
    fightRafRef.current = 0;
  }

  const reset = useCallback(() => {
    clearTimers();
    setPhase("ready");
    setCastPower(0);
    setBobberX(0.5);
    setBobberY(0.7);
    setBiteRemainingMs(0);
    setTension(0.5);
    setFishHp(1);
    setFishKey(null);
    setMessage(null);
    holdStartRef.current = null;
    reelingRef.current = false;
    tensionRef.current = 0.5;
    fishHpRef.current = 1;
    fishMetaRef.current = null;
  }, []);

  const enterSpot = useCallback(() => {
    setPhase("ready");
    setMessage(`${spotName}에 입장했어요`);
    setTimeout(() => setMessage(null), 2200);
  }, [spotName]);

  // ── casting ────────────────────────────────────────────────────
  const startCasting = useCallback(() => {
    if (phase !== "ready") return;
    holdStartRef.current = performance.now();
    setPhase("casting");
    setCastPower(0);
    const tick = () => {
      if (holdStartRef.current == null) return;
      const p = Math.min(1, (performance.now() - holdStartRef.current) / 1500);
      setCastPower(p);
      if (p < 1 && holdStartRef.current != null) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [phase]);

  const releaseCast = useCallback(() => {
    if (phase !== "casting" || holdStartRef.current == null) return;
    const held = performance.now() - holdStartRef.current;
    const power = Math.min(1, held / 1500);
    holdStartRef.current = null;
    setCastPower(power);

    // 찌 목표 좌표
    const targetX = 0.35 + Math.random() * 0.3;
    const targetY = 0.62 - power * 0.18;
    setPhase("floating");
    setBobberX(targetX);
    setBobberY(targetY);
    fx.capture();

    // 비행 끝나면 waiting
    setTimeout(() => {
      setPhase("waiting");
      // 입질 대기 — 충전이 클수록 + 흔들기 buff 가능. 베이스 3~7초.
      const baseWaitMs = 3000 + Math.random() * 4000;
      // luck 가 좋으면 입질 빠르게
      const wait = baseWaitMs / Math.max(0.5, baitLuck);
      waitTimerRef.current = setTimeout(() => triggerBite(), wait);
    }, 650);
  }, [phase, baitLuck]);

  // ── waiting 중 흔들기 → 입질 확률 상승 ─────────────────────────
  const jiggle = useCallback(() => {
    if (phase !== "floating" && phase !== "waiting") return;
    setMessage("찌를 흔들어요");
    setTimeout(() => setMessage(null), 1500);
    // 50% 확률로 입질 즉시 발동, 아니면 대기 시간 단축
    if (Math.random() < 0.5) {
      if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
      triggerBite();
    } else if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = setTimeout(() => triggerBite(), 1500);
    }
  }, [phase]);

  // ── bite phase ─────────────────────────────────────────────────
  function triggerBite() {
    setPhase("bite");
    fx.hit();
    const windowMs = 1500;
    const startMs = performance.now();
    setBiteRemainingMs(windowMs);
    biteIntervalRef.current = setInterval(() => {
      const remaining = windowMs - (performance.now() - startMs);
      if (remaining <= 0) {
        if (biteIntervalRef.current) clearInterval(biteIntervalRef.current);
        // 놓침
        setPhase("escaped");
        setBiteRemainingMs(0);
        fx.miss();
        setMessage("입질을 놓쳤어요…");
        return;
      }
      setBiteRemainingMs(remaining);
    }, 60);
  }

  const hookFish = useCallback(() => {
    if (phase !== "bite") return;
    if (biteIntervalRef.current) clearInterval(biteIntervalRef.current);
    // 잡은 물고기 결정 + fighting 시작
    const f = FISH_META[pickFishByLuck(baitLuck)];
    fishMetaRef.current = f;
    setFishKey(f.key);
    setFishHp(1);
    fishHpRef.current = 1;
    setTension(0.5);
    tensionRef.current = 0.5;
    setPhase("fighting");
    fx.finish();
    startFightingLoop();
  }, [phase, baitLuck]);

  // ── fighting loop — 텐션 자동 변동 + reel 입력 ─────────────────
  function startFightingLoop() {
    let prevMs = performance.now();
    const loop = () => {
      const f = fishMetaRef.current;
      if (!f) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - prevMs) / 1000);
      prevMs = now;

      // 물고기 발버둥 — 텐션을 양쪽으로 흔든다. fightSpeed 가 클수록 격렬.
      const wiggle = Math.sin(now / (220 / f.fightSpeed)) * 0.012 * f.fightSpeed;
      const drift = -0.05 * f.fightSpeed * dt; // 시간 지날수록 텐션이 줄어듦 (낚싯대 휨)
      let next = tensionRef.current + wiggle + drift;
      // 사용자가 reel hold 중이면 텐션 올림
      if (reelingRef.current) next += 0.6 * dt;
      next = Math.max(0, Math.min(1, next));
      tensionRef.current = next;
      setTension(next);

      // 안전 zone 0.35~0.7 안이면 물고기 hp 깎기
      if (next >= 0.35 && next <= 0.7) {
        fishHpRef.current -= 0.18 * dt;
      } else {
        // 줄 끊김 위험 — hp 회복 (역효과)
        fishHpRef.current += 0.05 * dt;
      }
      fishHpRef.current = Math.max(0, Math.min(1, fishHpRef.current));
      setFishHp(fishHpRef.current);

      // 끝 조건
      if (fishHpRef.current <= 0) {
        // 잡힘!
        setPhase("caught");
        fx.finish();
        return;
      }
      if (next <= 0.02 || next >= 0.98) {
        // 줄 끊김 / 도망
        setPhase("escaped");
        fx.miss();
        return;
      }
      fightRafRef.current = requestAnimationFrame(loop);
    };
    fightRafRef.current = requestAnimationFrame(loop);
  }

  const reelHold = useCallback(() => {
    if (phase !== "fighting") return;
    reelingRef.current = true;
  }, [phase]);

  const reelRelease = useCallback(() => {
    reelingRef.current = false;
  }, []);

  const loosen = useCallback(() => {
    if (phase !== "fighting") return;
    tensionRef.current = Math.max(0, tensionRef.current - 0.15);
    setTension(tensionRef.current);
  }, [phase]);

  const tighten = useCallback(() => {
    if (phase !== "fighting") return;
    tensionRef.current = Math.min(1, tensionRef.current + 0.15);
    setTension(tensionRef.current);
  }, [phase]);

  // caught → onReward 트리거
  useEffect(() => {
    if (phase === "caught" && fishMetaRef.current) {
      onReward?.({ fish: fishMetaRef.current, success: true });
    }
    if (phase === "escaped" && fishMetaRef.current) {
      onReward?.({ fish: fishMetaRef.current, success: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const retry = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => () => clearTimers(), []);

  return {
    phase,
    spotName,
    nearbyPlayers,
    castPower,
    bobberX,
    bobberY,
    biteRemainingMs,
    tension,
    fishHp,
    fishKey,
    message,
    enterSpot,
    startCasting,
    releaseCast,
    jiggle,
    hookFish,
    reelHold,
    reelRelease,
    loosen,
    tighten,
    retry,
    reset,
  };
}
