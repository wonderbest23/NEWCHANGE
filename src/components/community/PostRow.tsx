import { Link } from "@tanstack/react-router";
import { Eye, MessageCircle, ThumbsUp, Pin, ShieldCheck } from "lucide-react";
import { getCategory, type Post } from "@/lib/community/types";
import { anonLabelForPost } from "@/lib/community/anon";

export function PostRow({ post, showRegion = true }: { post: Post; showRegion?: boolean }) {
  const cat = getCategory(post.category);
  const district = post.region_sigungu ?? post.author?.sigungu;
  const anon = anonLabelForPost(post.id, post.author.id);
  return (
    <Link
      to="/community/post/$postId"
      params={{ postId: post.id }}
      className="group block border-b border-border/50 px-2 py-4 transition-colors hover:bg-surface/60 sm:px-3"
    >
      <div className="flex items-center gap-2 text-xs">
        {post.pinned && (
          <span className="inline-flex items-center gap-0.5 rounded-sm bg-rose-soft px-1.5 py-0.5 font-semibold text-primary">
            <Pin className="h-3 w-3" />
          </span>
        )}
        {cat && <span className="font-medium text-foreground/60">{cat.name}</span>}
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{post.createdAgo}</span>
        {showRegion && district && (
          <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-medium text-sage">
            <ShieldCheck className="h-3 w-3" />
            {district}
          </span>
        )}
      </div>

      <h3 className="mt-1.5 line-clamp-2 text-base font-semibold tracking-tight text-foreground group-hover:text-primary sm:text-[17px]">
        {post.title}
      </h3>
      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{post.body}</p>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground/60">{anon}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-0.5"><Eye className="h-3.5 w-3.5" />{post.views}</span>
          <span className="inline-flex items-center gap-0.5"><ThumbsUp className="h-3.5 w-3.5" />{post.likes}</span>
          <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-3.5 w-3.5" />{post.comments}</span>
        </div>
      </div>
    </Link>
  );
}
