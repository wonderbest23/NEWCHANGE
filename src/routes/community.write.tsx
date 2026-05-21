import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { useEffect, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { Button } from "@/components/ui/button";
import type { CategorySlug } from "@/lib/community/types";
import { createPost } from "@/server/community/mutations.functions";
import { ChevronLeft, HeartHandshake, Info, Loader2, MessageCircle, Newspaper, Sparkles } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/lib/auth/mock-auth";
import { UserBadge } from "@/components/community/UserBadge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { cn } from "@/lib/utils";

const search = z.object({
  category: z.enum(["free", "jobs", "legal", "welfare", "news", "agency"]).optional(),
});

const WRITE_INTENTS: Array<{
  category: CategorySlug;
  label: string;
  helper: string;
  icon: typeof MessageCircle;
  titlePlaceholder: string;
  bodyPlaceholder: string;
}> = [
  {
    category: "free",
    label: "일상 이야기",
    helper: "오늘 있었던 일, 안부, 같이 나누고 싶은 이야기",
    icon: MessageCircle,
    titlePlaceholder: "예: 오늘 시장에 다녀왔어요",
    bodyPlaceholder: "편하게 이야기하듯 적어주세요. 짧게 적어도 괜찮아요.",
  },
  {
    category: "welfare",
    label: "궁금한 것",
    helper: "복지, 병원, 생활 문제, 도움이 필요한 일",
    icon: HeartHandshake,
    titlePlaceholder: "예: 보건소 검진은 어떻게 예약하나요?",
    bodyPlaceholder: "어떤 점이 궁금한지, 어디에서 도움이 필요한지 적어주세요.",
  },
  {
    category: "news",
    label: "동네 소식",
    helper: "행사, 강좌, 좋은 장소, 함께 알면 좋은 정보",
    icon: Newspaper,
    titlePlaceholder: "예: 이번 주 주민센터 강좌가 있어요",
    bodyPlaceholder: "장소, 날짜, 알면 좋은 내용을 적어주세요.",
  },
];

function getIntent(category: CategorySlug) {
  return WRITE_INTENTS.find((i) => i.category === category) ?? WRITE_INTENTS[0];
}

function buildLocalTitleSuggestions(category: CategorySlug, draft: string, body: string) {
  const source = (draft || body)
    .replace(/\s+/g, " ")
    .replace(/[.?!。！？]+$/g, "")
    .trim();
  const short = source.slice(0, 16);
  const intent = getIntent(category);

  if (!short) return [];
  if (category === "welfare") {
    return [`${short} 궁금해요`, `${intent.label} 도움 부탁드려요`, `${short} 알려주세요`].slice(0, 3);
  }
  if (category === "news") {
    return [`${short} 소식`, `함께 알아두면 좋아요`, `${intent.label} 나눠요`].slice(0, 3);
  }
  return [`${short} 이야기`, `오늘의 작은 이야기`, `이웃과 나누고 싶어요`].slice(0, 3);
}

export const Route = createFileRoute("/community/write")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  validateSearch: (s) => search.parse(s),
  component: WritePage,
});

type WriteStep = "kind" | "title" | "body";

