import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HeartPulse, MessageCircleHeart, Mail, Flame, ChevronRight } from "lucide-react";
import { getTodayHighlights } from "@/lib/engagement/badges-actions";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { cn } from "@/lib/utils";

export function TodayOneThingWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["today-highlights"],
    queryFn: async () =>
      getTodayHighlights({ headers: await authHeaders() } as Parameters<typeof getTodayHighlights>[0]),
    staleTime: 60_000,
  });

  if (isLoading || !data) return null;

  // 우선순위: 오늘 안부 미완료 > 안 읽은 쪽지 > 동네 새 글 > 연속 기록 칭찬
  const items: Array<{
    icon: React.ElementType;
    title: string;
    desc: string;
    to: string;
    tone: string;
  }> = [];

  if (!data.checkinDoneToday) {
    items.push({
      icon: HeartPulse,
      title: "오늘 안부, 아직이에요",
      desc: data.checkinStreakDays > 0
        ? `${data.checkinStreakDays}일 연속 기록 중! 오늘도 이어가요`
        : "1분이면 끝나요. 지금 바로 시작해보세요",
      to: "/home",
      tone: "from-rose-soft to-amber-soft",
    });
  } else {
    items.push({
      icon: Flame,
      title: `${data.checkinStreakDays}일 연속 기록 중이에요`,
      desc: "오늘도 잘 하셨어요. 내일도 만나요",
      to: "/home",
      tone: "from-amber-soft to-sage-soft",
    });
  }

  if (data.unreadMessages > 0) {
    items.push({
      icon: Mail,
      title: `안 읽은 쪽지 ${data.unreadMessages}통`,
      desc: "이웃이 보낸 따뜻한 인사를 확인해보세요",
      to: "/home/messages",
      tone: "from-sage-soft to-rose-soft",
    });
  }

  if (data.newPostsTodayInRegion > 0) {
    items.push({
      icon: MessageCircleHeart,
      title: `${data.regionLabel ?? "우리 동네"} 새 글 ${data.newPostsTodayInRegion}개`,
      desc: "이웃들이 오늘 어떤 이야기를 나눴을까요?",
      to: "/community",
      tone: "from-amber-soft to-rose-soft",
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="mt-1 grid gap-2.5">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wider text-foreground/50">
        오늘의 한 가지
      </h2>
      {items.slice(0, 2).map((it, i) => {
        const Icon = it.icon;
        return (
          <Link
            key={i}
            to={it.to}
            className={cn(
              "group flex items-center gap-3 rounded-2xl border border-border/60 bg-gradient-to-r p-4 shadow-soft transition-all hover:shadow-glow",
              it.tone,
            )}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background/70 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">{it.title}</p>
              <p className="mt-0.5 line-clamp-1 text-sm text-foreground/70">{it.desc}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-foreground/40 transition-transform group-hover:translate-x-0.5" />
          </Link>
        );
      })}
    </section>
  );
}
