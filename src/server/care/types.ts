/**
 * 곁(Gyeot) Care Call — Domain Types
 *
 * 이 파일은 DB 스키마(docs/schema/001_init.sql)와 1:1 대응되는 도메인 타입의
 * 단일 진실원(single source of truth)이다. DB와 서버 로직 모두 이 타입을 따른다.
 *
 * - 외부 의존 없음. 순수 TS.
 * - DB 도입 후 supabase typegen 결과와 합쳐 정렬할 것.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

export type FamilyMemberRole = "primary_guardian" | "secondary_guardian" | "partner";

export interface Family {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  role: FamilyMemberRole;
  display_name?: string | null;
  phone_e164?: string | null;
  email?: string | null;
}

export interface CareRecipient {
  id: string;
  family_id: string;
  display_name: string;
  phone_e164: string;
  birth_year?: number | null;
  timezone: string; // 'Asia/Seoul'
  call_window_start: string; // 'HH:MM'
  call_window_end: string;
  do_not_disturb: boolean;
  status: "active" | "paused" | "archived";
}

// ─────────────────────────────────────────────────────────────────────────────
// Telephony
// ─────────────────────────────────────────────────────────────────────────────

export type CallJobStatus =
  | "queued"
  | "dialing"
  | "done"
  | "failed"
  | "cancelled"
  | "no_answer";

export interface OutboundCallJob {
  id: string;
  care_recipient_id: string;
  scheduled_at: string;
  window_start: string;
  window_end: string;
  status: CallJobStatus;
  retry_count: number;
  parent_job_id?: string | null;
  reason?: "daily" | "followup" | "consent_renewal" | string;
}

export type CallSessionStatus =
  | "initiated"
  | "ringing"
  | "in_progress"
  | "completed"
  | "no_answer"
  | "busy"
  | "failed"
  | "escalated"
  | "wrong_person";

export type CallEndReason =
  | "normal"
  | "user_ended"
  | "silence_timeout"
  | "hard_limit"
  | "escalate"
  | "wrong_person"
  | "consent_denied";

export interface CallSession {
  id: string;
  job_id?: string | null;
  care_recipient_id: string;
  twilio_call_sid?: string | null;
  openai_session_id?: string | null;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  status: CallSessionStatus;
  end_reason?: CallEndReason | null;
  recording_url?: string | null;
  recording_expires_at?: string | null;
  duration_sec?: number | null;
  cost_cents?: number | null;
  wrong_person_flag: boolean;
}

export type TurnRole = "ai" | "user" | "system";

export interface CallTurn {
  id: string;
  session_id: string;
  turn_index: number;
  role: TurnRole;
  question_id?: QuestionId | null;
  raw_text?: string | null;
  classified_value?: ClassifiedValue | null;
  is_unclear: boolean;
  confidence?: number | null;
  latency_ms?: number | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────────────

export type QuestionId =
  | "Q0_IDENTITY"
  | "Q1_MOOD"
  | "Q2_MEAL"
  | "Q2A_MEAL_REASON"
  | "Q3_MEDICATION"
  | "Q3A_MED_REASON"
  | "Q4_SYMPTOM"
  | "Q4A_SYMPTOM_DETAIL"
  | "Q5_SLEEP"
  | "Q6_HELP"
  | "Q6A_HELP_DETAIL"
  | "END_OK"
  | "END_WRONG"
  | "ESCALATE";

export type CheckAxis = "meal" | "medication" | "symptom" | "mood" | "sleep" | "help" | "greeting";

/**
 * 분류된 응답값. axis별 enum 만 허용.
 * 자유서술은 최소화 (Q4A/Q6A 만 detail 보유).
 */
