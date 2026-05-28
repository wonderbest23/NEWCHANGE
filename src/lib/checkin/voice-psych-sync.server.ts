/**
 * 안부 체크인(LLM) 결과 → voice_psych_analyses 참고 행 생성.
 * 음성 ML 파이프라인이 아닌, 감정 매핑 기반 참고 지표임을 voice_features에 명시.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveEmotion, type ConditionLevel, type EmotionKey } from "./emotion";

const OVERALL_TONE_BY_EMOTION: Record<EmotionKey, string> = {
  joyful: "bright_energetic",
  calm: "calm_warm",
  sad: "low_energy_flat",
  tired: "low_energy_flat",
  alert: "irritable",
  anxious: "anxious_tense",
};

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function deriveScores(emotionKey: EmotionKey, valence: number, arousal: number) {
  const base = { energy: 50, fatigue: 50, depression: 50, anxiety: 50, anger: 50 };
  switch (emotionKey) {
    case "joyful":
      return {
        energy: clampScore(55 + valence * 35 + arousal * 10),
        fatigue: clampScore(35 - arousal * 15),
        depression: clampScore(30 - valence * 25),
        anxiety: clampScore(28 - valence * 15),
        anger: 25,
      };
    case "calm":
      return {
        energy: clampScore(48 + valence * 20),
        fatigue: clampScore(40 - arousal * 10),
        depression: clampScore(32 - valence * 20),
        anxiety: clampScore(25 - valence * 10),
        anger: 22,
      };
    case "sad":
      return {
        energy: clampScore(38 + valence * 15),
        fatigue: clampScore(58 - valence * 10),
        depression: clampScore(68 - valence * 20),
        anxiety: clampScore(45 + arousal * 15),
        anger: 30,
      };
    case "tired":
      return {
        energy: clampScore(32 + valence * 12),
        fatigue: clampScore(72 - valence * 10),
        depression: clampScore(55 - valence * 15),
        anxiety: clampScore(40 + arousal * 10),
        anger: 28,
      };
    case "alert":
      return {
        energy: clampScore(52 + arousal * 35),
        fatigue: clampScore(45),
        depression: clampScore(48 + valence * 10),
        anxiety: clampScore(55 + arousal * 25),
        anger: clampScore(70 + arousal * 20),
      };
    case "anxious":
      return {
        energy: clampScore(42 + arousal * 20),
        fatigue: clampScore(52),
        depression: clampScore(50 + valence * 10),
        anxiety: clampScore(72 + arousal * 15),
        anger: clampScore(40 + arousal * 15),
      };
    default:
      return base;
  }
}

function kstTodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export async function syncVoicePsychFromSeniorCheckin(input: {
  familyId: string;
  checkinId: string;
  conditionLevel: string;
  moodStatus: string | null;
  summary: string;
  urgentDetected: boolean;
  lonelinessDetected: boolean;
  dizzinessDetected: boolean;
}): Promise<void> {
  const { data: recipient, error: recipientError } = await supabaseAdmin
    .from("care_recipients")
    .select("id")
    .eq("family_id", input.familyId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (recipientError || !recipient) {
    if (recipientError) console.warn("[voice-psych-sync] recipient", recipientError.message);
    return;
  }

  const emotion = resolveEmotion(
    input.conditionLevel as ConditionLevel,
    input.moodStatus,
  );
  const scores = deriveScores(emotion.key, emotion.valence, emotion.arousal);
  const analyzedForDate = kstTodayDate();

  const riskFlags: string[] = [];
  if (input.urgentDetected || input.conditionLevel === "urgent") riskFlags.push("checkin_urgent");
  if (input.lonelinessDetected) riskFlags.push("loneliness");
  if (input.dizzinessDetected) riskFlags.push("dizziness");

  const row = {
    care_recipient_id: recipient.id,
    session_id: null,
    analyzed_for_date: analyzedForDate,
    overall_tone: OVERALL_TONE_BY_EMOTION[emotion.key],
    energy_score: scores.energy,
    fatigue_score: scores.fatigue,
    depression_score: scores.depression,
    anxiety_score: scores.anxiety,
    anger_score: scores.anger,
    voice_features: {
      source: "daily_voice_checkin",
      checkin_id: input.checkinId,
      emotion_key: emotion.key,
      valence: emotion.valence,
      arousal: emotion.arousal,
      condition_level: input.conditionLevel,
      mood_status: input.moodStatus,
      disclaimer: "안부 LLM·감정 매핑 기반 참고 지표이며, 음성 파형 ML 분석이 아닙니다.",
    },
    summary: input.summary || `${emotion.label} 신호가 안부 기록에 반영됐어요.`,
    risk_flags: riskFlags,
  };

  const { data: existing } = await supabaseAdmin
    .from("voice_psych_analyses")
    .select("id")
    .eq("care_recipient_id", recipient.id)
    .eq("analyzed_for_date", analyzedForDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("voice_psych_analyses")
      .update(row)
      .eq("id", existing.id);
    if (error) console.warn("[voice-psych-sync] update", error.message);
    return;
  }

  const { error } = await supabaseAdmin.from("voice_psych_analyses").insert(row);
  if (error) console.warn("[voice-psych-sync] insert", error.message);
}
