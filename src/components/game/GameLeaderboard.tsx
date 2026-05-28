import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { getWalkMonsterLeaderboard } from "@/lib/game/walk-monster-actions";
import { cn } from "@/lib/utils";

export function GameLeaderboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["walk-monster-leaderboard"],
    queryFn: async () =>
      getWalkMonsterLeaderboard({
        headers: await authHeaders(),
      } as Parameters<typeof getWalkMonsterLeaderboard>[0]),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="flex justify-center border-border p-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <Card className="space-y-3 border-border p-4">
      <h2 className="flex items-center gap-2 font-display text-lg">
        <Trophy className="h-5 w-5 text-amber-500" />
        포획 랭킹
      </h2>
      <ol className="space-y-1">
        {(data?.top ?? []).map((row) => (
          <li
            key={row.user_id}
            className={cn(
              "flex items-center justify-between rounded-lg px-2 py-1.5 text-sm",
              row.is_me && "bg-primary/10 font-medium",
            )}
          >
            <span>
              {row.rank}. {row.nickname}
            </span>
            <span className="text-foreground/60">
              {row.total_catches}마리 · Lv.{row.level}
            </span>
          </li>
        ))}
      </ol>
      {data?.me && (
        <p className="border-t border-border pt-2 text-center text-xs text-foreground/55">
          내 순위 {data.me.rank}위 · {data.me.total_catches}마리
        </p>
      )}
    </Card>
  );
}
