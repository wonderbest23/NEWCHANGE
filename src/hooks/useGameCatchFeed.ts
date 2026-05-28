/**
 * Supabase Realtime — 다른 플레이어가 몬스터를 잡으면 토스트로 알린다.
 *
 * 채널: `public:game_catches` 의 INSERT 이벤트.
 * 본인 catch 는 토스트 중복(이미 mutate onSuccess 에서 처리)이므로 skip.
 *
 * 사용:
 *   useGameCatchFeed(currentUserId);
 *
 * 주의:
 *  - Supabase Realtime 은 RLS 가 SELECT 허용된 행만 broadcast 하므로
 *    game_catches RLS 정책이 다른 사용자 행을 SELECT 허용해야 동작.
 *  - 권한 없는 환경에서는 조용히 no-op (silent fail).
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { monsterByKey } from "@/lib/game/monsters";

interface CatchPayload {
  id: string;
  user_id: string;
  spawn_id: string;
  xp_gained: number | null;
  coins_gained: number | null;
  created_at: string;
}

// 1분 내 동일 user_id 의 catch 를 toast 로 띄우는 빈도 제한.
const RATE_LIMIT_MS = 60_000;
const recentByUser = new Map<string, number>();

export function useGameCatchFeed(currentUserId: string | null | undefined) {
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel("realtime:game_catches")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_catches" },
        async (msg) => {
          const row = msg.new as CatchPayload | undefined;
          if (!row || row.user_id === currentUserId) return;

          // 같은 유저 토스트 폭주 방지
          const last = recentByUser.get(row.user_id) ?? 0;
          if (Date.now() - last < RATE_LIMIT_MS) return;
          recentByUser.set(row.user_id, Date.now());

          // spawn 행에서 monster_key 조회 (rarity 표기용). 실패해도 토스트는 띄움.
          let monsterText = "몬스터";
          try {
            const { data: spawn } = await supabase
              .from("game_spawns" as never)
              .select("monster_key")
              .eq("id", row.spawn_id)
              .maybeSingle();
            const key = (spawn as { monster_key?: string } | null)?.monster_key;
            if (key) {
              const def = monsterByKey(key);
              monsterText = def ? `${def.emoji} ${def.name}` : monsterText;
            }
          } catch {
            // RLS 거부 등은 그냥 무시
          }

          toast(`근처에서 ${monsterText} 포획!`, {
            description: "다른 산책러가 잡았어요. 나도 가까이 가볼까요?",
            duration: 3500,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId]);
}
