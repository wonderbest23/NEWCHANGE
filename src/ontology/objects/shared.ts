/** 앱·가족 구성원 외 API 역할 (user_roles) */
export type AppRole = 'guardian' | 'senior' | 'admin' | 'partner'

/** family_members.member_role (자녀/시니어 구분) */
export type FamilyMemberRole = 'guardian' | 'senior'

export type CheckInSource = 'self' | 'guardian' | 'ai_call' | 'partner'

export type MedicationLogStatus = 'taken' | 'missed' | 'skipped'

export type AlertType =
  | 'no_check_in'
  | 'medication_missed'
  | 'help_requested'
  | 'location_unavailable'
  | 'unusual_inactivity'
  | 'manual_admin_alert'

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'

export type AlertStatus = 'open' | 'acknowledged' | 'resolved'

export type CareTaskStatus =
  | 'requested'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type SubscriptionPlan = 'basic' | 'care' | 'premium'

export type SubscriptionStatus = 'active' | 'inactive' | 'canceled' | 'past_due'

export type ISODateString = string

export type UUID = string
