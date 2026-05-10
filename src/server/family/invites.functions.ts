import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface InviteRow {
  id: string;
  token: string;
  display_label: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

const CreateInput = z.object({
  label: z.string().trim().min(1).max(40).nullable().optional(),
});

const AcceptInput = z.object({
  // DB 함수(accept_family_invite)의 토큰 길이 검증과 일치
  token: z.string().min(16).max(256),
});

function genToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

export const createGuardianInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // 사용자의 가족 그룹 조회
    const { data: membership, error: memErr } = await supabaseAdmin
      .from("family_members")
      .select("family_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);
    if (!membership?.family_id) throw new Error("가족 그룹이 없습니다");

    const token = genToken();
    const { data: row, error } = await supabaseAdmin
      .from("family_invites")
      .insert({
        family_id: membership.family_id,
        token,
        invited_by_user_id: userId,
        role: "guardian",
        display_label: data.label ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as InviteRow;
  });

export const listMyInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin
      .from("family_invites")
      .select("id, token, display_label, expires_at, used_at, created_at")
      .eq("invited_by_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as InviteRow[];
  });

export interface InvitePreview {
  family_name: string | null;
  inviter_nickname: string | null;
  display_label: string | null;
  expires_at: string;
  used: boolean;
  expired: boolean;
}

export const previewInvite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AcceptInput.parse(d))
  .handler(async ({ data }) => {
    const { data: inv, error } = await supabaseAdmin
      .from("family_invites")
      .select("family_id, invited_by_user_id, display_label, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("유효하지 않은 초대입니다");

    const [{ data: fam }, { data: inviter }] = await Promise.all([
      supabaseAdmin.from("families").select("name").eq("id", inv.family_id).maybeSingle(),
      supabaseAdmin.from("profiles").select("nickname").eq("id", inv.invited_by_user_id).maybeSingle(),
    ]);

    return {
      family_name: fam?.name ?? null,
      inviter_nickname: inviter?.nickname ?? null,
      display_label: inv.display_label,
      expires_at: inv.expires_at,
      used: !!inv.used_at,
      expired: new Date(inv.expires_at).getTime() < Date.now(),
    } as InvitePreview;
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AcceptInput.parse(d))
  .handler(async ({ data, context }) => {
    // 반드시 인증된 사용자 컨텍스트(authenticated 역할 + auth.uid())로 호출해야 함.
    // service role(supabaseAdmin)로 호출하면 RLS는 우회되지만 auth.uid()가 NULL이 되어
    // accept_family_invite 내부의 "로그인이 필요합니다" 가드에 걸립니다.
    const { supabase, userId } = context;
    const { data: result, error } = await supabase.rpc("accept_family_invite", {
      _token: data.token,
    });
    if (error) throw new Error(error.message);
    return { family_id: result as unknown as string, user_id: userId };
  });
