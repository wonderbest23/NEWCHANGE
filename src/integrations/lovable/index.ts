// Lovable OAuth → Supabase OAuth로 대체
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions,
    ) => {
      const supabaseProvider =
        provider === "google"
          ? "google"
          : provider === "apple"
            ? "apple"
            : provider === "microsoft"
              ? "azure"
              : null;

      if (!supabaseProvider) {
        return { error: new Error(`지원하지 않는 소셜 로그인: ${provider}`) };
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: supabaseProvider as "google" | "apple" | "azure",
        options: {
          redirectTo: opts?.redirect_uri ?? `${window.location.origin}/auth`,
          queryParams: opts?.extraParams,
        },
      });

      if (error) return { error };

      // OAuth는 리디렉션으로 처리되므로 redirected: true 반환
      return { redirected: true };
    },
  },
};
