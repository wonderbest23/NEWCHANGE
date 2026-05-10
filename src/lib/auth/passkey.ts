import { startRegistration, startAuthentication, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import {
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  getPasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
} from "@/lib/auth/passkeys-actions";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";

export async function isPasskeySupported() {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export async function registerPasskey(deviceLabel?: string) {
  const session = await getSessionCached();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("로그인이 필요해요.");
  const headers = { Authorization: `Bearer ${token}` };

  const options = await getPasskeyRegistrationOptions({ headers } as Parameters<typeof getPasskeyRegistrationOptions>[0]);
  const attResp = await startRegistration({ optionsJSON: options });
  await verifyPasskeyRegistration({
    headers,
    data: { response: attResp, deviceLabel },
  } as Parameters<typeof verifyPasskeyRegistration>[0]);
}

export async function loginWithPasskey(email: string) {
  const options = await getPasskeyAuthenticationOptions({ data: { email } });
  const authResp = await startAuthentication({ optionsJSON: options });
  const { token_hash } = await verifyPasskeyAuthentication({
    data: { email, response: authResp },
  });
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash });
  if (error) throw error;
}
