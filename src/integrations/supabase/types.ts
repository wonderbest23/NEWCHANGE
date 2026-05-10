export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          address: string | null
          category: string
          created_at: string
          description: string | null
          hours: string | null
          id: string
          name: string
          phone: string | null
          rating: number | null
          sido: string
          sigungu: string | null
          source_name: string | null
          source_url: string | null
          tags: string[]
          updated_at: string
          verified: boolean
          website: string | null
        }
        Insert: {
          address?: string | null
          category: string
          created_at?: string
          description?: string | null
          hours?: string | null
          id?: string
          name: string
          phone?: string | null
          rating?: number | null
          sido?: string
          sigungu?: string | null
          source_name?: string | null
          source_url?: string | null
          tags?: string[]
          updated_at?: string
          verified?: boolean
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string
          created_at?: string
          description?: string | null
          hours?: string | null
          id?: string
          name?: string
          phone?: string | null
          rating?: number | null
          sido?: string
          sigungu?: string | null
          source_name?: string | null
          source_url?: string | null
          tags?: string[]
          updated_at?: string
          verified?: boolean
          website?: string | null
        }
        Relationships: []
      }
      agency_reviews: {
        Row: {
          agency_id: string
          body: string | null
          created_at: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_id: string
          body?: string | null
          created_at?: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          body?: string | null
          created_at?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_reviews_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      anomaly_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          care_recipient_id: string
          created_at: string
          evidence: Json
          guardian_message: string
          id: string
          resolved_at: string | null
          rule_code: string
          severity: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          care_recipient_id: string
          created_at?: string
          evidence?: Json
          guardian_message: string
          id?: string
          resolved_at?: string | null
          rule_code: string
          severity: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          care_recipient_id?: string
          created_at?: string
          evidence?: Json
          guardian_message?: string
          id?: string
          resolved_at?: string | null
          rule_code?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_alerts_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_alerts_rule_code_fkey"
            columns: ["rule_code"]
            isOneToOne: false
            referencedRelation: "anomaly_rules"
            referencedColumns: ["code"]
          },
        ]
      }
      anomaly_rules: {
        Row: {
          code: string
          created_at: string
          description: string | null
          enabled: boolean
          name: string
          params: Json
          severity: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          name: string
          params?: Json
          severity: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          name?: string
          params?: Json
          severity?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      ask_logs: {
        Row: {
          answer_summary: string | null
          answer_title: string | null
          caution: string | null
          created_at: string
          id: string
          question: string
          related_tip_ids: string[]
          risk_category: string | null
          user_id: string | null
        }
        Insert: {
          answer_summary?: string | null
          answer_title?: string | null
          caution?: string | null
          created_at?: string
          id?: string
          question: string
          related_tip_ids?: string[]
          risk_category?: string | null
          user_id?: string | null
        }
        Update: {
          answer_summary?: string | null
          answer_title?: string | null
          caution?: string | null
          created_at?: string
          id?: string
          question?: string
          related_tip_ids?: string[]
          risk_category?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          answered_at: string | null
          care_recipient_id: string
          cost_cents: number | null
          created_at: string
          duration_sec: number | null
          end_reason: string | null
          ended_at: string | null
          id: string
          job_id: string | null
          openai_session_id: string | null
          recording_expires_at: string | null
          recording_url: string | null
          started_at: string | null
          status: string
          twilio_call_sid: string | null
          updated_at: string
          wrong_person_flag: boolean
        }
        Insert: {
          answered_at?: string | null
          care_recipient_id: string
          cost_cents?: number | null
          created_at?: string
          duration_sec?: number | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          job_id?: string | null
          openai_session_id?: string | null
          recording_expires_at?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          twilio_call_sid?: string | null
          updated_at?: string
          wrong_person_flag?: boolean
        }
        Update: {
          answered_at?: string | null
          care_recipient_id?: string
          cost_cents?: number | null
          created_at?: string
          duration_sec?: number | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          job_id?: string | null
          openai_session_id?: string | null
          recording_expires_at?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          twilio_call_sid?: string | null
          updated_at?: string
          wrong_person_flag?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "outbound_call_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      call_turns: {
        Row: {
          classified_value: Json | null
          confidence: number | null
          created_at: string
          id: string
          is_unclear: boolean
          latency_ms: number | null
          question_id: string | null
          raw_text: string | null
          role: string
          session_id: string
          turn_index: number
        }
        Insert: {
          classified_value?: Json | null
          confidence?: number | null
          created_at?: string
          id?: string
          is_unclear?: boolean
          latency_ms?: number | null
          question_id?: string | null
          raw_text?: string | null
          role: string
          session_id: string
          turn_index: number
        }
        Update: {
          classified_value?: Json | null
          confidence?: number | null
          created_at?: string
          id?: string
          is_unclear?: boolean
          latency_ms?: number | null
          question_id?: string | null
          raw_text?: string | null
          role?: string
          session_id?: string
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      care_recipients: {
        Row: {
          birth_year: number | null
          call_window_end: string
          call_window_start: string
          created_at: string
          display_name: string
          do_not_disturb: boolean
          family_id: string
          id: string
          phone_e164: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          birth_year?: number | null
          call_window_end?: string
          call_window_start?: string
          created_at?: string
          display_name: string
          do_not_disturb?: boolean
          family_id: string
          id?: string
          phone_e164: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          birth_year?: number | null
          call_window_end?: string
          call_window_start?: string
          created_at?: string
          display_name?: string
          do_not_disturb?: boolean
          family_id?: string
          id?: string
          phone_e164?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_recipients_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      community_bot_authors: {
        Row: {
          birth_year: number | null
          created_at: string
          id: string
          nickname: string
          region_sido: string | null
          region_sigungu: string | null
          verified: boolean
        }
        Insert: {
          birth_year?: number | null
          created_at?: string
          id?: string
          nickname: string
          region_sido?: string | null
          region_sigungu?: string | null
          verified?: boolean
        }
        Update: {
          birth_year?: number | null
          created_at?: string
          id?: string
          nickname?: string
          region_sido?: string | null
          region_sigungu?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      community_categories: {
        Row: {
          description: string
          name: string
          slug: string
          sort_order: number
          tone: string
        }
        Insert: {
          description: string
          name: string
          slug: string
          sort_order?: number
          tone?: string
        }
        Update: {
          description?: string
          name?: string
          slug?: string
          sort_order?: number
          tone?: string
        }
        Relationships: []
      }
      community_comments: {
        Row: {
          ai_generated: boolean
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          ai_generated?: boolean
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          ai_generated?: boolean
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          ai_generated: boolean
          author_id: string
          body: string
          category_slug: string
          created_at: string
          id: string
          pinned: boolean
          recommendation_tags: string[]
          region_sido: string | null
          region_sigungu: string | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          ai_generated?: boolean
          author_id: string
          body: string
          category_slug: string
          created_at?: string
          id?: string
          pinned?: boolean
          recommendation_tags?: string[]
          region_sido?: string | null
          region_sigungu?: string | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          ai_generated?: boolean
          author_id?: string
          body?: string
          category_slug?: string
          created_at?: string
          id?: string
          pinned?: boolean
          recommendation_tags?: string[]
          region_sido?: string | null
          region_sigungu?: string | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "community_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      conditions: {
        Row: {
          care_recipient_id: string
          code: string
          created_at: string
          id: string
          label: string
          noted_at: string
        }
        Insert: {
          care_recipient_id: string
          code: string
          created_at?: string
          id?: string
          label: string
          noted_at?: string
        }
        Update: {
          care_recipient_id?: string
          code?: string
          created_at?: string
          id?: string
          label?: string
          noted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conditions_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_tags: {
        Row: {
          created_at: string
          id: string
          resource_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_id: string
          tag: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_tags_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "local_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_log: {
        Row: {
          activity_note: string | null
          care_recipient_id: string
          created_at: string
          id: string
          log_date: string
          meal_status: string | null
          mood_status: string | null
          sleep_status: string | null
        }
        Insert: {
          activity_note?: string | null
          care_recipient_id: string
          created_at?: string
          id?: string
          log_date: string
          meal_status?: string | null
          mood_status?: string | null
          sleep_status?: string | null
        }
        Update: {
          activity_note?: string | null
          care_recipient_id?: string
          created_at?: string
          id?: string
          log_date?: string
          meal_status?: string | null
          mood_status?: string | null
          sleep_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_log_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      dm_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      dm_reports: {
        Row: {
          created_at: string
          id: string
          message_id: string
          reason: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          reason: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          reason?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_check_results: {
        Row: {
          axis: string
          care_recipient_id: string
          created_at: string
          id: string
          recorded_for_date: string
          session_id: string
          value: Json
        }
        Insert: {
          axis: string
          care_recipient_id: string
          created_at?: string
          id?: string
          recorded_for_date: string
          session_id: string
          value: Json
        }
        Update: {
          axis?: string
          care_recipient_id?: string
          created_at?: string
          id?: string
          recorded_for_date?: string
          session_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "extracted_check_results_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_check_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_invites: {
        Row: {
          created_at: string
          display_label: string | null
          expires_at: string
          family_id: string
          id: string
          invited_by_user_id: string
          role: string
          token: string
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          display_label?: string | null
          expires_at?: string
          family_id: string
          id?: string
          invited_by_user_id: string
          role?: string
          token: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          display_label?: string | null
          expires_at?: string
          family_id?: string
          id?: string
          invited_by_user_id?: string
          role?: string
          token?: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: []
      }
      family_members: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          family_id: string
          id: string
          phone_e164: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          family_id: string
          id?: string
          phone_e164?: string | null
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          family_id?: string
          id?: string
          phone_e164?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_actions: {
        Row: {
          action: string
          alert_id: string
          created_at: string
          guardian_id: string
          id: string
          note: string | null
        }
        Insert: {
          action: string
          alert_id: string
          created_at?: string
          guardian_id: string
          id?: string
          note?: string | null
        }
        Update: {
          action?: string
          alert_id?: string
          created_at?: string
          guardian_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardian_actions_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "anomaly_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      health_checkin_tags: {
        Row: {
          checkin_id: string
          confidence: number | null
          created_at: string
          id: string
          tag_name: string
        }
        Insert: {
          checkin_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          tag_name: string
        }
        Update: {
          checkin_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_checkin_tags_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "health_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      health_checkins: {
        Row: {
          caregiver_shared: boolean
          checkin_at: string
          condition_level: string
          created_at: string
          dizziness_detected: boolean
          duration_sec: number | null
          family_id: string | null
          id: string
          loneliness_detected: boolean
          meal_status: string | null
          medicine_status: string | null
          mood_status: string | null
          pain_status: string | null
          raw_transcript: string | null
          senior_user_id: string
          sleep_status: string | null
          summary: string | null
          updated_at: string
          urgent_detected: boolean
        }
        Insert: {
          caregiver_shared?: boolean
          checkin_at?: string
          condition_level?: string
          created_at?: string
          dizziness_detected?: boolean
          duration_sec?: number | null
          family_id?: string | null
          id?: string
          loneliness_detected?: boolean
          meal_status?: string | null
          medicine_status?: string | null
          mood_status?: string | null
          pain_status?: string | null
          raw_transcript?: string | null
          senior_user_id: string
          sleep_status?: string | null
          summary?: string | null
          updated_at?: string
          urgent_detected?: boolean
        }
        Update: {
          caregiver_shared?: boolean
          checkin_at?: string
          condition_level?: string
          created_at?: string
          dizziness_detected?: boolean
          duration_sec?: number | null
          family_id?: string | null
          id?: string
          loneliness_detected?: boolean
          meal_status?: string | null
          medicine_status?: string | null
          mood_status?: string | null
          pain_status?: string | null
          raw_transcript?: string | null
          senior_user_id?: string
          sleep_status?: string | null
          summary?: string | null
          updated_at?: string
          urgent_detected?: boolean
        }
        Relationships: []
      }
      health_reports: {
        Row: {
          caregiver_report_text: string | null
          checkin_id: string
          created_at: string
          id: string
          recommendation_tags: string[]
          senior_report_text: string
        }
        Insert: {
          caregiver_report_text?: string | null
          checkin_id: string
          created_at?: string
          id?: string
          recommendation_tags?: string[]
          senior_report_text: string
        }
        Update: {
          caregiver_report_text?: string | null
          checkin_id?: string
          created_at?: string
          id?: string
          recommendation_tags?: string[]
          senior_report_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_reports_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "health_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          district: string | null
          error_count: number
          error_message: string | null
          finished_at: string | null
          id: string
          inserted_count: number
          source_name: string
          started_at: string
          status: string
          updated_count: number
        }
        Insert: {
          district?: string | null
          error_count?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          inserted_count?: number
          source_name: string
          started_at?: string
          status: string
          updated_count?: number
        }
        Update: {
          district?: string | null
          error_count?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          inserted_count?: number
          source_name?: string
          started_at?: string
          status?: string
          updated_count?: number
        }
        Relationships: []
      }
      investor_kpi_targets: {
        Row: {
          created_at: string
          id: string
          period_type: string
          target_caregiver_links: number
          target_organization_meetings: number
          target_report_view_rate: number
          target_senior_users: number
          target_voice_checkins: number
          target_voice_completion_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          period_type?: string
          target_caregiver_links?: number
          target_organization_meetings?: number
          target_report_view_rate?: number
          target_senior_users?: number
          target_voice_checkins?: number
          target_voice_completion_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          period_type?: string
          target_caregiver_links?: number
          target_organization_meetings?: number
          target_report_view_rate?: number
          target_senior_users?: number
          target_voice_checkins?: number
          target_voice_completion_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      local_resources: {
        Row: {
          address: string | null
          application_method: string | null
          category: string | null
          cost: string | null
          created_at: string
          description: string | null
          district: string | null
          embedding: string | null
          end_date: string | null
          evidence_level: number
          id: string
          is_active: boolean
          last_fetched_at: string | null
          latitude: number | null
          license: string | null
          longitude: number | null
          name: string
          opening_hours: string | null
          phone: string | null
          recommendation_tags: string[]
          region_sido: string
          region_sigungu: string
          resource_type: string
          source_external_id: string | null
          source_name: string | null
          source_url: string | null
          start_date: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          address?: string | null
          application_method?: string | null
          category?: string | null
          cost?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          embedding?: string | null
          end_date?: string | null
          evidence_level?: number
          id?: string
          is_active?: boolean
          last_fetched_at?: string | null
          latitude?: number | null
          license?: string | null
          longitude?: number | null
          name: string
          opening_hours?: string | null
          phone?: string | null
          recommendation_tags?: string[]
          region_sido?: string
          region_sigungu: string
          resource_type: string
          source_external_id?: string | null
          source_name?: string | null
          source_url?: string | null
          start_date?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          address?: string | null
          application_method?: string | null
          category?: string | null
          cost?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          embedding?: string | null
          end_date?: string | null
          evidence_level?: number
          id?: string
          is_active?: boolean
          last_fetched_at?: string | null
          latitude?: number | null
          license?: string | null
          longitude?: number | null
          name?: string
          opening_hours?: string | null
          phone?: string | null
          recommendation_tags?: string[]
          region_sido?: string
          region_sigungu?: string
          resource_type?: string
          source_external_id?: string | null
          source_name?: string | null
          source_url?: string | null
          start_date?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      medication_adherence_logs: {
        Row: {
          created_at: string
          expected_at: string
          id: string
          note: string | null
          schedule_id: string
          session_id: string | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          expected_at: string
          id?: string
          note?: string | null
          schedule_id: string
          session_id?: string | null
          source: string
          status: string
        }
        Update: {
          created_at?: string
          expected_at?: string
          id?: string
          note?: string | null
          schedule_id?: string
          session_id?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_adherence_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "medication_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_adherence_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_catalog: {
        Row: {
          classification: string | null
          created_at: string
          default_warnings: string | null
          id: string
          ingredient_name: string
          kfda_item_seq: string | null
          product_name: string
          source_version: string | null
          verified_at: string
          verified_source: string
        }
        Insert: {
          classification?: string | null
          created_at?: string
          default_warnings?: string | null
          id?: string
          ingredient_name: string
          kfda_item_seq?: string | null
          product_name: string
          source_version?: string | null
          verified_at?: string
          verified_source: string
        }
        Update: {
          classification?: string | null
          created_at?: string
          default_warnings?: string | null
          id?: string
          ingredient_name?: string
          kfda_item_seq?: string | null
          product_name?: string
          source_version?: string | null
          verified_at?: string
          verified_source?: string
        }
        Relationships: []
      }
      medication_schedules: {
        Row: {
          active: boolean
          care_recipient_id: string
          created_at: string
          display_name: string
          dose_amount: number | null
          dose_unit: string | null
          ends_on: string | null
          id: string
          medication_id: string | null
          prescribed_by: string
          schedule_times: string[]
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          care_recipient_id: string
          created_at?: string
          display_name: string
          dose_amount?: number | null
          dose_unit?: string | null
          ends_on?: string | null
          id?: string
          medication_id?: string | null
          prescribed_by?: string
          schedule_times: string[]
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          care_recipient_id?: string
          created_at?: string
          display_name?: string
          dose_amount?: number | null
          dose_unit?: string | null
          ends_on?: string | null
          id?: string
          medication_id?: string | null
          prescribed_by?: string
          schedule_times?: string[]
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_schedules_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_schedules_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medication_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          alert_id: string | null
          attempt_count: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          payload: Json
          recipient: string
          scheduled_at: string
          sent_at: string | null
          status: string
          template_code: string
        }
        Insert: {
          alert_id?: string | null
          attempt_count?: number
          channel: string
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          recipient: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_code: string
        }
        Update: {
          alert_id?: string | null
          attempt_count?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          recipient?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "anomaly_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_pipeline: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          expected_users: number | null
          id: string
          interest_level: string | null
          meeting_date: string | null
          memo: string | null
          next_action: string | null
          organization_name: string
          organization_type: string | null
          region: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          expected_users?: number | null
          id?: string
          interest_level?: string | null
          meeting_date?: string | null
          memo?: string | null
          next_action?: string | null
          organization_name: string
          organization_type?: string | null
          region?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          expected_users?: number | null
          id?: string
          interest_level?: string | null
          meeting_date?: string | null
          memo?: string | null
          next_action?: string | null
          organization_name?: string
          organization_type?: string | null
          region?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_call_jobs: {
        Row: {
          care_recipient_id: string
          created_at: string
          id: string
          parent_job_id: string | null
          reason: string | null
          retry_count: number
          scheduled_at: string
          status: string
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          care_recipient_id: string
          created_at?: string
          id?: string
          parent_job_id?: string | null
          reason?: string | null
          retry_count?: number
          scheduled_at: string
          status?: string
          updated_at?: string
          window_end: string
          window_start: string
        }
        Update: {
          care_recipient_id?: string
          created_at?: string
          id?: string
          parent_job_id?: string | null
          reason?: string | null
          retry_count?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_call_jobs_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_call_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "outbound_call_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      passkey_challenges: {
        Row: {
          challenge: string
          challenge_type: string
          created_at: string
          email: string | null
          expires_at: string
          id: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          challenge_type: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          challenge_type?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      phone_verifications: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age_range: string | null
          birth_year: number | null
          created_at: string
          id: string
          interests: string[]
          is_bot: boolean
          nickname: string
          phone: string | null
          phone_verified_at: string | null
          region_sido: string | null
          region_sigungu: string | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          age_range?: string | null
          birth_year?: number | null
          created_at?: string
          id: string
          interests?: string[]
          is_bot?: boolean
          nickname: string
          phone?: string | null
          phone_verified_at?: string | null
          region_sido?: string | null
          region_sigungu?: string | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          age_range?: string | null
          birth_year?: number | null
          created_at?: string
          id?: string
          interests?: string[]
          is_bot?: boolean
          nickname?: string
          phone?: string | null
          phone_verified_at?: string | null
          region_sido?: string | null
          region_sigungu?: string | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      rss_sources: {
        Row: {
          category: string
          created_at: string
          district: string
          enabled: boolean
          id: string
          last_fetched_at: string | null
          name: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          district: string
          enabled?: boolean
          id?: string
          last_fetched_at?: string | null
          name: string
          url: string
        }
        Update: {
          category?: string
          created_at?: string
          district?: string
          enabled?: boolean
          id?: string
          last_fetched_at?: string | null
          name?: string
          url?: string
        }
        Relationships: []
      }
      saved_resources: {
        Row: {
          created_at: string
          id: string
          resource_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "local_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      symptoms_log: {
        Row: {
          care_recipient_id: string
          category: string
          created_at: string
          id: string
          keywords: string[] | null
          occurred_on: string
          session_id: string | null
          severity: string | null
        }
        Insert: {
          care_recipient_id: string
          category: string
          created_at?: string
          id?: string
          keywords?: string[] | null
          occurred_on?: string
          session_id?: string | null
          severity?: string | null
        }
        Update: {
          care_recipient_id?: string
          category?: string
          created_at?: string
          id?: string
          keywords?: string[] | null
          occurred_on?: string
          session_id?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "symptoms_log_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "symptoms_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_categories: {
        Row: {
          description: string | null
          icon: string | null
          name: string
          slug: string
          sort_order: number
          tone: string
        }
        Insert: {
          description?: string | null
          icon?: string | null
          name: string
          slug: string
          sort_order?: number
          tone?: string
        }
        Update: {
          description?: string | null
          icon?: string | null
          name?: string
          slug?: string
          sort_order?: number
          tone?: string
        }
        Relationships: []
      }
      tip_likes: {
        Row: {
          created_at: string
          tip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tip_likes_tip_id_fkey"
            columns: ["tip_id"]
            isOneToOne: false
            referencedRelation: "tips"
            referencedColumns: ["id"]
          },
        ]
      }
      tips: {
        Row: {
          category_slug: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          is_published: boolean
          like_count: number
          pinned: boolean
          published_at: string | null
          steps: Json
          summary: string
          tags: string[]
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          category_slug: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          is_published?: boolean
          like_count?: number
          pinned?: boolean
          published_at?: string | null
          steps?: Json
          summary: string
          tags?: string[]
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          category_slug?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          is_published?: boolean
          like_count?: number
          pinned?: boolean
          published_at?: string | null
          steps?: Json
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "tips_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "tip_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_passkeys: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_label: string | null
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[]
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[]
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voice_consents: {
        Row: {
          audio_url: string | null
          care_recipient_id: string
          created_at: string
          expires_at: string | null
          granted: boolean
          granted_at: string | null
          id: string
          revoked_at: string | null
          source_session_id: string | null
        }
        Insert: {
          audio_url?: string | null
          care_recipient_id: string
          created_at?: string
          expires_at?: string | null
          granted: boolean
          granted_at?: string | null
          id?: string
          revoked_at?: string | null
          source_session_id?: string | null
        }
        Update: {
          audio_url?: string | null
          care_recipient_id?: string
          created_at?: string
          expires_at?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          revoked_at?: string | null
          source_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_consents_care_recipient_id_fkey"
            columns: ["care_recipient_id"]
            isOneToOne: false
            referencedRelation: "care_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_psych_analyses: {
        Row: {
          analyzed_for_date: string
          anger_score: number
          anxiety_score: number
          care_recipient_id: string
          created_at: string
          depression_score: number
          energy_score: number
          fatigue_score: number
          id: string
          overall_tone: string
          risk_flags: string[]
          session_id: string | null
          summary: string
          voice_features: Json
        }
        Insert: {
          analyzed_for_date?: string
          anger_score?: number
          anxiety_score?: number
          care_recipient_id: string
          created_at?: string
          depression_score?: number
          energy_score?: number
          fatigue_score?: number
          id?: string
          overall_tone: string
          risk_flags?: string[]
          session_id?: string | null
          summary: string
          voice_features?: Json
        }
        Update: {
          analyzed_for_date?: string
          anger_score?: number
          anxiety_score?: number
          care_recipient_id?: string
          created_at?: string
          depression_score?: number
          energy_score?: number
          fatigue_score?: number
          id?: string
          overall_tone?: string
          risk_flags?: string[]
          session_id?: string | null
          summary?: string
          voice_features?: Json
        }
        Relationships: []
      }
      walk_checkins: {
        Row: {
          accuracy_m: number | null
          checkin_at: string
          created_at: string
          family_id: string | null
          id: string
          latitude: number
          longitude: number
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          checkin_at?: string
          created_at?: string
          family_id?: string | null
          id?: string
          latitude: number
          longitude: number
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          checkin_at?: string
          created_at?: string
          family_id?: string | null
          id?: string
          latitude?: number
          longitude?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      agency_rating_stats: {
        Row: {
          agency_id: string | null
          avg_rating: number | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_reviews_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_family_invite: { Args: { _token: string }; Returns: string }
      can_access_recipient: {
        Args: { _recipient_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_tip_views: { Args: { _tip_id: string }; Returns: undefined }
      is_primary_guardian: { Args: { _recipient_id: string }; Returns: boolean }
      is_senior_of_family: { Args: { _family_id: string }; Returns: boolean }
      match_tips: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          category_slug: string
          cover_image_url: string
          id: string
          similarity: number
          summary: string
          title: string
        }[]
      }
      user_family_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "member" | "guardian" | "senior"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member", "guardian", "senior"],
    },
  },
} as const
