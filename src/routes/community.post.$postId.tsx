import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { Button } from "@/components/ui/button";
import { UserBadge } from "@/components/community/UserBadge";
import { getCategory, type Comment, type Post } from "@/lib/community/types";
import { getPost, listSameDistrictPosts } from "@/server/community/queries.functions";
import { createComment, togglePostLike } from "@/server/community/mutations.functions";
import { useAuth } from "@/lib/auth/mock-auth";
import { ChevronLeft, Eye, ThumbsUp, MessageCircle, Flag, Share2, Loader2, Sparkles, Mail, ShieldCheck } from "lucide-react";
import { anonLabelForPost, anonLabelForPair } from "@/lib/community/anon";
import { sendDirectMessage } from "@/server/messages/messages.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders } from "@/lib/auth/server-fn-headers";

export const Route = createFileRoute("/community/post/$postId")({
  component: PostDetail,
  notFoundComponent: () => (
    <SeniorAppLayout>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl">글을 찾을 수 없어요</h1>
        <Button asChild className="mt-6"><Link to="/community">커뮤니티로</Link></Button>
      </div>
    </SeniorAppLayout>
  ),
});

function PostDetail() {
  const { postId } = Route.useParams();
  const { isAuthenticated, userId } = useAuth();
  const [dmOpen, setDmOpen] = useState(false);
  const [dmBody, setDmBody] = useState("");
  const [dmSending, setDmSending] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [liking, setLiking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [sameDistrict, setSameDistrict] = useState<Array<{ id: string; title: string; createdAgo: string }>>([]);

  const draftButtons: Array<{ label: string; text: string }> = [
    { label: "응원 댓글", text: "많이 힘드셨겠어요. 오늘은 무리하지 말고 편히 쉬셨으면 좋겠습니다." },
    { label: "나도 그래요", text: "저도 비슷한 경험이 있어서 공감됩니다. 이야기 나눠주셔서 감사합니다." },
    { label: "정보 고마워요", text: "좋은 정보 알려주셔서 감사합니다. 저도 참고해보겠습니다." },
    { label: "더 알려주세요", text: "혹시 자세한 방법이나 위치를 조금 더 알려주실 수 있을까요?" },
  ];

  const insertDraft = (text: string) => {
    setBody((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return text;
      return prev.endsWith("\n") ? prev + text : prev + "\n" + text;
    });
  };

  const onAskAi = async () => {
    if (!post) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const cat = getCategory(post.category);
      const { data, error } = await supabase.functions.invoke("ai-assist", {
        body: {
          task: "answer",
          title: post.title,
          body: post.body,
          category: cat?.name ?? post.category,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiAnswer(data?.text ?? "");
    } catch (err) {
      toast.error((err as Error).message || "AI 답변을 가져오지 못했어요");
    } finally {
      setAiLoading(false);
    }
  };

  const reload = () => {
    setLoading(true);
    getPost({ data: { id: postId } })
      .then((res) => {
        if (!res) {
          setPost(null);
        } else {
          setPost(res.post);
          setComments(res.comments);
        }
      })
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [postId]);

  useEffect(() => {
    const sigungu = post?.region_sigungu ?? post?.author?.sigungu;
    if (!sigungu) {
      setSameDistrict([]);
      return;
    }
    listSameDistrictPosts({ data: { sigungu, excludePostId: postId } })
      .then(setSameDistrict)
      .catch(() => setSameDistrict([]));
  }, [post?.region_sigungu, post?.author?.sigungu, postId]);

  if (loading) {
    return (
      <SeniorAppLayout>
        <div className="mx-auto flex max-w-2xl items-center justify-center px-6 py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SeniorAppLayout>
    );
  }
  if (!post) throw notFound();

  const cat = getCategory(post.category);

  const onLike = async () => {
    if (!isAuthenticated) {
      toast.error("로그인이 필요해요");
      return;
    }
    setLiking(true);
    // 낙관적 업데이트: 즉시 +1/-1 반영, 새로고침 없이 종료
    const prev = post;
    setPost((p) => (p ? { ...p, likes: Math.max(0, p.likes + 1) } : p));
    try {
      const res = await togglePostLike({ data: { postId }, headers: await authHeaders() });
      if (res && res.liked === false) {
        // 실제로는 좋아요 취소였음 → -2 보정 (위에서 +1 했으니)
        setPost((p) => (p ? { ...p, likes: Math.max(0, p.likes - 2) } : p));
      }
    } catch (e) {
      setPost(prev); // 롤백
      toast.error((e as Error).message);
    } finally {
      setLiking(false);
    }
  };

  const onSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error("로그인이 필요해요");
      return;
    }
    if (body.trim().length < 1) return;
    setSubmitting(true);
    try {
      await createComment({ data: { postId, body: body.trim() }, headers: await authHeaders() });
      setBody("");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const subHeader = (
    <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 py-2.5">
      <Link
        to="/community"
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <span className="flex-1 truncate text-sm font-medium text-foreground">커뮤니티</span>
      {cat && (
        <Link
          to="/community/c/$slug"
          params={{ slug: cat.slug }}
          className="rounded-full bg-rose-soft px-3 py-1 text-xs font-semibold text-primary"
        >
          {cat.name}
        </Link>
      )}
    </div>
  );

  return (
    <SeniorAppLayout subHeader={subHeader}>
      <article className="mx-auto w-full max-w-3xl px-4 pb-28 pt-2 sm:px-6">

        {/* ── 1. 글 헤더 ── */}
        <header>
          <h1 className="font-display text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
            {post.title}
          </h1>

          {/* 작성자 정보 */}
          <div className="mt-5 flex items-center gap-3 border-b border-border/50 pb-4">
            {/* 아바타 */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-soft to-amber-soft text-sm font-semibold text-foreground/70">
              {anonLabelForPost(post.id, post.author.id).replace("익명 #", "").slice(0, 2)}
            </div>

            {/* 이름 + 메타정보 */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">
                  {anonLabelForPost(post.id, post.author.id)}
                </span>
                {userId === post.author.id && (
                  <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">나</span>
                )}
                {post.author.sigungu && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-medium text-sage">
                    <ShieldCheck className="h-3 w-3" />{post.author.sigungu} 인증
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{post.createdAgo}</span>
                <span>·</span>
                <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />조회 {post.views}</span>
                <span>·</span>
                <span className="flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />공감 {post.likes}</span>
              </div>
            </div>

            {/* 쪽지 버튼 */}
            {isAuthenticated && userId !== post.author.id && !post.author.id.startsWith("00000000") && (
              <button
                onClick={() => setDmOpen((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                <Mail className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* ── 쪽지 패널 (조건부) ── */}
        {dmOpen && isAuthenticated && userId !== post.author.id && (
          <div className="mt-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">
              {anonLabelForPair(userId!, post.author.id)} 님에게 쪽지
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              하루 5건까지. 전화번호·계좌·주소는 적지 마세요.
            </p>
            <textarea
              rows={4}
              maxLength={500}
              value={dmBody}
              onChange={(e) => setDmBody(e.target.value)}
              placeholder="따뜻한 한마디를 적어 보내세요."
              className="mt-3 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{dmBody.length} / 500</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setDmOpen(false); setDmBody(""); }}>
                  취소
                </Button>
                <Button
                  size="sm"
                  variant="hero"
                  className="rounded-full"
                  disabled={dmSending || dmBody.trim().length < 1}
                  onClick={async () => {
                    setDmSending(true);
                    try {
                      await sendDirectMessage({ data: { recipientId: post.author.id, body: dmBody.trim() }, headers: await authHeaders() });
                      toast.success("쪽지를 보냈어요");
                      setDmBody(""); setDmOpen(false);
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setDmSending(false);
                    }
                  }}
                >
                  {dmSending ? "보내는중…" : "보내기"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. 본문 ── */}
        <div className="mt-6 border-t border-border/50 pt-6">
          <p className="whitespace-pre-line text-base leading-[1.9] text-foreground sm:text-[17px]">
            {post.body}
          </p>
        </div>

        {/* ── AI 1차 안내 (법률/복지/구인) ── */}
        {(["legal", "welfare", "jobs"] as const).includes(post.category as any) && (
          <div className="mt-6 rounded-2xl border border-primary/20 bg-rose-soft/30 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">AI 1차 안내</span>
              </div>
              {!aiAnswer && (
                <Button size="sm" variant="hero" className="rounded-full" onClick={onAskAi} disabled={aiLoading}>
                  {aiLoading ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />작성중…</> : "AI 답변 받기"}
                </Button>
              )}
            </div>
            {aiAnswer ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{aiAnswer}</p>
            ) : !aiLoading && (
              <p className="mt-2 text-xs text-muted-foreground">
                전문가 답변 전, 일반적인 안내를 AI에게 먼저 물어볼 수 있어요.
              </p>
            )}
          </div>
        )}

        {/* ── 3. 반응 버튼 ── */}
        <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3">
          <button
            onClick={onLike}
            disabled={liking}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-soft px-5 py-2 text-sm font-semibold text-primary transition hover:bg-rose-soft/70 disabled:opacity-60"
          >
            <ThumbsUp className="h-4 w-4" /> 공감 {post.likes}
          </button>
          <div className="h-4 w-px bg-border/60" />
          <button className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <Share2 className="h-4 w-4" /> 공유
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-destructive">
            <Flag className="h-4 w-4" /> 신고
          </button>
        </div>

        {/* ── 4. 댓글 섹션 ── */}
        <section className="mt-10 border-t border-border/50 pt-8">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
            <MessageCircle className="h-5 w-5 text-primary" />
            댓글
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">
              {comments.length}
            </span>
          </h2>


          {/* 댓글 작성 폼 */}
          <form onSubmit={onSubmitComment} className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={isAuthenticated ? "이웃에게 따뜻한 한마디를 남겨주세요." : "로그인 후 댓글을 작성할 수 있어요."}
              disabled={!isAuthenticated || submitting}
              className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between border-t border-border/50 bg-surface/50 px-4 py-2.5">
              <span className="text-xs text-muted-foreground">
                {isAuthenticated ? "본인인증 회원만 댓글 작성 가능" : "로그인이 필요해요"}
              </span>
              <Button
                size="sm"
                variant="hero"
                className="rounded-full px-4"
                type="submit"
                disabled={!isAuthenticated || submitting || body.trim().length < 1}
              >
                {submitting ? "등록중…" : "등록"}
              </Button>
            </div>
          </form>

          {/* 댓글 목록 */}
          {comments.length > 0 && (
            <ul className="mt-5 flex flex-col divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card">
              {comments.map((c) => (
                <li key={c.id} className="px-4 py-4">
                  <UserBadge
                    author={c.author}
                    postId={postId}
                    isMe={userId === c.author.id}
                    anonLabel={c.ai_generated ? "동네지킴이 AI" : anonLabelForPost(postId, c.author.id)}
                  />
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">{c.body}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{c.createdAgo}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 5. 같은 동네 글 ── */}
        {(post.region_sigungu ?? post.author?.sigungu) && (
          <section className="mt-10 border-t border-border/50 pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              같은 동네 이웃 글
            </h2>
            {sameDistrict.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                아직 같은 동네 글이 없어요. 첫 이야기를 남겨보세요.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {sameDistrict.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/community/post/$postId"
                      params={{ postId: p.id }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 transition hover:border-primary/40"
                    >
                      <p className="line-clamp-1 text-sm font-medium text-foreground">{p.title}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.createdAgo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </article>
    </SeniorAppLayout>
  );
}
