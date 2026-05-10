import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Badge = {
  key: string;
  emoji: string;
  title: string;
  description: string;
  earned: boolean;
  progress?: { current: number; target: number };
};

export type TodayHighlights = {
  checkinDoneToday: boolean;
  checkinStreakDays: number;
  newPostsTodayInRegion: number;
  unreadMessages: number;
  regionLabel: string | null;
};

function kstDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

/** 홈 상단 '오늘의 한 가지' 위젯 데이터 */
export const getTodayHighlights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TodayHighlights> => {
    const { supabase, userId } = context;

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [{ data: profile }, { data: checkins }, { count: unreadCount }] = await Promise.all([
      supabase
        .from("profiles")
        .select("region_sido, region_sigungu")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("health_checkins")
        .select("checkin_at")
        .eq("senior_user_id", userId)
        .gte("checkin_at", since.toISOString())
        .order("checkin_at", { ascending: false }),
      supabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null),
    ]);

    const todayKey = kstDayKey(new Date());
    const dayKeys = new Set<string>(
      (checkins ?? []).map((r) => kstDayKey(new Date(r.checkin_at))),
    );

    // streak
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (dayKeys.has(kstDayKey(d))) streak++;
      else if (i > 0) break; // 오늘 미체크여도 어제부터 카운트 시작 가능
    }

    // 같은 시군구의 오늘 새 글
    let newPostsToday = 0;
    if (profile?.region_sigungu) {
      const startISO = new Date(`${todayKey}T00:00:00+09:00`).toISOString();
      const { count } = await supabase
        .from("community_posts")
        .select("id", { count: "exact", head: true })
        .eq("region_sigungu", profile.region_sigungu)
        .gte("created_at", startISO);
      newPostsToday = count ?? 0;
    }

    return {
      checkinDoneToday: dayKeys.has(todayKey),
      checkinStreakDays: streak,
      newPostsTodayInRegion: newPostsToday,
      unreadMessages: unreadCount ?? 0,
      regionLabel: profile?.region_sigungu ?? profile?.region_sido ?? null,
    };
  });

/** 마이페이지 배지/칭호 */
export const getMyBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ badges: Badge[]; stats: { checkinTotal: number; checkinStreak: number; commentsCount: number; likesReceived: number; postsCount: number; walkTotal: number; walkStreak: number } }> => {
    const { supabase, userId } = context;

    const [{ count: checkinTotal }, { data: checkins }, { count: commentsCount }, { data: myPosts }] =
      await Promise.all([
        supabase
          .from("health_checkins")
          .select("id", { count: "exact", head: true })
          .eq("senior_user_id", userId),
        supabase
          .from("health_checkins")
          .select("checkin_at")
          .eq("senior_user_id", userId)
          .order("checkin_at", { ascending: false })
          .limit(60),
        supabase
          .from("community_comments")
          .select("id", { count: "exact", head: true })
          .eq("author_id", userId),
        supabase
          .from("community_posts")
          .select("id")
          .eq("author_id", userId),
      ]);

    // 산책 인증 통계
    const walkSince = new Date();
    walkSince.setDate(walkSince.getDate() - 30);
    const [{ count: walkTotalCount }, { data: walkRows }] = await Promise.all([
      supabase
        .from("walk_checkins" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("walk_checkins" as any)
        .select("checkin_at")
        .eq("user_id", userId)
        .gte("checkin_at", walkSince.toISOString())
        .order("checkin_at", { ascending: false }),
    ]);
    const walkDayKeys = new Set<string>(
      ((walkRows ?? []) as unknown as Array<{ checkin_at: string }>).map((r) =>
        kstDayKey(new Date(r.checkin_at)),
      ),
    );
    let walkStreak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (walkDayKeys.has(kstDayKey(d))) walkStreak++;
      else if (i > 0) break;
    }
    const walkTotal = walkTotalCount ?? 0;

    const postIds = (myPosts ?? []).map((p) => p.id);
    let likesReceived = 0;
    if (postIds.length > 0) {
      const { count } = await supabase
        .from("community_post_likes")
        .select("post_id", { count: "exact", head: true })
        .in("post_id", postIds);
      likesReceived = count ?? 0;
    }

    // streak
    const dayKeys = new Set<string>(
      (checkins ?? []).map((r) => kstDayKey(new Date(r.checkin_at))),
    );
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (dayKeys.has(kstDayKey(d))) streak++;
      else if (i > 0) break;
    }

    const total = checkinTotal ?? 0;
    const cmts = commentsCount ?? 0;
    const posts = postIds.length;

    const badges: Badge[] = [
      {
        key: "first_step",
        emoji: "🌱",
        title: "첫 걸음",
        description: "첫 안부를 남겼어요",
        earned: total >= 1,
        progress: { current: Math.min(total, 1), target: 1 },
      },
      {
        key: "health_guardian",
        emoji: "📞",
        title: "건강 지킴이",
        description: "안부 7일 연속 기록",
        earned: streak >= 7,
        progress: { current: Math.min(streak, 7), target: 7 },
      },
      {
        key: "health_master",
        emoji: "🏅",
        title: "꾸준한 어르신",
        description: "안부 30회 기록",
        earned: total >= 30,
        progress: { current: Math.min(total, 30), target: 30 },
      },
      {
        key: "warm_neighbor",
        emoji: "💬",
        title: "따뜻한 이웃",
        description: "댓글 10개 작성",
        earned: cmts >= 10,
        progress: { current: Math.min(cmts, 10), target: 10 },
      },
      {
        key: "popular_resident",
        emoji: "⭐",
        title: "인기 동네 주민",
        description: "받은 공감 20개",
        earned: likesReceived >= 20,
        progress: { current: Math.min(likesReceived, 20), target: 20 },
      },
      {
        key: "story_teller",
        emoji: "✍️",
        title: "이야기꾼",
        description: "글 5개 작성",
        earned: posts >= 5,
        progress: { current: Math.min(posts, 5), target: 5 },
      },
      {
        key: "walking_starter",
        emoji: "🚶",
        title: "산책 시작",
        description: "첫 산책 인증",
        earned: walkTotal >= 1,
        progress: { current: Math.min(walkTotal, 1), target: 1 },
      },
      {
        key: "walking_streak",
        emoji: "🌳",
        title: "산책 7일 연속",
        description: "일주일 매일 산책",
        earned: walkStreak >= 7,
        progress: { current: Math.min(walkStreak, 7), target: 7 },
      },
      {
        key: "walking_master",
        emoji: "🏞️",
        title: "산책 달인",
        description: "산책 30회 인증",
        earned: walkTotal >= 30,
        progress: { current: Math.min(walkTotal, 30), target: 30 },
      },
    ];

    return {
      badges,
      stats: {
        checkinTotal: total,
        checkinStreak: streak,
        commentsCount: cmts,
        likesReceived,
        postsCount: posts,
        walkTotal,
        walkStreak,
      },
    };
  });