function WritePage() {
  const { category: initialCategory } = Route.useSearch();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [category, setCategory] = useState<CategorySlug>(
    initialCategory && WRITE_INTENTS.some((i) => i.category === initialCategory)
      ? initialCategory
      : "free",
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [step, setStep] = useState<WriteStep>("kind");
  const [submitting, setSubmitting] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [suggestingTitle, setSuggestingTitle] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [titleSuggestionSource, setTitleSuggestionSource] = useState("");
  const [suggestingBody, setSuggestingBody] = useState(false);
  const [bodySuggestion, setBodySuggestion] = useState("");
  const [bodySuggestionSource, setBodySuggestionSource] = useState("");

  const onPolish = async () => {
    if (body.trim().length < 5) {
      toast.error("다듬을 본문을 먼저 입력해주세요");
      return;
    }
    setPolishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assist", {
        body: { task: "polish", title, body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.text) {
        setBodySuggestion(data.text.trim());
        setBodySuggestionSource(`${title.trim()}\n${body.trim()}`);
        toast.success("AI가 다듬은 글을 준비했어요");
      }
    } catch (err) {
      toast.error((err as Error).message || "AI 다듬기에 실패했어요");
    } finally {
      setPolishing(false);
    }
  };

  useEffect(() => {
    if (step !== "title") return;
    const draft = title.trim();
    if (draft.length < 2) {
      setTitleSuggestions([]);
      return;
    }
    const source = `${category}:${draft}`;
    if (source === titleSuggestionSource) return;
    const timer = window.setTimeout(async () => {
      setSuggestingTitle(true);
      const fallback = buildLocalTitleSuggestions(category, draft, body);
      try {
        const { data, error } = await supabase.functions.invoke("ai-assist", {
          body: { task: "suggest_title", title: draft, body, category },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const suggestions = String(data?.text ?? "")
          .split(/\n+/)
          .map((line) =>
            line
              .replace(/^\s*[-*\d.)]+\s*/, "")
              .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 3);
        setTitleSuggestions(suggestions.length > 0 ? suggestions : fallback);
        setTitleSuggestionSource(source);
      } catch (err) {
        console.error("[community-write] title suggestion failed", err);
        setTitleSuggestions(fallback);
        setTitleSuggestionSource(source);
      } finally {
        setSuggestingTitle(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [body, category, step, title, titleSuggestionSource]);

  useEffect(() => {
    if (step !== "body") return;
    const draft = body.trim();
    if (draft.length < 12) {
      setBodySuggestion("");
      return;
    }
    const source = `${title.trim()}\n${draft}`;
    if (source === bodySuggestionSource) return;
    const timer = window.setTimeout(async () => {
      setSuggestingBody(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-assist", {
          body: { task: "polish", title, body: draft, category },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const suggestion = String(data?.text ?? "").trim();
        if (suggestion && suggestion !== draft) {
          setBodySuggestion(suggestion);
          setBodySuggestionSource(source);
        }
      } catch (err) {
        console.error("[community-write] body suggestion failed", err);
      } finally {
        setSuggestingBody(false);
      }
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [body, bodySuggestionSource, category, step, title]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: "/auth", search: { mode: "signin" } });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated || !user) return null;

  const selectedIntent = getIntent(category);

  const author = {
    id: user.id,
    handle: user.nickname,
    age: user.birthYear ? new Date().getFullYear() - user.birthYear : 0,
    sido: user.region.split(" ")[0] ?? "",
    sigungu: user.region.split(" ").slice(1).join(" ") ?? "",
    verified: user.verified,
  };

  const goTitleStep = () => setStep("title");
  const goBodyStep = () => {
    if (title.trim().length < 2) {
      toast.error("제목을 2자 이상 적어주세요");
      return;
    }
    setStep("body");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) {
      setStep("title");
      toast.error("제목을 2자 이상 적어주세요");
      return;
    }
    if (body.trim().length < 2) {
      setStep("body");
      toast.error("내용을 조금만 적어주세요");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createPost({
        data: { category, title: title.trim(), body: body.trim() },
        headers: await authHeaders(),
      });
      toast.success("등록되었습니다");
      navigate({ to: "/community/post/$postId", params: { postId: res.id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SeniorAppLayout>
      <div className="mx-auto w-full max-w-3xl pb-24">
        <Link to="/community" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> 이야기방
        </Link>

        <header className="mt-5 rounded-3xl bg-gradient-to-br from-rose-soft/80 via-background to-sage-soft/70 px-5 py-6 shadow-soft">
          <p className="inline-flex items-center gap-2 rounded-full bg-background/85 px-3 py-1 text-sm font-bold text-primary">
            <MessageCircle className="h-4 w-4" />
            글쓰기
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground">
            어떤 이야기를 남길까요?
          </h1>
          <p className="mt-2 text-lg leading-relaxed text-foreground/70">
            한 단계씩 천천히 적어볼게요.
          </p>
        </header>

        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span>이렇게 표시돼요:</span>
          <UserBadge author={author} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1.5">
          {[
            { key: "kind", label: "1. 종류" },
            { key: "title", label: "2. 제목" },
            { key: "body", label: "3. 내용" },
          ].map((item) => (
            <div
              key={item.key}
              className={cn(
                "rounded-xl px-2 py-2 text-center text-sm font-bold",
                step === item.key ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/55",
              )}
            >
              {item.label}
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-5">
          {step === "kind" && (
            <section className="rounded-3xl border-2 border-border/70 bg-background p-4 shadow-soft">
              <p className="px-1 text-base font-bold text-foreground">무엇에 가까운가요?</p>
              <div className="mt-3 grid gap-3">
                {WRITE_INTENTS.map((intent) => {
                  const active = intent.category === category;
                  const Icon = intent.icon;
                  return (
                    <button
                      key={intent.category}
                      type="button"
                      onClick={() => setCategory(intent.category)}
                      className={cn(
                        "flex min-h-[76px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.99]",
                        active
                          ? "border-primary bg-primary/8 text-foreground shadow-sm"
                          : "border-border bg-surface/50 text-foreground hover:border-primary/30",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                          active ? "bg-primary text-primary-foreground" : "bg-background text-primary",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-bold">{intent.label}</span>
                        <span className="mt-0.5 block text-sm leading-snug text-foreground/60">
                          {intent.helper}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="hero"
                className="mt-4 h-14 w-full rounded-2xl text-base font-bold"
                onClick={goTitleStep}
              >
                다음
              </Button>
            </section>
          )}

          {step === "title" && (
            <section className="rounded-3xl border-2 border-border/70 bg-background p-5 shadow-soft">
              <p className="text-sm font-bold text-primary">2단계</p>
              <label className="mt-2 block text-xl font-bold">제목을 적어주세요</label>
              <p className="mt-1 text-base leading-relaxed text-foreground/60">
                이웃들이 한눈에 알 수 있게 짧게 적으면 좋아요.
              </p>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleSuggestions([]);
                }}
                maxLength={120}
                placeholder={selectedIntent.titlePlaceholder}
                className="mt-4 w-full rounded-2xl border-2 border-border bg-background px-5 py-4 text-lg focus:border-primary focus:outline-none"
                autoFocus
              />
              {(suggestingTitle || titleSuggestions.length > 0) && (
                <div className="mt-4 rounded-2xl border border-primary/20 bg-rose-soft/35 p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-primary">
                    {suggestingTitle ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {suggestingTitle ? "AI가 제목을 생각하고 있어요" : "이런 제목은 어떠세요?"}
                  </p>
                  {titleSuggestions.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {titleSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setTitle(suggestion);
                            setTitleSuggestions([]);
                            setTitleSuggestionSource(`${category}:${suggestion}`);
                          }}
                          className="rounded-xl border border-primary/20 bg-background px-4 py-3 text-left text-base font-bold text-foreground transition hover:border-primary/50"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 grid grid-cols-[0.8fr_1.2fr] gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 rounded-2xl text-base font-bold"
                  onClick={() => setStep("kind")}
                >
                  이전
                </Button>
                <Button
                  type="button"
                  variant="hero"
                  className="h-14 rounded-2xl text-base font-bold"
                  onClick={goBodyStep}
                >
                  제목 완료
                </Button>
              </div>
            </section>
          )}

          {step === "body" && (
            <>
              <section className="rounded-3xl border-2 border-border/70 bg-background p-5 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-primary">3단계</p>
                    <label className="mt-2 block text-xl font-bold">내용을 적어주세요</label>
                  </div>
                  <button
                    type="button"
                    onClick={onPolish}
                    disabled={polishing || suggestingBody || body.trim().length < 5}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-rose-soft/40 px-3 py-1.5 text-sm font-bold text-primary transition-colors hover:bg-rose-soft disabled:opacity-50"
                  >
                    {polishing || suggestingBody ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {polishing || suggestingBody ? "AI 확인 중…" : "AI 다시 추천"}
                  </button>
                </div>
                <p className="mt-2 rounded-2xl bg-muted px-4 py-3 text-base font-bold text-foreground/75">
                  제목: {title.trim()}
                </p>
                <textarea
                  rows={10}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setBodySuggestion("");
                  }}
                  maxLength={10000}
                  placeholder={selectedIntent.bodyPlaceholder}
                  className="mt-4 w-full resize-none rounded-2xl border-2 border-border bg-background px-5 py-4 text-lg leading-relaxed focus:border-primary focus:outline-none"
                  autoFocus
                />
                {(suggestingBody || bodySuggestion) && (
                  <div className="mt-4 rounded-2xl border border-primary/20 bg-rose-soft/35 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-primary">
                      {suggestingBody ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {suggestingBody ? "AI가 글을 다듬고 있어요" : "AI가 이렇게 다듬었어요"}
                    </p>
                    {bodySuggestion && (
                      <>
                        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-background px-4 py-3 text-base leading-relaxed text-foreground/80">
                          {bodySuggestion}
                        </p>
                        <Button
                          type="button"
                          variant="hero"
                          className="mt-3 h-12 w-full rounded-xl text-base font-bold"
                          onClick={() => {
                            const nextBody = bodySuggestion;
                            setBody(bodySuggestion);
                            setBodySuggestion("");
                            setBodySuggestionSource(`${title.trim()}\n${nextBody.trim()}`);
                          }}
                        >
                          이 내용으로 바꾸기
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </section>

              <div className="flex items-start gap-2 rounded-2xl bg-amber-soft/45 p-4 text-sm font-medium leading-relaxed text-foreground/70">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-warm" />
                <span>
                  전화번호, 계좌번호, 주민번호 같은 개인정보는 적지 마세요.
                </span>
              </div>

              <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 rounded-2xl text-base font-bold"
                  onClick={() => setStep("title")}
                >
                  이전
                </Button>
                <Button type="submit" variant="hero" className="h-14 rounded-2xl text-base font-bold" disabled={submitting}>
                  {submitting ? "등록중…" : "등록하기"}
                </Button>
              </div>
            </>
          )}

          {step !== "body" && (
            <Button
              type="button"
              variant="outline"
              className="h-14 rounded-2xl text-base font-bold"
              asChild
            >
              <Link to="/community">취소</Link>
            </Button>
          )}
        </form>
      </div>
    </SeniorAppLayout>
  );
}
