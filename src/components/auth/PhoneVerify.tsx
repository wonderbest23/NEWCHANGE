import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, CheckCircle2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Props {
  onVerified: (phone: string) => void;
  verifiedPhone?: string | null;
}

export function PhoneVerify({ onVerified, verifiedPhone }: Props) {
  const [phone, setPhone] = useState(verifiedPhone ?? "");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"idle" | "sent" | "done">(
    verifiedPhone ? "done" : "idle",
  );
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const normalizedPhone = phone.replace(/[^0-9]/g, "");

  const handleSend = async () => {
    if (!/^01[0-9]{8,9}$/.test(normalizedPhone)) {
      toast.error("올바른 휴대폰 번호를 입력해 주세요");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/sms/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "발송에 실패했어요");
        return;
      }
      toast.success("인증번호를 보냈어요");
      setStage("sent");
      setSecondsLeft(300);
    } catch {
      toast.error("발송에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!/^[0-9]{6}$/.test(code)) {
      toast.error("6자리 숫자를 입력해 주세요");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/sms/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "인증에 실패했어요");
        return;
      }
      toast.success("휴대폰 인증이 완료되었어요");
      setStage("done");
      onVerified(normalizedPhone);
    } catch {
      toast.error("인증에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "done") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-sage/40 bg-sage-soft/60 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background">
          <CheckCircle2 className="h-6 w-6 text-sage" />
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold text-foreground">
            휴대폰 인증 완료
          </p>
          <p className="text-sm text-muted-foreground">{normalizedPhone}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-rose-soft/40 p-4">
      <Label htmlFor="phone" className="text-base font-medium">
        휴대폰 번호
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Phone className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            placeholder="01012345678"
            className="h-14 rounded-2xl pl-12 text-lg"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={13}
            disabled={busy}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="h-14 shrink-0 rounded-2xl px-4 text-base font-semibold"
          onClick={handleSend}
          disabled={busy || secondsLeft > 240}
        >
          {stage === "sent" ? "재발송" : "인증번호 받기"}
        </Button>
      </div>

      {stage === "sent" && (
        <>
          <Label htmlFor="code" className="mt-1 text-base font-medium">
            인증번호 (6자리)
          </Label>
          <div className="flex gap-2">
            <Input
              id="code"
              inputMode="numeric"
              placeholder="123456"
              className="h-14 flex-1 rounded-2xl text-center text-2xl tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              maxLength={6}
              disabled={busy}
            />
            <Button
              type="button"
              size="xl"
              className="h-14 shrink-0 gap-2 rounded-2xl px-5 text-base font-semibold"
              onClick={handleVerify}
              disabled={busy || code.length !== 6}
            >
              확인 <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {secondsLeft > 0 && (
            <p className="text-sm text-muted-foreground">
              남은 시간 {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