export type ClassifiedValue =
  | { axis: "greeting"; value: "good" | "soso" | "bad" | "unclear" }
  | { axis: "mood"; value: "good" | "soso" | "bad" | "unclear" }
  | { axis: "meal"; value: "ate" | "skipped" | "partial" | "unclear"; reason?: MealReason }
  | { axis: "medication"; value: "taken" | "missed" | "unsure"; reason?: MedReason }
  | {
      axis: "symptom";
      value: "none" | "mild" | "severe" | "unclear";
      detail?: string;
      keywords?: string[];
    }
  | { axis: "sleep"; value: "good" | "poor" | "awake_often" | "unclear" }
  | { axis: "help"; value: "none" | "has_request" | "unclear"; detail?: string };

export type MealReason = "no_appetite" | "pain" | "forgot" | "other";
export type MedReason = "forgot" | "side_effect" | "ran_out" | "other";

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedCheckResult {
  id: string;
  session_id: string;
  care_recipient_id: string;
  recorded_for_date: string; // YYYY-MM-DD
  axis: CheckAxis;
  value: ClassifiedValue;
}

export interface MedicationCatalogEntry {
  id: string;
  product_name: string;
  ingredient_name: string;
  classification?: string | null;
  kfda_item_seq?: string | null;
  default_warnings?: string | null;
  verified_source: "kfda" | "manual";
  verified_at: string;
  source_version?: string | null;
}

export interface MedicationSchedule {
  id: string;
  care_recipient_id: string;
  medication_id?: string | null;
  display_name: string;
  schedule_times: string[]; // ['08:00','20:00']
  dose_amount?: number | null;
  dose_unit?: string | null;
  prescribed_by: string;
  active: boolean;
  starts_on?: string | null;
  ends_on?: string | null;
}

export type MedAdherenceStatus = "taken" | "missed" | "unsure" | "skipped_by_guardian";

export interface MedicationAdherenceLog {
  id: string;
  schedule_id: string;
  expected_at: string;
  status: MedAdherenceStatus;
  source: "call" | "manual" | "schedule_default";
  session_id?: string | null;
  note?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ops — Rule Engine / Alerts
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = "info" | "warning" | "critical";

export interface AnomalyRule {
  code: string; // R001 ...
  name: string;
  severity: Severity;
  params: Record<string, unknown>;
  enabled: boolean;
  version: number;
  description?: string | null;
}

export interface AnomalyAlert {
  id: string;
  rule_code: string;
  care_recipient_id: string;
  severity: Severity;
  evidence: Record<string, unknown>;
  guardian_message: string;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export type GuardianActionType =
  | "acknowledged"
  | "called"
  | "visited"
  | "dispatched_119"
  | "noted"
  | "dismissed";

export interface GuardianAction {
  id: string;
  alert_id: string;
  guardian_id: string;
  action: GuardianActionType;
  note?: string | null;
  created_at: string;
}

export type NotificationChannel = "kakao" | "sms" | "email" | "push";

export interface NotificationOutboxRow {
  id: string;
  alert_id?: string | null;
  channel: NotificationChannel;
  template_code: string;
  recipient: string;
  payload: Record<string, unknown>;
  status: "queued" | "sending" | "sent" | "failed";
  attempt_count: number;
  last_error?: string | null;
  scheduled_at: string;
  sent_at?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Realtime tool I/O (OpenAI Realtime → Orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

export type ToolName = "record_answer" | "request_repeat" | "escalate_now" | "end_call";

export interface ToolCallRecordAnswer {
  name: "record_answer";
  arguments: {
    question_id: QuestionId;
    raw_text: string;
    classified_value: ClassifiedValue;
  };
}

export interface ToolCallRequestRepeat {
  name: "request_repeat";
  arguments: { reason: "unclear" | "no_response" | "other" };
}

export interface ToolCallEscalateNow {
  name: "escalate_now";
  arguments: { reason: string; keywords?: string[] };
}

export interface ToolCallEndCall {
  name: "end_call";
  arguments: { reason: CallEndReason };
}

export type ToolCall =
  | ToolCallRecordAnswer
  | ToolCallRequestRepeat
  | ToolCallEscalateNow
  | ToolCallEndCall;

export interface ToolResponse {
  next_question_id?: QuestionId | null;
  prompt?: string; // AI 가 발화할 다음 한국어 문장
  end?: boolean;
}
