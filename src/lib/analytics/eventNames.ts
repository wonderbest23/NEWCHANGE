/**
 * 투자 KPI 대시보드용 이벤트명 상수.
 * 새 이벤트 추가 시 여기에 등록하고, 관리자 집계 쿼리도 함께 업데이트합니다.
 */
export const ANALYTICS_EVENTS = {
  VOICE_CHECK_STARTED: "voice_check_started",
  VOICE_CHECK_COMPLETED: "voice_check_completed",
  VOICE_CHECK_FAILED: "voice_check_failed",

  REPORT_CREATED: "report_created",
  REPORT_VIEWED: "report_viewed",
  REPORT_SHARED_TO_CAREGIVER: "report_shared_to_caregiver",
  CAREGIVER_REPORT_OPENED: "caregiver_report_opened",

  LOCAL_INFO_VIEWED: "local_info_viewed",
  CALL_BUTTON_CLICKED: "call_button_clicked",
  FAMILY_SHARE_CLICKED: "family_share_clicked",
  SAVE_BUTTON_CLICKED: "save_button_clicked",

  REACTION_HELPFUL_CLICKED: "reaction_helpful_clicked",
  REACTION_CURIOUS_CLICKED: "reaction_curious_clicked",

  PAID_INTENT_CLICKED: "paid_intent_clicked",

  ORGANIZATION_MEETING_ADDED: "organization_meeting_added",
  ORGANIZATION_STATUS_UPDATED: "organization_status_updated",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
