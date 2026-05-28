import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { GAME_ITEMS, type GameItemKey } from "@/lib/game/items";
import {
  purchaseWalkMonsterItem,
  useWalkMonsterBooster,
  useWalkMonsterRadarExtender,
} from "@/lib/game/walk-monster-actions";

type InvRow = { item_key: string; quantity: number };

type Props = {
  inventory: InvRow[];
  coins: number;
};

export function GameInventoryPanel({ inventory, coins }: Props) {
  const qc = useQueryClient();
  const qty = (key: string) => inventory.find((i) => i.item_key === key)?.quantity ?? 0;

  const purchaseMut = useMutation({
    mutationFn: async (item_key: string) =>
      purchaseWalkMonsterItem({
        data: { item_key },
        headers: await authHeaders(),
      } as Parameters<typeof purchaseWalkMonsterItem>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.reason === "not_enough_coins" ? "코인이 부족해요" : "구매할 수 없어요");
        return;
      }
      toast.success("아이템을 샀어요");
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
    },
  });

  const boosterMut = useMutation({
    mutationFn: async () =>
      useWalkMonsterBooster({
        headers: await authHeaders(),
      } as Parameters<typeof useWalkMonsterBooster>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error("걸음 부스터가 없어요");
        return;
      }
      toast.success("다음 스폰까지 10m 가까워졌어요");
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
    },
  });

  const radarMut = useMutation({
    mutationFn: async () =>
      useWalkMonsterRadarExtender({
        headers: await authHeaders(),
      } as Parameters<typeof useWalkMonsterRadarExtender>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error("레이더 확장기가 없어요");
        return;
      }
      toast.success("포획 반경이 30분간 +20m 늘어났어요");
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
    },
  });

  return (
    <Card className="space-y-3 border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">가방</h2>
        <span className="text-sm text-foreground/60">보유 코인 {coins}</span>
      </div>
      <ul className="space-y-2">
        {(Object.keys(GAME_ITEMS) as GameItemKey[]).map((key) => {
          const item = GAME_ITEMS[key];
          const count = qty(key);
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{item.emoji}</span>
                <div>
                  <p className="text-sm font-medium">
                    {item.name} ×{count}
                  </p>
                  <p className="text-xs text-foreground/55">{item.description}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {key === "step_booster" && count > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    disabled={boosterMut.isPending}
                    onClick={() => boosterMut.mutate()}
                  >
                    사용
                  </Button>
                )}
                {key === "radar_extender" && count > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    disabled={radarMut.isPending}
                    onClick={() => radarMut.mutate()}
                  >
                    사용
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={purchaseMut.isPending || coins < item.price}
                  onClick={() => purchaseMut.mutate(key)}
                >
                  {item.price}🪙
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
