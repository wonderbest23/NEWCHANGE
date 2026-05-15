import { ShieldCheck, MapPin, User as UserIcon } from "lucide-react";
import type { Author } from "@/lib/community/types";

export function UserBadge({
  author,
  size = "sm",
  isMe = false,
  anonLabel,
}: {
  author: Author;
  size?: "sm" | "md";
  postId?: string;
  isMe?: boolean;
  /** AI 봇 등 특수 라벨이 필요한 경우만 명시적으로 전달. 일반 인간 작성자는 항상 "익명"으로 표시됨. */
  anonLabel?: string;
}) {
  const txt = size === "md" ? "text-base" : "text-sm";
  // 모든 작성자는 "익명"으로 통일 (식별 코드 제거).
  // AI 봇 등 특수 케이스만 anonLabel prop 으로 명시적으로 표시.
  const label = anonLabel ?? "익명";

  return (
    <div className={`flex items-center gap-2 ${txt}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-soft to-amber-soft text-foreground/60">
        <UserIcon className="h-4 w-4" />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight">
        <span className="font-medium text-foreground">
          {label}
          {isMe && <span className="ml-1 text-xs text-muted-foreground">(나)</span>}
        </span>
        {author.sigungu && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-sage-soft px-2 py-0.5 text-xs font-semibold text-sage">
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
