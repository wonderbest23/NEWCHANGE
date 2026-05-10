import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, LocateFixed, Loader2, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const SEOUL_GUS = [
  "강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구",
  "동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구",
  "영등포구","용산구","은평구","종로구","중구","중랑구",
] as const;

/**
 * 서울 25개 자치구 중심점 (lat, lon) — 행정안전부 공시 기준 근사값.
 * 외부 reverse-geocoding API 의존 없이 거리 계산만으로 자치구를 판정.
 */
const GU_CENTROIDS: Record<string, [number, number]> = {
  강남구: [37.5172, 127.0473],
  강동구: [37.5301, 127.1238],
  강북구: [37.6396, 127.0257],
  강서구: [37.5509, 126.8497],
  관악구: [37.4784, 126.9516],
  광진구: [37.5384, 127.0822],
  구로구: [37.4955, 126.8874],
  금천구: [37.4567, 126.8951],
  노원구: [37.6543, 127.0566],
  도봉구: [37.6688, 127.0471],
  동대문구: [37.5744, 127.0396],
  동작구: [37.5125, 126.9395],
  마포구: [37.5663, 126.9019],
  서대문구: [37.5791, 126.9368],
  서초구: [37.4837, 127.0324],
  성동구: [37.5634, 127.0367],
  성북구: [37.5894, 127.0167],
  송파구: [37.5145, 127.1066],
  양천구: [37.5170, 126.8666],
  영등포구: [37.5264, 126.8966],
  용산구: [37.5326, 126.9905],
  은평구: [37.6027, 126.9291],
  종로구: [37.5735, 126.9788],
  중구: [37.5641, 126.9979],
  중랑구: [37.6063, 127.0926],
};

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** 사용자 좌표에서 가장 가까운 서울 자치구 중심점 + 거리(km) */
function nearestSeoulGu(lat: number, lon: number): { gu: string; km: number } {
  let best: { gu: string; km: number } | null = null;
  for (const [gu, c] of Object.entries(GU_CENTROIDS)) {
    const km = haversineKm([lat, lon], c);
    if (!best || km < best.km) best = { gu, km };
  }
  return best!;
}

type Props = {
  value: string; // "" = 전체
  onChange: (gu: string) => void;
  /** 선택한 자치구를 내 프로필(서울특별시 OO구)로 저장할지 여부 */
  persistToProfile?: boolean;
};

