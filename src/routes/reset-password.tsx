import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "비밀번호 재설정 — 곁" },
      { name: "description", content: "이메일로 비밀번호를 안전하게 재설정하세요." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  // 단계: request(이메일 입력) → update(새 비밀번호 입력)
  const [stage, setStage] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Supabase는 비밀번호 재설정 링크 클릭 시 type=recovery 해시와 함께 리다이렉트하고
  // onAuthStateChange가 PASSWORD_RECOVERY 이벤트를 발생시킨다.
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setStage("update");
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStage("update");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("이메일을 입력해 주세요");
      return;
    }
    setSubmitting(true);
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;
      toast.success("재설정 메일을 보냈어요. 메일함을 확인해 주세요.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "메일 전송에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 해요");
      return;
    }
    if (password !== password2) {
      toast.error("두 비밀번호가 달라요");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("비밀번호가 변경되었어요. 다시 로그인해 주세요.");
      await supabase.auth.signOut();
      navigate({ to: "/auth", search: { mode: "signin" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <section className="mx-auto flex w-full max-w-lg flex-col px-5 py-12 sm:py-16">
        <div className="text-center">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            비밀번호 재설정
          </h1>
          <p className="mt-3 text-foreground/70 text-sm">
            {stage === "request"
              ? "가입한 이메일로 재설정 링크를 보내드려요."
              : "새로 사용할 비밀번호를 입력해 주세요."}
          </p>
        </div>

        {stage === "request" ? (
          <form className="mt-8 flex flex-col gap-5" onSubmit={handleRequest}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-base font-medium">이메일</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-14 rounded-2xl pl-12 text-lg"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              size="xl"
              variant="hero"
              className="mt-2 h-16 gap-2 rounded-2xl text-lg font-semibold"
              disabled={submitting}
            >
              재설정 메일 보내기 <ArrowRight className="h-5 w-5" />
            </Button>
          </form>
        ) : (
          <form className="mt-8 flex flex-col gap-5" onSubmit={handleUpdate}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password" className="text-base font-medium">새 비밀번호</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="6자 이상"
                  className="h-14 rounded-2xl pl-12 text-lg"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password-2" className="text-base font-medium">새 비밀번호 확인</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-password-2"
                  type="password"
                  autoComplete="new-password"
                  placeholder="한 번 더 입력해 주세요"
                  className="h-14 rounded-2xl pl-12 text-lg"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              size="xl"
              variant="hero"
              className="mt-2 h-16 gap-2 rounded-2xl text-lg font-semibold"
              disabled={submitting}
            >
              비밀번호 변경 <ArrowRight className="h-5 w-5" />
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-base text-muted-foreground">
          <Link to="/auth" className="font-semibold text-foreground underline underline-offset-4">
            로그인으로 돌아가기
          </Link>
        </p>
      </section>
    </PublicLayout>
  );
}
