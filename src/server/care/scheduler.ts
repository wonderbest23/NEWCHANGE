/**
 * Call Scheduler
 *
 * 매 분 cron 으로 호출되어 오늘 통화 대상 → outbound_call_jobs(queued) 생성.
 *
 * MVP: 비즈니스 로직만 순수 함수로 분리. cron 트리거(pg_cron 또는 Inngest) 는 Cursor 인계 후.
 */

import type { CareRecipient, OutboundCallJob } from "../care/types";

export interface SchedulerInput {
  recipients: CareRecipient[];
  /** 같은 day 에 이미 성공/완료된 job 이 있는지 조회 */
  hasCompletedToday(recipientId: string, today: string): Promise<boolean>;
  /** 같은 day 의 마지막 실패 job 조회 (재시도 판단용) */
  lastFailedToday(recipientId: string, today: string): Promise<OutboundCallJob | null>;
  now: Date;
}

export interface JobToCreate {
  care_recipient_id: string;
  scheduled_at: string;
  window_start: string;
  window_end: string;
  reason: "daily" | "followup" | "consent_renewal";
  parent_job_id?: string | null;
}

const RETRY_OFFSETS_MIN = [30, 120]; // 30분, 2시간 후 재시도

export async function planJobs(input: SchedulerInput): Promise<JobToCreate[]> {
  const today = input.now.toISOString().slice(0, 10);
  const out: JobToCreate[] = [];

  for (const r of input.recipients) {
    if (r.status !== "active" || r.do_not_disturb) continue;

    const winStart = combineDateTime(today, r.call_window_start, r.timezone);
    const winEnd = combineDateTime(today, r.call_window_end, r.timezone);

    if (input.now > winEnd) continue; // 윈도우 지남

    const completed = await input.hasCompletedToday(r.id, today);
    if (completed) continue;

    const lastFailed = await input.lastFailedToday(r.id, today);

    if (!lastFailed) {
      // 윈도우 시작 시각에 첫 발신
      out.push({
        care_recipient_id: r.id,
        scheduled_at: maxDate(input.now, winStart).toISOString(),
        window_start: winStart.toISOString(),
        window_end: winEnd.toISOString(),
        reason: "daily",
      });
      continue;
    }

    // 재시도
    const offsetIdx = Math.min(lastFailed.retry_count, RETRY_OFFSETS_MIN.length - 1);
    const next = new Date(new Date(lastFailed.scheduled_at).getTime() + RETRY_OFFSETS_MIN[offsetIdx] * 60_000);
    if (next <= winEnd) {
      out.push({
        care_recipient_id: r.id,
        scheduled_at: next.toISOString(),
        window_start: winStart.toISOString(),
        window_end: winEnd.toISOString(),
        reason: "followup",
        parent_job_id: lastFailed.id,
      });
    }
  }

  return out;
}

function combineDateTime(dateStr: string, timeStr: string, _tz: string): Date {
  // 단순화: 서버 TZ 가 KST 라고 가정. 운영은 DB 또는 luxon/date-fns-tz 도입.
  return new Date(`${dateStr}T${timeStr}:00+09:00`);
}

function maxDate(a: Date, b: Date) {
  return a.getTime() > b.getTime() ? a : b;
}
