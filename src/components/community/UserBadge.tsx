import { ShieldCheck, MapPin } from "lucide-react";
import type { Author } from "@/lib/community/types";
import { anonLabelForUser } from "@/lib/community/anon";

export function UserBadge({
  author,
  size = "sm",
  postId,
  isMe = false,
  anonLabel,
}: {
  author: Author;
  size?: "sm" | "md";
  postId?: string;
  isMe?: boolean;
  anonLabel?: string;
}) {
  const txt = size === "md" ? "text-base" : "text-sm";
  const label = anonLabel ?? anonLabelForUser(author.id);

  return (
    <div className={`flex items-center gap-2 ${txt}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-soft to-amber-soft text-xs font-semibold text-foreground/70">
        {label.replace("익명 #", "").slice(0, 2)}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight">
        <span className="font-medium text-foreground">
          {label}
          {isMe && <span className="ml-1 text-xs text-muted-foreground">(나)</span>}
        </span>
        {author.sigungu && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-sage-soft px-2 py-0.5 text-xs font-medium text-sage">
            <ShieldCheck className="h-3 w-3" />
            {author.sigungu} 인증
          </span>
        )}
        {!author.sigungu && author.sido && (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {author.sido}
          </span>
        )}
      </div>
    </div>
  );
}
