// Real Supabase auth provider. Filename kept as mock-auth.tsx for import stability.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedSession } from "@/lib/auth/session-cache";
import type { Session } from "@supabase/supabase-js";

export type MockUser = {
  id: string;
  email: string;
  nickname: string;
  birthYear: number;
  region: string; // "시도 시군구"
  verified: boolean;
  isAdmin?: boolean;
  createdAt: string;
};

type AuthCtx = {
  user: MockUser | null;
  userId: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<MockUser>;
  signUp: (input: {
    email: string;
    password: string;
    nickname: string;
    birthYear: number;
    region: string;
    agreed: boolean;
    verified?: boolean;
    phone?: string;
  }) => Promise<MockUser>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

async function buildMockUser(session: Session | null): Promise<MockUser | null> {
  if (!session?.user) return null;
  const u = session.user;
  const meta = u.user_metadata ?? {};
  const birthYear = Number(meta.birth_year ?? meta.birthYear ?? 0) || 0;
  const region = [meta.region_sido, meta.region_sigungu].filter(Boolean).join(" ") || "";
  const verified = meta.verified === true || meta.verified === "true";

  return {
    id: u.id,
    email: u.email ?? "",
    nickname: (meta.nickname as string | undefined) ?? (u.email?.split("@")[0] || "회원"),
    birthYear,
    region,
    verified,
    isAdmin: false,
    createdAt: u.created_at ?? new Date().toISOString(),
  };
}

export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) 리스너 먼저 등록 — 세션 캐시도 자동으로 동기화됨
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        setLoading(true);
      }
      buildMockUser(session)
        .then((u) => { setUser(u); setLoading(false); })
        .catch(() => { setUser(null); setLoading(false); });
    });

    // 2) 전역 세션 캐시를 통해 한 번만 getSession 실행
    getCachedSession().then(async (session) => {
      const next = await buildMockUser(session);
      setUser(next);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback<AuthCtx["signIn"]>(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const u = await buildMockUser(data.session);
    if (!u) throw new Error("로그인에 실패했습니다");
    setUser(u);
    return u;
  }, []);

  const signUp = useCallback<AuthCtx["signUp"]>(async (input) => {
    // region 분리 (e.g. "서울특별시 강남구")
    const parts = input.region.trim().split(/\s+/);
    const sido = parts[0] ?? "";
    const sigungu = parts.slice(1).join(" ") || "";

    const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          nickname: input.nickname,
          birth_year: String(input.birthYear),
          region_sido: sido,
          region_sigungu: sigungu,
          verified: input.verified ?? true,
          phone: input.phone ?? null,
        },
      },
    });
    if (error) throw new Error(error.message);

    // 이메일 확인이 필요할 수 있음 → session이 없을 수도 있음
    const u = await buildMockUser(data.session);
    if (u) setUser(u);
    return (
      u ?? {
        id: data.user?.id ?? "",
        email: input.email,
        nickname: input.nickname,
        birthYear: input.birthYear,
        region: input.region,
        verified: input.verified ?? true,
        createdAt: new Date().toISOString(),
      }
    );
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      userId: user?.id ?? null,
      isAuthenticated: !!user,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [user, loading, signIn, signUp, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within MockAuthProvider");
  return ctx;
}

// 호환용: 더 이상 사용되지 않지만 import 유지
export const DEMO_ADMIN = {
  email: "admin@gyeot.app",
  nickname: "관리자",
} as const;
