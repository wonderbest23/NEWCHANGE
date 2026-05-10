import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REGION_MAP, SIDO_LIST } from "@/lib/regions";
import { MapPin, CalendarDays, Compass, Heart, Loader2, Check } from "lucide-react";

const AGE_RANGES = ["50대", "60대", "70대", "80대", "90대 이상"];

const INTEREST_OPTIONS = [
  { key: "health", label: "건강·운동" },
  { key: "meal", label: "식사·영양" },
  { key: "hobby", label: "취미·여가" },
  { key: "social", label: "이웃·소모임" },
  { key: "policy", label: "복지·정책" },
  { key: "family", label: "가족 소식" },
  { key: "spirit", label: "마음건강" },
  { key: "tech", label: "스마트폰 배우기" },
];

export const LOCATION_CONSENT_KEY = "gyeot.location.consent.v1";

export type WizardInitialValues = {
  regionSido?: string;
  regionSigungu?: string;
  ageRange?: string;
  birthYear?: string;
  interests?: string[];
};

type Props = {
  userId: string;
  initial?: WizardInitialValues;
  onDone: (saved: Required<WizardInitialValues>) => void;
};

const STEPS = [
  { key: "region", title: "사시는 곳을 알려주세요", icon: MapPin, hint: "동네 소식과 가까운 복지·병원을 안내드릴게요." },
  { key: "age", title: "연세를 알려주세요", icon: CalendarDays, hint: "나이에 맞는 건강·복지 정보를 보여드려요." },
  { key: "location", title: "지금 위치 기반 사용 동의", icon: Compass, hint: "현재 위치를 잠깐 사용해 더 가까운 정보를 보여드려요." },
  { key: "interests", title: "관심 주제를 골라주세요", icon: Heart, hint: "고른 주제 위주로 보여드려요. (1개 이상)" },
] as const;

