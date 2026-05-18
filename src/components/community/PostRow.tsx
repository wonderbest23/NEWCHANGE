import { Link } from "@tanstack/react-router";
import { Eye, MessageCircle, ThumbsUp, Pin, ShieldCheck } from "lucide-react";
import { getCategory, type Post } from "@/lib/community/types";

export function PostRow({ post, showRegion = true }: { post: Post; showRegion?: boolean }) {
  const cat = getCategory(post.category);
  const district = post.region_sigungu ?? post.author?.sigungu;
  // 모든 작성자는 "익명"으로 통일 (식별 코드 제거)
  const anon = "익명";
  return (
    <Link
      to="/community/post/$postId"
      params={{ postId: post.id }}
      className="group block rounded-3xl border border-border/70 bg-background px-5 py-5 shadow-soft transition-colors hover:border-primary/30 hover:bg-surface/60"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {post.pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-soft px-2.5 py-1 font-bold text-primary">
            <Pin className="h-3.5 w-3.5" />
            고정
          </span>
        )}
        {cat && (
          <span className="rounded-full bg-muted px-2.5 py-1 font-bold text-foreground/70">
            {cat.name}
          </span>
        )}
        <span className="font-medium text-muted-foreground">{post.createdAgo}</span>
      </div>

      <h3 className="mt-3 line-clamp-2 text-2xl font-bold leading-snug tracking-tight text-foreground group-hover:text-primary">
        {post.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-base leading-relaxed text-muted-foreground">{post.body}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="font-bold text-foreground/60">{anon}</span>
          {showRegion && district && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sage-soft px-2.5 py-1 text-sm font-bold text-sage">
              <ShieldCheck className="h-3.5 w-3.5" />
              {district}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 font-semibold">
          <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" />{post.views}</span>
          <span className="inline-flex items-center gap-1"><ThumbsUp className="h-4 w-4" />{post.likes}</span>
          <span className="inline-flex items-center gap-1"><MessageCircle className="h-4 w-4" />{post.comments}</span>
        </div>
      </div>
    </Link>
  );
}
