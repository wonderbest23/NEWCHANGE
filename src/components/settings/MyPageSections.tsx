import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/mock-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User as UserIcon, Bell, Receipt, Loader2, Pencil } from "lucide-react";

import { REGION_MAP, SIDO_LIST } from "@/lib/regions";
import { ProfileSetupWizard } from "./ProfileSetupWizard";

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
const INTEREST_LABEL: Record<string, string> = Object.fromEntries(
  INTEREST_OPTIONS.map((o) => [o.key, o.label]),
);

const fieldControlClass = "h-[44px] rounded-xl px-4 text-fluid-sm leading-none";
const compactSectionClass = "rounded-2xl border border-border bg-background p-4";

const NOTIF_KEY = "gyeot.notif.settings.v1";
type NotifSettings = {
  checkinTime: string;
  meal: boolean;
  medicine: boolean;
  shareToGuardian: boolean;
};
const DEFAULT_NOTIF: NotifSettings = {
  checkinTime: "09:00",
  meal: true,
  medicine: true,
  shareToGuardian: true,
};

export function MyPageSections() {
  const { user } = useAuth();

  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [birthYear, setBirthYear] = useState<string>(user?.birthYear ? String(user.birthYear) : "");
  const [regionSido, setRegionSido] = useState<string>("");
  const [regionSigungu, setRegionSigungu] = useState<string>("");
  const [ageRange, setAgeRange] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("nickname, birth_year, region_sido, region_sigungu, age_range, interests")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      if (data) {
        setNickname(data.nickname ?? "");
        setBirthYear(data.birth_year ? String(data.birth_year) : "");
        setRegionSido(data.region_sido ?? "");
        setRegionSigungu(data.region_sigungu ?? "");
        setAgeRange((data as any).age_range ?? "");
        setInterests(((data as any).interests as string[] | null) ?? []);
      }
      setProfileLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const isProfileComplete = useMemo(
    () => !!regionSido && !!regionSigungu && !!ageRange && interests.length >= 1,
    [regionSido, regionSigungu, ageRange, interests],
  );

  const handleProfileSave = async () => {
    if (!user?.id) return;
    if (nickname.trim().length < 2) {
      toast.error("닉네임은 2자 이상이어야 해요");
      return;
    }
    const yearNum = birthYear ? Number(birthYear) : null;
    if (yearNum !== null && (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2025)) {
      toast.error("출생연도를 다시 확인해 주세요");
      return;
    }
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          nickname: nickname.trim(),
          birth_year: yearNum,
          region_sido: regionSido.trim() || null,
          region_sigungu: regionSigungu.trim() || null,
          age_range: ageRange || null,
          interests,
        } as any)
        .eq("id", user.id);
      if (error) throw error;
      toast.success("내 정보를 저장했어요");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했어요");
    } finally {
      setProfileSaving(false);
    }
  };

  // ── 알림 ─────────────────────────────
  const [notif, setNotif] = useState<NotifSettings>(DEFAULT_NOTIF);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(NOTIF_KEY);
      if (raw) setNotif({ ...DEFAULT_NOTIF, ...JSON.parse(raw) });
    } catch {}
  }, []);
  const updateNotif = (next: Partial<NotifSettings>) => {
    const merged = { ...notif, ...next };
    setNotif(merged);
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(merged));
    } catch {}
  };

  // ── 렌더 ─────────────────────────────
  if (profileLoading) {
    return (
      <section className={`mt-8 ${compactSectionClass}`}>
        <div className="flex items-center gap-2 text-foreground/60">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
        </div>
      </section>
    );
  }

  // 첫 진입(또는 비어있음) → 위저드 강제
  if (!isProfileComplete && user?.id) {
    return (
      <div className="mt-8">
        <ProfileSetupWizard
          userId={user.id}
          initial={{ regionSido, regionSigungu, ageRange, birthYear, interests }}
          onDone={(v) => {
            setRegionSido(v.regionSido ?? "");
            setRegionSigungu(v.regionSigungu ?? "");
            setAgeRange(v.ageRange ?? "");
            setBirthYear(v.birthYear ?? "");
            setInterests(v.interests ?? []);
          }}
        />
      </div>
    );
  }

  return (
    <>
      {/* ── 내 정보: 기본 숨김 / 요약만 ── */}
      <section className={`mt-8 ${compactSectionClass}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl text-foreground">내 정보</h2>
          </div>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-3 text-fluid-sm text-foreground/70"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" /> 수정
            </Button>
          )}
        </div>

        {!editing ? (
          <dl className="mt-4 flex flex-col gap-3 text-fluid-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/55">닉네임</dt>
              <dd className="text-foreground">{nickname || "-"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/55">사는 곳</dt>
              <dd className="text-foreground">
                {regionSido} {regionSigungu}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/55">연령대</dt>
              <dd className="text-foreground">{ageRange || "-"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/55">관심 주제</dt>
              <dd className="text-right text-foreground">
                {interests.map((k) => INTEREST_LABEL[k] ?? k).join(", ") || "-"}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="my-nickname" className="text-base">닉네임</Label>
              <Input
                id="my-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className={fieldControlClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="my-year" className="text-base">출생연도</Label>
              <Input
                id="my-year"
                inputMode="numeric"
                placeholder="예: 1958"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, ""))}
                maxLength={4}
                className={fieldControlClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-base">연령대</Label>
              <Select value={ageRange} onValueChange={setAgeRange}>
                <SelectTrigger className={fieldControlClass}>
                  <SelectValue placeholder="연령대를 선택해 주세요" />
                </SelectTrigger>
                <SelectContent>
                  {AGE_RANGES.map((a) => (
                    <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label className="text-base">시/도</Label>
                <Select
                  value={regionSido}
                  onValueChange={(v) => { setRegionSido(v); setRegionSigungu(""); }}
                >
                  <SelectTrigger className={fieldControlClass}>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIDO_LIST.map((s) => (
                      <SelectItem key={s} value={s} className="text-base">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-base">시/군/구</Label>
                <Select value={regionSigungu} onValueChange={setRegionSigungu} disabled={!regionSido}>
                  <SelectTrigger className={fieldControlClass}>
                    <SelectValue placeholder={regionSido ? "선택" : "시/도 먼저"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(REGION_MAP[regionSido] ?? []).map((g) => (
                      <SelectItem key={g} value={g} className="text-base">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-base">관심 주제</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {INTEREST_OPTIONS.map((opt) => {
                  const checked = interests.includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-[8px] text-fluid-sm leading-snug transition ${
                        checked ? "border-primary bg-primary/5" : "border-border bg-background"
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
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="lg"
                className="h-[44px] rounded-full text-fluid-sm leading-none"
                onClick={() => setEditing(false)}
                disabled={profileSaving}
              >
                취소
              </Button>
              <Button
                size="lg"
                className="h-[44px] flex-1 rounded-full text-fluid-sm leading-none"
                onClick={handleProfileSave}
                disabled={profileSaving}
              >
                {profileSaving ? "저장 중…" : "저장"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── 알림 설정 ── */}
      <section className={`mt-6 ${compactSectionClass}`}>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl text-foreground">알림 설정</h2>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
          {/* 건강체크 시간 */}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Label htmlFor="notif-time" className="text-sm font-medium text-foreground">
              건강체크 알림 시간
            </Label>
            <Input
              id="notif-time"
              type="time"
              value={notif.checkinTime}
              onChange={(e) => updateNotif({ checkinTime: e.target.value })}
              className="h-9 w-32 rounded-lg px-3 text-sm"
            />
          </div>
          <div className="border-t border-border/60" />
          {/* 식사 알림 */}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-medium text-foreground">식사 알림</span>
            <Switch checked={notif.meal} onCheckedChange={(v) => updateNotif({ meal: v })} />
          </div>
          <div className="border-t border-border/60" />
          {/* 약 복용 알림 */}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-medium text-foreground">약 복용 알림</span>
            <Switch checked={notif.medicine} onCheckedChange={(v) => updateNotif({ medicine: v })} />
          </div>
          <div className="border-t border-border/60" />
          {/* 보호자 공유 */}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">보호자에게 공유</p>
              <p className="mt-0.5 text-xs text-muted-foreground">기록을 보호자에게 자동으로 공유해요</p>
            </div>
            <Switch
              checked={notif.shareToGuardian}
              onCheckedChange={(v) => updateNotif({ shareToGuardian: v })}
            />
          </div>
        </div>
      </section>

      {/* ── 구매내역 ── */}
      <section className={`mt-6 ${compactSectionClass}`}>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl text-foreground">구매내역</h2>
        </div>
        <p className="mt-3 text-base text-foreground/70">아직 구매내역이 없습니다.</p>
      </section>
    </>
  );
}
