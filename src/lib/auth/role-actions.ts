import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AccountRoleInput = z.object({
  role: z.enum(["guardian", "senior"]),
});

export type AccountRole = z.infer<typeof AccountRoleInput>["role"];

export interface MyAppState {
  role: AccountRole | "admin" | "member";
  hasFamily: boolean;
  hasRecipient: boolean;
  /** 시니어=/home, 보호자=/watch, 관리자=/admin */
  destination: "/home" | "/watch" | "/admin" | "/onboarding";
}

async function readState(userId: string): Promise<MyAppState> {
  const [rolesRes, membershipRes] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin
      .from("family_members")
      .select("family_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (rolesRes.error) throw new Error(rolesRes.error.message);
  if (membershipRes.error) throw new Error(membershipRes.error.message);

  const roleNames = ((rolesRes.data ?? []) as Array<{ role: string }>).map((r) => r.role);
  const membership = membershipRes.data;
  const memberRole = membership?.role ?? "";

  // 우선순위: admin > senior > guardian > member
  // primary_senior 멤버십이 있으면 무조건 senior
  let role: MyAppState["role"];
  if (roleNames.includes("admin")) role = "admin";
  else if (roleNames.includes("senior") || memberRole === "primary_senior") role = "senior";
  else if (roleNames.includes("guardian") || memberRole === "primary_guardian" || memberRole === "guardian") role = "guardian";
  else role = "member";

  // admin은 /home을 기본 화면으로 사용 (어드민 콘솔은 /admin 직접 접근).
  // 그래야 admin 계정으로 로그인해도 음성 통화 등 시니어 화면을 바로 쓸 수 있음.
  const destination: MyAppState["destination"] =
    role === "guardian" ? "/watch" : "/home";

  return {
    role,
    hasFamily: Boolean(membership?.family_id),
    hasRecipient: Boolean(membership?.family_id),
    destination,
  };
}

export const setAccountRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AccountRoleInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .in("role", ["guardian", "senior"] as never[]);
    if (deleteError) throw new Error(`role delete: ${deleteError.message}`);

    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: data.role as never },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (insertError) throw new Error(`role insert: ${insertError.message}`);

    return readState(userId);
  });

export const getMyAppState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => readState(context.userId));
