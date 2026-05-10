/**
 * Notification Adapter — 채널 추상화.
 * MVP 단계: kakao/sms/email 어댑터 자리만 만들고, 실제 발송은 콘솔 stub.
 *
 * 사용:
 *   await dispatch({ channel: 'kakao', template_code: 'T005_FALL_MENTIONED', recipient: '+82...', payload: {...} })
 */

import type { NotificationChannel } from "../care/types";

export interface SendArgs {
  channel: NotificationChannel;
  template_code: string;
  recipient: string;
  payload: Record<string, unknown>;
}

export interface SendResult {
  ok: boolean;
  vendor_message_id?: string;
  error?: string;
}

export interface ChannelAdapter {
  channel: NotificationChannel;
  send(args: SendArgs): Promise<SendResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stubs — 실제 구현은 Cursor 인계 후 사업자 SDK 로 교체
// ─────────────────────────────────────────────────────────────────────────────

export const KakaoAlimtalkAdapter: ChannelAdapter = {
  channel: "kakao",
  async send(args) {
    // TODO: NHN Cloud / Bizppurio / Aligo / 인포뱅크 중 1개 사업자 연동
    //       1) 발신 프로필 키 (sender_key)
    //       2) 사전 승인된 template_code 매핑
    //       3) 변수 치환 (#{var})
    //       4) 실패 시 SMS 폴백 옵션
    console.info("[notify:kakao]", args.template_code, "→", args.recipient, args.payload);
    return { ok: true, vendor_message_id: `stub-kakao-${Date.now()}` };
  },
};

export const SmsAdapter: ChannelAdapter = {
  channel: "sms",
  async send(args) {
    // TODO: Twilio Messages.json — KCA 발신번호 등록 필요
    console.info("[notify:sms]", args.template_code, "→", args.recipient, args.payload);
    return { ok: true, vendor_message_id: `stub-sms-${Date.now()}` };
  },
};

export const EmailAdapter: ChannelAdapter = {
  channel: "email",
  async send(args) {
    // TODO: Resend connector
    console.info("[notify:email]", args.template_code, "→", args.recipient, args.payload);
    return { ok: true, vendor_message_id: `stub-email-${Date.now()}` };
  },
};

export const PushAdapter: ChannelAdapter = {
  channel: "push",
  async send(args) {
    // TODO: web-push (VAPID) 또는 OneSignal
    console.info("[notify:push]", args.template_code, "→", args.recipient, args.payload);
    return { ok: true, vendor_message_id: `stub-push-${Date.now()}` };
  },
};

const ADAPTERS: Record<NotificationChannel, ChannelAdapter> = {
  kakao: KakaoAlimtalkAdapter,
  sms: SmsAdapter,
  email: EmailAdapter,
  push: PushAdapter,
};

export async function dispatch(args: SendArgs): Promise<SendResult> {
  const adapter = ADAPTERS[args.channel];
  if (!adapter) return { ok: false, error: `unknown channel: ${args.channel}` };
  return adapter.send(args);
}

/**
 * 등급별 채널 우선순위 (docs/policy/05-anomaly-sla.md)
 */
export function channelsForSeverity(severity: "info" | "warning" | "critical"): NotificationChannel[] {
  if (severity === "critical") return ["kakao", "sms", "push"];
  if (severity === "warning") return ["kakao", "push"];
  return []; // info: 카드만
}