export function ProfileSetupWizard({ userId, initial, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [regionSido, setRegionSido] = useState(initial?.regionSido ?? "");
  const [regionSigungu, setRegionSigungu] = useState(initial?.regionSigungu ?? "");
  const [ageRange, setAgeRange] = useState(initial?.ageRange ?? "");
  const [birthYear, setBirthYear] = useState(initial?.birthYear ?? "");
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [locating, setLocating] = useState(false);

  const cur = STEPS[step];
  const Icon = cur.icon;
  const total = STEPS.length;

  const canNext = (() => {
    if (cur.key === "region") return !!regionSido && !!regionSigungu;
    if (cur.key === "age") return !!ageRange;
    if (cur.key === "location") return true; // 동의 또는 건너뛰기 둘 다 가능
    if (cur.key === "interests") return interests.length >= 1;
    return false;
  })();

  const finish = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          region_sido: regionSido || null,
          region_sigungu: regionSigungu || null,
          age_range: ageRange || null,
          birth_year: birthYear ? Number(birthYear) : null,
          interests,
        } as any)
        .eq("id", userId);
      if (error) throw error;
      toast.success("정보를 저장했어요");
      onDone({ regionSido, regionSigungu, ageRange, birthYear, interests });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했어요");
    } finally {
      setSaving(false);
    }
  };

  const requestLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("이 기기에서는 위치 사용이 어렵습니다");
      try { localStorage.setItem(LOCATION_CONSENT_KEY, "denied"); } catch {}
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        try { localStorage.setItem(LOCATION_CONSENT_KEY, "granted"); } catch {}
        toast.success("현재 위치 사용에 동의해 주셔서 감사합니다");
        setLocating(false);
      },
      () => {
        try { localStorage.setItem(LOCATION_CONSENT_KEY, "denied"); } catch {}
        toast.message("위치 사용이 거부되었어요. 언제든 다시 설정할 수 있어요.");
        setLocating(false);
      },
      { timeout: 8000 },
    );
  };

  return (
    <section className="rounded-3xl border border-border bg-background p-5 shadow-soft">
      {/* progress */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`h-2 flex-1 rounded-full ${
              i < step ? "bg-primary" : i === step ? "bg-primary/70" : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-fluid-sm text-foreground/55">
        {step + 1} / {total} 단계
      </p>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-fluid-xl leading-tight text-foreground">{cur.title}</h2>
          <p className="mt-1 text-fluid-sm text-foreground/60">{cur.hint}</p>
        </div>
      </div>

      <div className="mt-6">
        {cur.key === "region" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-base">시/도</Label>
              <Select
                value={regionSido}
                onValueChange={(v) => {
                  setRegionSido(v);
                  setRegionSigungu("");
                }}
              >
                <SelectTrigger className="h-[52px] rounded-xl px-4 text-fluid-base">
                  <SelectValue placeholder="시/도를 선택해 주세요" />
                </SelectTrigger>
                <SelectContent>
                  {SIDO_LIST.map((s) => (
                    <SelectItem key={s} value={s} className="text-base">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-base">시/군/구</Label>
              <Select
                value={regionSigungu}
                onValueChange={setRegionSigungu}
                disabled={!regionSido}
              >
                <SelectTrigger className="h-[52px] rounded-xl px-4 text-fluid-base">
                  <SelectValue placeholder={regionSido ? "선택해 주세요" : "시/도를 먼저 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {(REGION_MAP[regionSido] ?? []).map((g) => (
                    <SelectItem key={g} value={g} className="text-base">
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {cur.key === "age" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {AGE_RANGES.map((a) => {
                const active = ageRange === a;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgeRange(a)}
                    className={`min-h-[56px] rounded-2xl border px-4 text-fluid-base font-medium transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground"
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="wiz-year" className="text-base">
                출생연도 (선택)
              </Label>
              <Input
                id="wiz-year"
                inputMode="numeric"
                placeholder="예: 1958"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, ""))}
                maxLength={4}
                className="h-[52px] rounded-xl px-4 text-fluid-base"
              />
            </div>
          </div>
        )}

        {cur.key === "location" && (
          <div className="flex flex-col gap-3">
            <p className="text-fluid-base text-foreground/75 leading-relaxed">
              현재 위치를 사용하면 가까운 복지관·병원·소모임을 더 정확히 보여드려요.
              위치는 저장하지 않고 그때만 사용해요.
            </p>
            <Button
              size="lg"
              className="h-[56px] rounded-2xl text-fluid-base font-semibold"
              onClick={requestLocation}
              disabled={locating}
            >
              {locating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> 위치 확인 중…
                </>
              ) : (
                "지금 위치 사용 동의"
              )}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="h-[48px] rounded-2xl text-fluid-sm text-foreground/60"
              onClick={() => {
                try { localStorage.setItem(LOCATION_CONSENT_KEY, "denied"); } catch {}
                setStep((s) => s + 1);
              }}
            >
              나중에 할게요
            </Button>
          </div>
        )}

        {cur.key === "interests" && (
          <div className="grid grid-cols-2 gap-2">
            {INTEREST_OPTIONS.map((opt) => {
              const checked = interests.includes(opt.key);
              return (
                <label
                  key={opt.key}
                  className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border px-4 text-fluid-base transition ${
                    checked ? "border-primary bg-primary/10" : "border-border bg-background"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      setInterests((prev) =>
                        v ? [...prev, opt.key] : prev.filter((k) => k !== opt.key),
                      );
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="lg"
          className="h-[52px] rounded-full px-5 text-fluid-sm text-foreground/60"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || saving}
        >
          이전
        </Button>
        {step < total - 1 ? (
          <Button
            size="lg"
            className="h-[52px] flex-1 rounded-full text-fluid-base font-semibold text-slate-50"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
          >
            다음
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-[52px] flex-1 rounded-full text-fluid-base font-semibold text-slate-50"
            onClick={finish}
            disabled={!canNext || saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> 저장 중…
              </>
            ) : (
              <>
                <Check className="h-5 w-5" /> 완료
              </>
            )}
          </Button>
        )}
      </div>
    </section>
  );
}
