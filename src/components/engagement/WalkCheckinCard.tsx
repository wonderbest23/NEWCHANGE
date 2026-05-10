import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Footprints, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { recordWalkCheckin, getWalkStats } from "@/lib/engagement/walk-actions";

export function WalkCheckinCard() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["walk-stats"],
    queryFn: async () =>
      getWalkStats({ headers: await authHeaders() } as Parameters<typeof getWalkStats>[0]),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (coords: { latitude: number; longitude: number; accuracy_m: number | null }) =>
      recordWalkCheckin({
        data: coords,
        headers: await authHeaders(),
      } as Parameters<typeof recordWalkCheckin>[0]),
    onSuccess: (res) => {
      if (res.alreadyDone) {
        toast.info("오늘은 이미 산책을 인증하셨어요");
      } else {
        toast.success("산책 인증 완료! 칭호가 한 발짝 가까워졌어요 🌳");
      }
      qc.invalidateQueries({ queryKey: ["walk-stats"] });
      qc.invalidateQueries({ queryKey: ["my-badges"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "저장에 실패했어요");
    },
  });

  const handleCheckin = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("이 기기는 위치 확인을 지원하지 않아요");
      return;
    }
    setPending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPending(false);
        mutation.mutate({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
        });
      },
      (err) => {
        setPending(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "위치 사용을 허용해 주세요"
            : "위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요";
        toast.error(msg);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const busy = pending || mutation.isPending;
  const done = !!stats?.doneToday;

  return (
    <section className="mt-6 rounded-3xl border border-border bg-background p-5">
      <div className="flex items-center gap-2">
        <Footprints className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl text-foreground">오늘의 산책</h2>
      </div>
      <p className="mt-1 text-fluid-sm text-foreground/60">
        밖에 나가셨다면 위치로 인증하고 칭호를 모아 보세요.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl border border-border/60 p-3">
          <p className="text-2xl font-semibold text-foreground">{stats?.streak ?? 0}</p>
          <p className="mt-1 text-xs text-foreground/60">연속 산책일</p>
        </div>
        <div className="rounded-2xl border border-border/60 p-3">
          <p className="text-2xl font-semibold text-foreground">{stats?.total ?? 0}</p>
          <p className="mt-1 text-xs text-foreground/60">전체 산책</p>
        </div>
      </div>

      <Button
        size="lg"
        className="mt-4 h-[52px] w-full rounded-2xl text-fluid-base font-semibold"
        onClick={handleCheckin}
        disabled={busy || done}
      >
        {done ? (
          <>
            <CheckCircle2 className="mr-2 h-5 w-5" /> 오늘 인증 완료
          </>
        ) : busy ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 위치 확인 중…
          </>
        ) : (
          <>산책 인증하기</>
        )}
      </Button>
    </section>
  );
}
