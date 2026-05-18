// 안부 통화 결과를 백그라운드에서 저장.
// - 페이지 이동/언마운트와 무관하게 진행 (모듈 스코프 promise)
// - sonner toast.promise로 진행 상태를 전 페이지에 표시
// - localStorage에 임시 백업 → 새로고침/오류 후 1회 자동 재시도
// - 완료 시 'checkin-saved' 커스텀 이벤트 디스패치 → 화면 갱신

import { toast } from "sonner";
import { analyzeAndSaveCheckin } from "@/lib/checkin/checkin-actions";
import { getSessionCached } from "@/lib/auth/session-cache";

const STORAGE_KEY = "gyeot:pending-checkin-save";
const DRAFT_STORAGE_KEY = "gyeot:draft-checkin-call";
export const CHECKIN_SAVED_EVENT = "checkin-saved";

type Payload = {
  transcript: { role: "user" | "ai"; text: string }[];
  durationSec: number;
  shareWithGuardian: boolean;
};

export type CheckinCallDraft = Payload & {
  savedAt: number;
  startedAt?: number | null;
  reason?: "hidden" | "pagehide" | "disconnect" | "unmount" | "manual";
};

let inflight: Promise<unknown> | null = null;

async function runSave(payload: Payload) {
  const { data: session } = await getSessionCached();
  const token = session.session?.access_token;
  return analyzeAndSaveCheckin({
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    data: payload,
  } as Parameters<typeof analyzeAndSaveCheckin>[0]);
}

export function queueCheckinSave(payload: Payload) {
  if (inflight) return inflight;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ payload, savedAt: Date.now() }));
  } catch {}

  inflight = runSave(payload)
    .then((res) => {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      window.dispatchEvent(new CustomEvent(CHECKIN_SAVED_EVENT, { detail: res }));
      return res;
    })
    .catch((err) => {
      const msg = String(err?.message ?? err);
      // 일일 한도(이미 완료) 같이 재시도 무의미한 케이스는 백업 제거
      if (msg.includes("DAILY_LIMIT_REACHED")) {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  toast.promise(inflight, {
    loading: "안부 리포트를 백그라운드에서 저장하고 있어요…",
    success: "오늘의 안부 리포트가 준비됐어요.",
    error: (e) => {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("DAILY_LIMIT_REACHED"))
        return "오늘은 이미 안부 통화를 완료했어요.";
      return "리포트 저장에 실패했어요. 잠시 후 다시 시도할게요.";
    },
  });

  return inflight;
}

/** 앱 부트 시 1회 호출 — 저장 도중 중단된 작업을 자동 재개. */
export function resumePendingCheckinSave() {
  if (typeof window === "undefined") return;
  if (inflight) return;
  let raw: string | null = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return; }
  if (!raw) return;
  try {
    const { payload, savedAt } = JSON.parse(raw) as { payload: Payload; savedAt: number };
    // 24시간 지난 백업은 폐기
    if (Date.now() - savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    queueCheckinSave(payload);
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

export function isCheckinSaving() {
  return inflight !== null;
}

export function saveCheckinCallDraft(payload: Omit<CheckinCallDraft, "savedAt">) {
  if (typeof window === "undefined") return;
  const cleanTranscript = payload.transcript.filter((t) => t.text.trim().length > 0);
  if (cleanTranscript.length === 0) return;
  const draft: CheckinCallDraft = {
    ...payload,
    transcript: cleanTranscript,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {}
}

export function loadCheckinCallDraft(): CheckinCallDraft | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try { raw = localStorage.getItem(DRAFT_STORAGE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as CheckinCallDraft;
    if (!Array.isArray(draft.transcript) || draft.transcript.length === 0) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return draft;
  } catch {
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
    return null;
  }
}

export function clearCheckinCallDraft() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
}
