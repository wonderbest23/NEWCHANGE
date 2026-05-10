/**
 * RLS E2E 테스트 — 역할별 접근 권한 검증
 *
 * 시나리오
 *   - senior_a   : family A 의 primary_senior (자신 가족 데이터에 풀 액세스)
 *   - guardian_a : family A 에 초대로 합류한 보호자
 *   - senior_b   : 별개의 family B 의 primary_senior (격리 검증용)
 *   - admin_user : app_role='admin' (관리자 RLS 검증용)
 *
 * 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *            VITE_SUPABASE_URL(또는 SUPABASE_URL), VITE_SUPABASE_ANON_KEY
 *            (또는 SUPABASE_PUBLISHABLE_KEY)
 *
 * 키가 없으면 테스트는 스킵됩니다(CI 안전).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

const HAS_ENV = Boolean(SUPABASE_URL && SERVICE_ROLE && ANON_KEY);
const d = HAS_ENV ? describe : describe.skip;

// 고유한 prefix 로 테스트 데이터를 격리하고 cleanup 가능하게 함
const RUN_ID = `rls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const email = (label: string) => `${RUN_ID}-${label}@example.test`;
const PASSWORD = "Test1234!aB";

interface TestUser {
  email: string;
  userId: string;
  client: SupabaseClient;
}

async function makeUser(
  admin: SupabaseClient,
  label: string,
  metadata: Record<string, unknown> = {},
): Promise<TestUser> {
  const userEmail = email(label);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: userEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nickname: label, ...metadata },
  });
  if (createErr) throw createErr;
  const userId = created.user!.id;

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await userClient.auth.signInWithPassword({
    email: userEmail,
    password: PASSWORD,
  });
  if (signErr) throw signErr;

  return { email: userEmail, userId, client: userClient };
}

d("RLS E2E — role-based access", () => {
  let admin: SupabaseClient;
  let seniorA: TestUser;
  let guardianA: TestUser;
  let seniorB: TestUser;
  let adminUser: TestUser;

  let familyAId: string;
  let recipientAId: string;
  let alertAId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) 테스트 사용자 생성 (handle_new_user 트리거가 가족/프로필/역할을 자동 생성)
    seniorA = await makeUser(admin, "seniorA");
    guardianA = await makeUser(admin, "guardianA", {
      // invite_token 을 metadata 로 넘기면 트리거가 자동 가족을 만들지 않음
      // 빈 문자열을 넘겨도 트리거에서 분기되지만, 여기서는 별도 가족 없이 가입 후
      // 초대 수락으로 합류하는 시나리오를 검증하므로 토큰 자리를 채워둠
      invite_token: "pending",
    });
    seniorB = await makeUser(admin, "seniorB");
    adminUser = await makeUser(admin, "admin");

    // 2) admin 역할 부여
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: adminUser.userId, role: "admin" });
    if (roleErr) throw roleErr;

    // 3) seniorA 의 가족 ID 조회
    const { data: famA } = await admin
      .from("family_members")
      .select("family_id")
      .eq("user_id", seniorA.userId)
      .single();
    familyAId = famA!.family_id as string;

    // 4) seniorA 가족에 care_recipient 시드 (senior 권한 필요)
    const { data: rec, error: recErr } = await seniorA.client
      .from("care_recipients")
      .insert({
        family_id: familyAId,
        display_name: "할머니",
        phone_e164: "+821012345678",
      })
      .select("id")
      .single();
    expect(recErr, `seniorA should insert care_recipient: ${recErr?.message}`).toBeNull();
    recipientAId = rec!.id as string;

    // 5) anomaly_alert 시드 (admin 클라이언트로 직접; 테이블에 사용자 INSERT 정책 없음)
    //    rule_code 는 anomaly_rules FK 를 참조하므로 실제 존재하는 코드를 가져옴
    const { data: ruleRow } = await admin
      .from("anomaly_rules")
      .select("code")
      .limit(1)
      .single();
    const ruleCode = (ruleRow?.code as string) ?? "R001";

    const { data: alert, error: alertErr } = await admin
      .from("anomaly_alerts")
      .insert({
        care_recipient_id: recipientAId,
        rule_code: ruleCode,
        severity: "info",
        guardian_message: "테스트 알림",
        status: "open",
        evidence: {},
      })
      .select("id")
      .single();
    if (alertErr) throw alertErr;
    alertAId = alert!.id as string;

    // 6) seniorA 가 guardianA 초대장을 발급
    const { data: invite, error: invErr } = await admin
      .from("family_invites")
      .insert({
        family_id: familyAId,
        token: `${RUN_ID}-token-${"x".repeat(20)}`,
        invited_by_user_id: seniorA.userId,
        role: "guardian",
        display_label: "테스트 보호자",
      })
      .select("token")
      .single();
    if (invErr) throw invErr;

    // 7) guardianA 가 인증된 컨텍스트로 RPC 호출
    const { error: acceptErr } = await guardianA.client.rpc("accept_family_invite", {
      _token: invite!.token,
    });
    expect(acceptErr, `accept_family_invite should succeed: ${acceptErr?.message}`).toBeNull();
  }, 60_000);

  afterAll(async () => {
    if (!HAS_ENV) return;
    // 사용자 삭제 → 트리거 cascades 로 family_members/profiles 등 정리
    for (const u of [seniorA, guardianA, seniorB, adminUser]) {
      if (u?.userId) {
        await admin.auth.admin.deleteUser(u.userId).catch(() => undefined);
      }
    }
    // 시드한 가족/초대/알림은 사용자 cascade 가 닿지 않으면 수동 정리
    if (alertAId) await admin.from("anomaly_alerts").delete().eq("id", alertAId);
    if (recipientAId)
      await admin.from("care_recipients").delete().eq("id", recipientAId);
    if (familyAId) await admin.from("families").delete().eq("id", familyAId);
  }, 30_000);

  // ──────────────────────────────────────────────────────────────────────
  // care_recipients
  // ──────────────────────────────────────────────────────────────────────
  it("seniorA: 자기 가족의 care_recipient 를 조회할 수 있다", async () => {
    const { data, error } = await seniorA.client
      .from("care_recipients")
      .select("id")
      .eq("id", recipientAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("guardianA: 같은 가족의 care_recipient 를 조회할 수 있다", async () => {
    const { data, error } = await guardianA.client
      .from("care_recipients")
      .select("id")
      .eq("id", recipientAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("guardianA: care_recipient INSERT 는 RLS 로 차단된다 (senior 만 가능)", async () => {
    const { error } = await guardianA.client.from("care_recipients").insert({
      family_id: familyAId,
      display_name: "차단되어야 함",
      phone_e164: "+821000000000",
    });
    expect(error).not.toBeNull();
  });

  it("seniorB: 다른 가족의 care_recipient 는 보이지 않는다 (격리)", async () => {
    const { data, error } = await seniorB.client
      .from("care_recipients")
      .select("id")
      .eq("id", recipientAId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // anomaly_alerts (보호자/관리자 SELECT)
  // ──────────────────────────────────────────────────────────────────────
  it("guardianA: 가족의 anomaly_alerts 를 조회할 수 있다", async () => {
    const { data, error } = await guardianA.client
      .from("anomaly_alerts")
      .select("id")
      .eq("id", alertAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("seniorB: 다른 가족의 anomaly_alerts 는 보이지 않는다", async () => {
    const { data, error } = await seniorB.client
      .from("anomaly_alerts")
      .select("id")
      .eq("id", alertAId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("adminUser: anomaly_alerts 에 관리자 정책으로 접근할 수 있다", async () => {
    const { data, error } = await adminUser.client
      .from("anomaly_alerts")
      .select("id")
      .eq("id", alertAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 민감 테이블 직접 접근 차단
  // ──────────────────────────────────────────────────────────────────────
  it("authenticated 사용자는 phone_verifications 에 직접 접근할 수 없다", async () => {
    const { data, error } = await seniorA.client
      .from("phone_verifications")
      .select("id")
      .limit(1);
    // 정책이 USING(false) 이므로 행이 없거나 차단됨
    expect(error == null ? (data?.length ?? 0) : 0).toBe(0);
  });

  it("authenticated 사용자는 passkey_challenges 에 직접 접근할 수 없다", async () => {
    const { data, error } = await seniorA.client
      .from("passkey_challenges")
      .select("id")
      .limit(1);
    expect(error == null ? (data?.length ?? 0) : 0).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // accept_family_invite RPC 권한/검증
  // ──────────────────────────────────────────────────────────────────────
  it("anon: accept_family_invite 호출이 차단된다", async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anonClient.rpc("accept_family_invite", {
      _token: "x".repeat(32),
    });
    expect(error).not.toBeNull();
  });

  it("authenticated: 짧은 토큰은 검증 단계에서 거절된다", async () => {
    const { error } = await seniorA.client.rpc("accept_family_invite", {
      _token: "short",
    });
    expect(error).not.toBeNull();
  });

  it("authenticated: 이미 멤버인 경우(또는 잘못된 토큰)에도 함수가 안전하게 실패한다", async () => {
    // guardianA 는 이미 family A 멤버. 같은 토큰을 재사용하면 used_at 으로 인해 실패해야 함
    const { error } = await guardianA.client.rpc("accept_family_invite", {
      _token: `${RUN_ID}-token-${"x".repeat(20)}`,
    });
    expect(error).not.toBeNull();
  });
});