export function RegionPicker({ value, onChange, persistToProfile = true }: Props) {
  const [open, setOpen] = useState(false);
  const [busyGps, setBusyGps] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = SEOUL_GUS.filter((g) => g.includes(query.trim()));

  const persist = async (gu: string) => {
    if (!persistToProfile || !gu) return;
    try {
      await supabase.auth.updateUser({
        data: { region_sido: "서울특별시", region_sigungu: gu },
      });
    } catch (e) {
      console.warn("[region persist]", e);
    }
  };

  const apply = async (gu: string) => {
    onChange(gu);
    await persist(gu);
    if (gu) toast.success(`${gu}로 설정했어요`);
    setOpen(false);
  };

  const detectGps = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.error("이 기기에서는 위치를 사용할 수 없어요");
      return;
    }
    // HTTPS / localhost 외 IP에서 호출하면 브라우저가 차단하므로 사전 안내
    if (typeof window !== "undefined") {
      const { protocol, hostname } = window.location;
      const isSecure =
        protocol === "https:" ||
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";
      if (!isSecure) {
        toast.error(
          "위치는 HTTPS 또는 localhost 에서만 사용할 수 있어요. (현재 주소: " + hostname + ")",
        );
        return;
      }
    }

    setBusyGps(true);
    // 모바일 GPS lock 시간을 고려해 15초 타임아웃 + maximumAge 짧게(최신 위치 우선)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          const { latitude, longitude, accuracy } = pos.coords;
          const { gu, km } = nearestSeoulGu(latitude, longitude);
          // 서울 외 지역(중심점에서 너무 먼 좌표) 보호 — 25km 초과 시 경고
          if (km > 25) {
            toast.message(
              `현재 위치는 서울에서 약 ${km.toFixed(0)}km 떨어져 있어요. 가장 가까운 ${gu}로 설정할게요.`,
            );
          } else if (accuracy && accuracy > 5000) {
            toast.message(`정확도가 낮아요 (±${Math.round(accuracy)}m). ${gu}로 임시 설정합니다.`);
          }
          void apply(gu);
        } catch (e) {
          console.error("[gps]", e);
          toast.error("위치 분석에 실패했어요. 직접 선택해 주세요.");
        } finally {
          setBusyGps(false);
        }
      },
      (err) => {
        setBusyGps(false);
        // 명시적 에러코드별 안내 — 사용자가 다음 액션을 알 수 있도록
        if (err.code === err.PERMISSION_DENIED) {
          toast.error(
            "위치 권한이 거부됐어요. 브라우저 주소창의 자물쇠 아이콘에서 허용으로 바꾼 뒤 다시 시도해 주세요.",
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error("위치 신호를 받을 수 없어요. 와이파이/모바일 데이터를 켜고 다시 시도해 주세요.");
        } else if (err.code === err.TIMEOUT) {
          toast.error("위치 확인이 시간 초과됐어요. 잠시 후 다시 시도해 주세요.");
        } else {
          toast.error("위치를 가져오지 못했어요. 직접 선택해 주세요.");
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-background px-4 py-3.5 text-left transition hover:border-primary/40 active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted-foreground">내 동네</span>
            <span className="block text-lg font-semibold text-foreground">
              {value || "동네를 선택해 주세요"}
            </span>
          </span>
          <span className="text-sm font-medium text-primary">변경</span>
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-3xl p-0">
        <SheetHeader className="border-b border-border/50 px-5 py-4">
          <SheetTitle className="text-xl">동네 설정</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto p-5 pb-8">
          {/* GPS 자동 */}
          <button
            type="button"
            onClick={detectGps}
            disabled={busyGps}
            className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary/5 px-4 py-4 text-left transition active:scale-[0.99] disabled:opacity-60"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              {busyGps ? <Loader2 className="h-6 w-6 animate-spin" /> : <LocateFixed className="h-6 w-6" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-foreground">
                {busyGps ? "위치 확인 중…" : "현재 위치로 자동 설정"}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                GPS로 내 동네를 자동으로 찾아드려요
              </span>
            </span>
          </button>

          {/* 전체 보기 */}
          <button
            type="button"
            onClick={() => apply("")}
            className={cn(
              "flex items-center justify-between rounded-2xl border-2 px-4 py-3.5 text-left transition active:scale-[0.99]",
              value === ""
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            <span className="text-base font-semibold">서울시 전체 보기</span>
            {value === "" && <Check className="h-5 w-5" strokeWidth={3} />}
          </button>

          {/* 직접 선택 */}
          <div>
            <p className="mb-2 px-1 text-base font-semibold text-foreground">직접 선택</p>

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="자치구 이름 (예: 강남)"
                className="h-12 rounded-2xl border-2 pl-10 text-base"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {filtered.length === 0 && (
                <p className="col-span-3 py-6 text-center text-sm text-muted-foreground">
                  결과가 없어요
                </p>
              )}
              {filtered.map((g) => {
                const selected = g === value;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => apply(g)}
                    aria-pressed={selected}
                    className={cn(
                      "relative rounded-2xl border-2 px-2 py-3 text-base font-semibold transition active:scale-[0.97]",
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : "border-border bg-background text-foreground hover:border-primary/40",
                    )}
                  >
                    {selected && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground text-primary">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <Button variant="outline" size="lg" className="mt-2 h-12 rounded-2xl text-base" onClick={() => setOpen(false)}>
            닫기
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
