import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RP_NAME = "곁";

function getRpIdAndOrigin() {
  const req = getRequest();
  const url = new URL(req.url);
  return { rpID: url.hostname, origin: url.origin };
}

async function cleanupExpiredChallenges() {
  await supabaseAdmin
    .from("passkey_challenges")
    .delete()
    .lt("expires_at", new Date().toISOString());
}

// ─── Registration ────────────────────────────────────────────────────────────

export const getPasskeyRegistrationOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rpID } = getRpIdAndOrigin();
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "user";

    const { data: existing } = await supabaseAdmin
      .from("user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", userId);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(userId),
      userName: email,
      userDisplayName: email,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.credential_id,
        transports: c.transports as AuthenticatorTransport[] | undefined,
      })),
    });

    await cleanupExpiredChallenges();
    await supabaseAdmin.from("passkey_challenges").insert({
      challenge: options.challenge,
      challenge_type: "registration",
      user_id: userId,
    });

    return options;
  });

const verifyRegSchema = z.object({
  response: z.any(),
  deviceLabel: z.string().max(80).optional(),
});

export const verifyPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => verifyRegSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { rpID, origin } = getRpIdAndOrigin();
    const { userId } = context;
    const response = data.response as RegistrationResponseJSON;

    const { data: chal } = await supabaseAdmin
      .from("passkey_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", userId)
      .eq("challenge_type", "registration")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!chal) throw new Error("등록 챌린지를 찾을 수 없어요. 다시 시도해 주세요.");
    if (new Date(chal.expires_at) < new Date()) throw new Error("등록 시간이 만료되었어요.");

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("패스키 등록을 확인하지 못했어요.");
    }

    const { credential } = verification.registrationInfo;

    await supabaseAdmin.from("user_passkeys").insert({
      user_id: userId,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      transports: credential.transports ?? [],
      device_label: data.deviceLabel ?? null,
    });

    await supabaseAdmin.from("passkey_challenges").delete().eq("id", chal.id);

    return { ok: true };
  });

// ─── Authentication ──────────────────────────────────────────────────────────

const authOptsSchema = z.object({ email: z.string().email().max(255) });

export const getPasskeyAuthenticationOptions = createServerFn({ method: "POST" })
  .inputValidator((d) => authOptsSchema.parse(d))
  .handler(async ({ data }) => {
    const { rpID } = getRpIdAndOrigin();

    // Look up user id by email via admin
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const user = list.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!user) {
      throw new Error("등록된 계정을 찾을 수 없어요.");
    }

    const { data: creds } = await supabaseAdmin
      .from("user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", user.id);

    if (!creds || creds.length === 0) {
      throw new Error("이 계정에 등록된 패스키가 없어요.");
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: creds.map((c) => ({
        id: c.credential_id,
        transports: c.transports as AuthenticatorTransport[] | undefined,
      })),
    });

    await cleanupExpiredChallenges();
    await supabaseAdmin.from("passkey_challenges").insert({
      challenge: options.challenge,
      challenge_type: "authentication",
      user_id: user.id,
      email: data.email,
    });

    return options;
  });

const verifyAuthSchema = z.object({
  email: z.string().email().max(255),
  response: z.any(),
});

export const verifyPasskeyAuthentication = createServerFn({ method: "POST" })
  .inputValidator((d) => verifyAuthSchema.parse(d))
  .handler(async ({ data }) => {
    const { rpID, origin } = getRpIdAndOrigin();
    const response = data.response as AuthenticationResponseJSON;

    const { data: chal } = await supabaseAdmin
      .from("passkey_challenges")
      .select("id, challenge, user_id, expires_at")
      .eq("email", data.email)
      .eq("challenge_type", "authentication")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!chal || !chal.user_id) throw new Error("인증 챌린지를 찾을 수 없어요.");
    if (new Date(chal.expires_at) < new Date()) throw new Error("인증 시간이 만료되었어요.");

    const { data: cred } = await supabaseAdmin
      .from("user_passkeys")
      .select("*")
      .eq("credential_id", response.id)
      .eq("user_id", chal.user_id)
      .maybeSingle();

    if (!cred) throw new Error("등록된 패스키와 일치하지 않아요.");

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: Buffer.from(cred.public_key, "base64"),
        counter: Number(cred.counter),
        transports: cred.transports as AuthenticatorTransport[] | undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) throw new Error("패스키 인증에 실패했어요.");

    await supabaseAdmin
      .from("user_passkeys")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", cred.id);

    await supabaseAdmin.from("passkey_challenges").delete().eq("id", chal.id);

    // Issue a Supabase session via magiclink generation + verifyOtp on the client
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: data.email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error("세션 발급에 실패했어요.");
    }

    return { token_hash: link.properties.hashed_token };
  });

// ─── List / Remove ───────────────────────────────────────────────────────────

export const listMyPasskeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_passkeys")
      .select("id, device_label, created_at, last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

const removeSchema = z.object({ id: z.string().uuid() });

export const removeMyPasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => removeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("user_passkeys")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });
