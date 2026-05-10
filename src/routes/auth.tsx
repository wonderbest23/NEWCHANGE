import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowRight,
  Mail,
  Lock,
  User,
  Sparkles,
} from "lucide-react";
import { PhoneVerify } from "@/components/auth/PhoneVerify";
import { useAuth } from "@/lib/auth/mock-auth";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import { lovable } from "@/integrations/lovable";
import { getMyAppState } from "@/lib/auth/role-actions";

type Search = { mode?: "signin" | "signup"; token?: string; redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s.mode === "signup" ? "signup" : s.mode === "signin" ? "signin" : undefined,
    token: typeof s.token === "string" ? s.token : undefined,
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "로그인 — 곁" },
      { name: "description", content: "큰 글씨와 큰 버튼으로, 시니어를 위한 곁을 시작하세요." },
    ],
  }),
  component: AuthPage,
});

const currentYear = new Date().getFullYear();

const signinSchema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력해 주세요").max(255),
  password: z.string().min(6, "비밀번호는 6자 이상").max(128),
});

const signupSchema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력해 주세요").max(255),
  password: z.string().min(6, "비밀번호는 6자 이상").max(128),
  nickname: z
    .string()
    .trim()
    .min(2, "닉네임은 2자 이상")
    .max(20, "닉네임은 20자 이하")
    .regex(/^[\p{L}\p{N}_-]+$/u, "특수문자는 _ - 만 사용 가능해요"),
  birthYear: z
    .number({ message: "출생연도를 입력해 주세요" })
    .int()
    .min(1900, "올바른 연도를 입력해 주세요")
    .max(currentYear, "올바른 연도를 입력해 주세요"),
  region: z.string().trim().min(2, "지역을 입력해 주세요").max(50),
  agreed: z.literal(true, { message: "약관에 동의해 주세요" } as never),
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [showSignup, setShowSignup] = useState(search.mode === "signup");
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthYear, setBirthYear] = useState<string>("");
  const [region, setRegion] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);

  const routingRef = useRef(false);
  const routeFor = async (token: string) => {
    if (routingRef.current) return;
    routingRef.current = true;
    // 초대 토큰이 있으면 초대 수락 페이지로 우선 이동
    if (search.token) {
      navigate({ to: "/invite/guardian", search: { token: search.token } });
      return;
    }
    // redirect 파라미터가 있으면 해당 경로로 복귀
    if (search.redirect && search.redirect.startsWith("/")) {
      navigate({ to: search.redirect as "/home" });
      return;
    }
    // 세션이 있으면 즉시 /home으로 이동 (역할 확인은 후속 보정)
    navigate({ to: "/home" });
    try {
      const state = await getMyAppState({
        headers: { Authorization: `Bearer ${token}` },
      } as Parameters<typeof getMyAppState>[0]);
      if (state.destination && state.destination !== "/home") {
        navigate({ to: state.destination as "/home" });
      }
    } catch (e) {
      console.error("[auth] getMyAppState failed (staying on /home)", e);
    }
  };

  useEffect(() => {
    getSessionCached().then(({ data }) => {
      if (data.session?.access_token) routeFor(data.session.access_token);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.access_token) {
        routeFor(session.access_token);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (PASS 가짜 인증 제거) — 휴대폰 SMS 인증으로 대체

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const parsed = signinSchema.safeParse({ email, password });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
      routingRef.current = false;
      await signIn(parsed.data.email, parsed.data.password);
      toast.success("로그인되었어요");
      // 일부 브라우저/환경에서 onAuthStateChange 타이밍이 늦는 경우를 대비해
      // 로그인 직후 세션 토큰을 직접 읽어 즉시 라우팅한다.
      const { data } = await getSessionCached();
      const token = data.session?.access_token;
      if (token) {
        await routeFor(token);
      } else {
        navigate({ to: "/home" });
      }
    } catch (err) {
      routingRef.current = false;
      toast.error(err instanceof Error ? err.message : "로그인에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!verifiedPhone) {
        toast.error("휴대폰 인증을 먼저 완료해 주세요");
        return;
      }
      const parsed = signupSchema.safeParse({
        email,
        password,
        nickname,
        birthYear: Number(birthYear),
        region,
        agreed,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
      await signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        nickname: parsed.data.nickname,
        birthYear: parsed.data.birthYear,
        region: parsed.data.region,
        agreed: parsed.data.agreed,
        phone: verifiedPhone,
      });
      toast.success("환영해요! 곁이 시작되었어요");
      // 가입 후 라우팅도 onAuthStateChange가 자동 처리 (시니어 기본)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "가입에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth${search.token ? `?token=${search.token}` : ""}`,
      });
      if (result.error) {
        toast.error(result.error.message ?? "구글 로그인에 실패했어요");
        return;
      }
      if (result.redirected) return;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <section className="mx-auto flex w-full max-w-lg flex-col px-5 py-12 sm:py-16">
        {/* ─── 헤더: 시니어를 위해 큼직하고 단순하게 ─── */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-4 py-1.5 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4" />
            시니어를 위한 곁
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {showSignup ? "처음 오셨군요" : "다시 오셨네요"}
          </h1>
          <p className="mt-3 text-foreground/70 text-sm">
            {showSignup
              ? "잠깐이면 시작할 수 있어요."
              : "이메일로 로그인해 주세요."}
          </p>
          {search.token && (
            <p className="mt-4 rounded-2xl bg-rose-soft/70 px-4 py-3 text-sm text-foreground">
              가족이 보낸 초대 링크예요. 로그인 후 자동으로 연결돼요.
            </p>
          )}
        </div>

        {/* ─── 로그인 폼 (기본) ─── */}
        {!showSignup && (
          <>
            <form className="mt-8 flex flex-col gap-5" onSubmit={handleSignin}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-base font-medium">이메일</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" className="h-14 rounded-2xl pl-12 text-lg" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-base font-medium">비밀번호</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" className="h-14 rounded-2xl pl-12 text-lg" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} maxLength={128} required />
                </div>
              </div>
              <Button type="submit" size="xl" variant="hero" className="mt-2 h-16 gap-2 rounded-2xl text-lg font-semibold" disabled={submitting}>
                로그인 <ArrowRight className="h-5 w-5" />
              </Button>
              <div className="text-center">
                <Link
                  to="/reset-password"
                  className="text-base text-foreground/70 underline underline-offset-4"
                >
                  비밀번호를 잊으셨나요?
                </Link>
              </div>
            </form>

            {/* 소셜 로그인 */}
            <div className="mt-6 flex flex-col gap-3">
              <div className="relative flex items-center gap-3 text-sm text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                또는
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" size="xl" className="h-14 gap-3 rounded-2xl text-base" onClick={handleGoogle} disabled={submitting}>
                <span className="inline-flex h-5 w-5 items-center justify-center text-xs font-bold">G</span>
                Google로 계속하기
              </Button>
            </div>

            {/* 회원가입 안내 — 큼직하게 */}
            <div className="mt-8 rounded-3xl border-2 border-border bg-surface/60 p-5 text-center">
              <p className="text-base text-foreground">처음이신가요?</p>
              <Button
                type="button"
                size="xl"
                variant="outline"
                onClick={() => setShowSignup(true)}
                className="mt-3 h-14 w-full rounded-2xl text-lg font-semibold"
              >
                회원가입 <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}

        {/* ─── 회원가입 폼 ─── */}
        {showSignup && (
          <>
            <form className="mt-8 flex flex-col gap-5" onSubmit={handleSignup}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-base font-medium">이메일</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" className="h-14 rounded-2xl pl-12 text-lg" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-base font-medium">비밀번호</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" type="password" autoComplete="new-password" placeholder="6자 이상" className="h-14 rounded-2xl pl-12 text-lg" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} maxLength={128} required />
                </div>
              </div>

              <PhoneVerify
                verifiedPhone={verifiedPhone}
                onVerified={(p) => setVerifiedPhone(p)}
              />

              <div className="flex flex-col gap-2">
                <Label htmlFor="nickname" className="text-base font-medium">닉네임</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="nickname" placeholder="화면에 표시될 이름" className="h-14 rounded-2xl pl-12 text-lg" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="birthYear" className="text-base font-medium">출생연도</Label>
                  <Input id="birthYear" inputMode="numeric" placeholder="1958" className="h-14 rounded-2xl text-lg" value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, ""))} maxLength={4} required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="region" className="text-base font-medium">지역</Label>
                  <Input id="region" placeholder="서울 강남구" className="h-14 rounded-2xl text-lg" value={region} onChange={(e) => setRegion(e.target.value)} maxLength={50} required />
                </div>
              </div>

              <label className="mt-1 flex items-start gap-3 rounded-2xl border border-border/60 bg-surface/60 p-4 text-sm text-muted-foreground">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5 h-5 w-5" />
                <span>
                  <span className="text-foreground">이용약관</span> 및{" "}
                  <span className="text-foreground">개인정보 처리방침</span>에 동의합니다.
                </span>
              </label>

              <Button type="submit" size="xl" variant="hero" className="mt-2 h-16 gap-2 rounded-2xl text-lg font-semibold" disabled={submitting || !verifiedPhone}>
                {verifiedPhone ? "시작하기" : "휴대폰 인증 후 시작"}
                <ArrowRight className="h-5 w-5" />
              </Button>
            </form>

            <p className="mt-6 text-center text-base text-muted-foreground">
              이미 계정이 있으신가요?{" "}
              <button type="button" onClick={() => setShowSignup(false)} className="font-semibold text-foreground underline underline-offset-4">
                로그인
              </button>
            </p>
          </>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← 홈으로 돌아가기</Link>
        </p>
      </section>
    </PublicLayout>
  );
}
