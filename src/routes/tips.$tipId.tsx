import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import {
  getTipDetail,
  incrementTipView,
  toggleTipLike,
  getMyTipLikes,
} from "@/server/tips/queries.functions";
import { getTipCategory, type TipDetail } from "@/lib/tips/types";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  Lightbulb,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth/mock-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/tips/$tipId")({
  head: ({ params }) => ({
    meta: [
      { title: `꿀팁 — 곁` },
      {
        name: "description",
        content: "어르신이 따라하기 쉬운 단계별 꿀팁",
      },
    ],
  }),
  component: TipDetailPage,
  errorComponent: ({ error }) => (
    <SeniorAppLayout>
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-fluid-lg text-muted-foreground">{error.message}</p>
        <Button asChild variant="hero" className="mt-6 rounded-full">
          <Link to="/tips">목록으로</Link>
        </Button>
      </div>
    </SeniorAppLayout>
  ),
  notFoundComponent: () => (
    <SeniorAppLayout>
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-fluid-lg text-muted-foreground">꿀팁을 찾을 수 없어요</p>
        <Button asChild variant="hero" className="mt-6 rounded-full">
          <Link to="/tips">목록으로</Link>
        </Button>
      </div>
    </SeniorAppLayout>
  ),
});

function TipDetailPage() {
  const { tipId } = Route.useParams();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [tip, setTip] = useState<TipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stepIdx, setStepIdx] = useState(0); // 0 = 표지, 1~N = step
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTipDetail({ data: { id: tipId } })
      .then((d) => {
        if (!active) return;
        setTip(d);
        setLikeCount(d?.like_count ?? 0);
      })
      .finally(() => active && setLoading(false));
    incrementTipView({ data: { id: tipId } }).catch(() => {});
    return () => {
      active = false;
    };
  }, [tipId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    getMyTipLikes()
      .then((ids) => setLiked(ids.includes(tipId)))
      .catch(() => {});
  }, [isAuthenticated, tipId]);

  if (loading) {
    return (
      <SeniorAppLayout>
        <p className="px-5 py-16 text-center text-fluid-base text-muted-foreground">
          불러오는 중…
        </p>
      </SeniorAppLayout>
    );
  }
  if (!tip) {
    return (
      <SeniorAppLayout>
        <div className="mx-auto max-w-md px-5 py-16 text-center">
          <p className="text-fluid-lg text-muted-foreground">
            꿀팁을 찾을 수 없어요
          </p>
          <Button asChild variant="hero" className="mt-6 rounded-full">
            <Link to="/tips">목록으로</Link>
          </Button>
        </div>
      </SeniorAppLayout>
    );
  }

  const cat = getTipCategory(tip.category_slug);
  const totalSteps = tip.steps.length;
  const isCover = stepIdx === 0;
  const isFinish = stepIdx > totalSteps;
  const currentStep = !isCover && !isFinish ? tip.steps[stepIdx - 1] : null;

  async function onLike() {
    if (!isAuthenticated) {
      toast.error("로그인이 필요해요");
      navigate({ to: "/auth" });
      return;
    }
    if (busy) return;
    setBusy(true);
    const prev = { liked, likeCount };
    setLiked(!liked);
    setLikeCount(likeCount + (liked ? -1 : 1));
    try {
      await toggleTipLike({ data: { id: tipId } });
    } catch (e) {
      setLiked(prev.liked);
      setLikeCount(prev.likeCount);
      toast.error("잠시 후 다시 시도해주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SeniorAppLayout>
      <div className="mx-auto w-full max-w-2xl px-5 pt-4 pb-32">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Button
            asChild
            variant="ghost"
            size="lg"
            className="-ml-3 h-12 gap-1 rounded-full px-3 text-fluid-base"
          >
            <Link to="/tips">
              <ArrowLeft className="h-5 w-5" /> 목록
            </Link>
          </Button>
          {cat && (
            <span className="rounded-full bg-muted px-3 py-1.5 text-fluid-sm font-medium text-foreground">
              {cat.name}
            </span>
          )}
        </div>

        {/* Cover */}
        {isCover && (
          <div className="mt-4">
            <div className="overflow-hidden rounded-3xl border-2 border-border bg-card">
              {tip.cover_image_url ? (
                <img
                  src={tip.cover_image_url}
                  alt=""
                  className="aspect-[16/10] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[16/10] w-full items-center justify-center bg-rose-soft">
                  <Lightbulb className="h-20 w-20 text-primary/60" />
                </div>
              )}
              <div className="px-5 py-6">
                <h1 className="font-display text-fluid-3xl font-semibold leading-tight tracking-tight text-foreground">
                  {tip.title}
                </h1>
                <p className="mt-3 text-fluid-lg leading-relaxed text-foreground/80">
                  {tip.summary}
                </p>
                <div className="mt-5 flex items-center gap-2 text-fluid-base text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="font-medium">총 {totalSteps}단계로 안내해드려요</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step */}
        {currentStep && (
          <div className="mt-4">
            <ProgressBar current={stepIdx} total={totalSteps} />
            <div className="mt-4 overflow-hidden rounded-3xl border-2 border-border bg-card">
              {currentStep.image_url && (
                <img
                  src={currentStep.image_url}
                  alt=""
                  className="aspect-[16/10] w-full object-cover"
                />
              )}
              <div className="px-5 py-6">
                <p className="text-fluid-base font-semibold text-primary">
                  {stepIdx} / {totalSteps} 단계
                </p>
                <p className="mt-3 text-fluid-2xl font-semibold leading-snug tracking-tight text-foreground">
                  {currentStep.text}
                </p>
                {currentStep.tip && (
                  <div className="mt-5 flex gap-3 rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
                    <Sparkles className="h-6 w-6 shrink-0 text-amber-600" />
                    <p className="text-fluid-base leading-relaxed text-foreground/90">
                      {currentStep.tip}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Finish */}
        {isFinish && (
          <div className="mt-4">
            <div className="rounded-3xl border-2 border-border bg-card px-5 py-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-soft">
                <CheckCircle2 className="h-9 w-9 text-primary" />
              </div>
              <h2 className="mt-4 font-display text-fluid-3xl font-semibold tracking-tight text-foreground">
                다 따라하셨어요!
              </h2>
              <p className="mt-2 text-fluid-lg text-muted-foreground">
                도움이 되셨다면 아래 버튼을 눌러주세요
              </p>
              <Button
                size="lg"
                variant={liked ? "default" : "outline"}
                onClick={onLike}
                disabled={busy}
                className={cn(
                  "mt-6 h-14 gap-2 rounded-full px-8 text-fluid-lg font-semibold",
                  liked && "bg-primary text-primary-foreground",
                )}
              >
                <ThumbsUp className="h-6 w-6" />
                {liked ? "도움됐어요!" : "도움됐어요"} · {likeCount}
              </Button>
              <div className="mt-8">
                <Button
                  asChild
                  variant="ghost"
                  size="lg"
                  className="rounded-full text-fluid-base"
                >
                  <Link to="/tips">다른 꿀팁 더 보기 →</Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Nav buttons - sticky bottom area */}
        <div className="fixed inset-x-0 bottom-20 z-30 px-5">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={stepIdx === 0}
              onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              className="h-14 flex-1 gap-1 rounded-full border-2 bg-background text-fluid-lg font-semibold shadow-md"
            >
              <ChevronLeft className="h-5 w-5" /> 이전
            </Button>
            {stepIdx <= totalSteps ? (
              <Button
                type="button"
                size="lg"
                variant="hero"
                onClick={() => setStepIdx((i) => i + 1)}
                className="h-14 flex-[1.4] gap-1 rounded-full text-fluid-lg font-semibold shadow-md"
              >
                {isCover ? "시작하기" : stepIdx === totalSteps ? "끝" : "다음"}
                <ChevronRight className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                asChild
                size="lg"
                variant="hero"
                className="h-14 flex-[1.4] gap-1 rounded-full text-fluid-lg font-semibold shadow-md"
              >
                <Link to="/tips">
                  목록으로 <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </SeniorAppLayout>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 flex-1 rounded-full transition-colors",
            i < current ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}
