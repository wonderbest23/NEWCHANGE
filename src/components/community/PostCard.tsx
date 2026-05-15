import { Link } from "@tanstack/react-router";
import { Eye, MessageCircle, ThumbsUp, Pin, ShieldCheck } from "lucide-react";
import { getCategory, type Post } from "@/lib/community/types";

export function PostCard({ post }: { post: Post }) {
  const cat = getCategory(post.category);
  const district = post.region_sigungu ?? post.author?.sigungu;
  // 모든 작성자는 "익명"으로 통일
  return (
    <Link
      to="/community/post/$postId"
      params={{ postId: post.id }}
      className="group block rounded-2xl border border-border/60 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft"
    >
      <div className="flex items-center gap-2">
        {post.pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Pin className="h-3 w-3" /> 고정
          </span>
        )}
        {cat && (
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-foreground/70">
            {cat.name}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{post.createdAgo}</span>
      </div>

      <h3 className="mt-2 font-display text-lg font-semibold text-foreground line-clamp-2 group-hover:text-primary">
        {post.title}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{post.body}</p>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="font-medium text-foreground/60">익명</span>
          {district && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-semibold text-sage">
              <ShieldCheck className="h-3 w-3" />
              {district}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{post.views}</span>
          <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{post.likes}</span>
          <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{post.comments}</span>
        </div>
      </div>
    </Link>
  );
}
