// 감정 단계 매핑 — 논문(음성 기반 감정 상태 개요) 기반 6개 감정.
// 시니어 친화적으로 부드러운 라벨 사용 + Valence/Arousal 차원 포함.
//
// 논문 기준 매핑:
//   - 행복(Joy)        → joyful   : Valence+, Arousal+ (#F4D35E 노란색)
//   - 평온(Calm/Neutral) → calm    : Valence+, Arousal- (#4ECDC4 연두/회색)
//   - 슬픔(Sadness)    → sad      : Valence-, Arousal- (#457B9D 파란색)
//   - 지침(저에너지)    → tired    : Valence-, Arousal-- (논문의 슬픔 변형, 따뜻한 회청)
//   - 분노/공포(고각성 부정) → alert : Valence-, Arousal+ (#E63946 빨강)
//   - 걱정/불안(Fear)   → anxious  : Valence-, Arousal+ (#9B5DE5 보라)

export type ConditionLevel = "good" | "normal" | "caution" | "urgent";

export type EmotionKey =
  | "joyful"   // 행복 (Joy)
  | "calm"     // 평온 (Calm/Neutral)
  | "sad"      // 슬픔 (Sadness)
  | "tired"    // 지침/피곤 (저에너지)
  | "alert"    // 분노/공포 (고각성 부정 — 시니어 안부 맥락에선 "긴장")
  | "anxious"; // 걱정/불안 (Fear)

export type EmotionInfo = {
  key: EmotionKey;
  /** 시니어에게 보일 부드러운 한국어 상태 표현 */
  label: string;
  /** 한 줄 코멘트 — "오늘은 ~" 형태로 이어지는 보조 문구 */
  caption: string;
  emoji: string;
  /** Tailwind 그라데이션 클래스 (보조 배경용) */
  gradient: string;
  /** 본문에서 라벨 강조용 텍스트 색 */
  textTone: string;
  /** 회전하는 미래형 conic 그라데이션 (인라인 background) */
  conic: string;
  /** 글로우 오라용 색 (rgba) */
  glow: string;
  /** Valence: -1(부정) ~ +1(긍정) */
  valence: number;
  /** Arousal: 0(차분) ~ 1(격렬) — Orb 회전속도/글로우 강도에 사용 */
  arousal: number;
};

const EMOTIONS: Record<EmotionKey, EmotionInfo> = {
  // 행복(Joy) — 노란색 #F4D35E, 높은 피치/에너지/속도
  joyful: {
    key: "joyful",
    label: "밝고 좋아요",
    caption: "목소리에 힘과 생기가 느껴져요",
    emoji: "😄",
    gradient: "bg-gradient-to-br from-amber-200 via-yellow-300 to-amber-400",
    textTone: "text-amber-700",
    conic:
      "conic-gradient(from 0deg, #fde68a, #f4d35e, #fbbf24, #fcd34d, #f4d35e, #fde68a)",
    glow: "rgba(244, 211, 94, 0.6)",
    valence: 0.8,
    arousal: 0.75,
  },

  // 평온(Calm) — 연두/청록 #4ECDC4, 중간 피치/낮은 활성
  calm: {
    key: "calm",
    label: "평온해요",
    caption: "고르고 편안한 목소리예요",
    emoji: "🙂",
    gradient: "bg-gradient-to-br from-teal-200 via-emerald-300 to-teal-400",
    textTone: "text-teal-700",
    conic:
      "conic-gradient(from 0deg, #99f6e4, #5eead4, #4ecdc4, #2dd4bf, #5eead4, #99f6e4)",
    glow: "rgba(78, 205, 196, 0.5)",
    valence: 0.6,
    arousal: 0.2,
  },

  // 슬픔(Sadness) — 파란색 #457B9D, 낮은 에너지·느린 발화·긴 침묵
  sad: {
    key: "sad",
    label: "마음이 가라앉아요",
    caption: "목소리에 무거움이 묻어 있어요",
    emoji: "🥺",
    gradient: "bg-gradient-to-br from-sky-300 via-blue-400 to-indigo-500",
    textTone: "text-sky-700",
    conic:
      "conic-gradient(from 0deg, #93c5fd, #60a5fa, #457b9d, #3b82f6, #60a5fa, #93c5fd)",
    glow: "rgba(69, 123, 157, 0.55)",
    valence: -0.65,
    arousal: 0.25,
  },

  // 지침/피곤 — 저에너지, 따뜻한 회청
  tired: {
    key: "tired",
    label: "지쳐 보여요",
    caption: "평소보다 목소리에 힘이 없어요",
    emoji: "😮‍💨",
    gradient: "bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500",
    textTone: "text-slate-700",
    conic:
      "conic-gradient(from 0deg, #cbd5e1, #94a3b8, #64748b, #94a3b8, #cbd5e1)",
    glow: "rgba(100, 116, 139, 0.5)",
    valence: -0.4,
    arousal: 0.15,
  },

  // 분노/공포 (고각성 부정) — 빨간색 #E63946, 강한 에너지·빠른 발성
  alert: {
    key: "alert",
    label: "긴장된 느낌이에요",
    caption: "강하고 빠른 말투가 느껴져요",
    emoji: "😣",
    gradient: "bg-gradient-to-br from-rose-400 via-red-500 to-rose-600",
    textTone: "text-rose-700",
    conic:
      "conic-gradient(from 0deg, #fda4af, #fb7185, #e63946, #ef4444, #fb7185, #fda4af)",
    glow: "rgba(230, 57, 70, 0.65)",
    valence: -0.75,
    arousal: 0.9,
  },

  // 걱정/불안(Fear) — 보라색 #9B5DE5, 높은 피치·낮은 에너지·떨림
  anxious: {
    key: "anxious",
    label: "걱정이 느껴져요",
    caption: "목소리가 떨리듯 가늘어요",
    emoji: "😟",
    gradient: "bg-gradient-to-br from-violet-300 via-purple-400 to-indigo-500",
    textTone: "text-violet-700",
    conic:
      "conic-gradient(from 0deg, #ddd6fe, #c4b5fd, #9b5de5, #a78bfa, #c4b5fd, #ddd6fe)",
    glow: "rgba(155, 93, 229, 0.6)",
    valence: -0.6,
    arousal: 0.7,
  },
};

/**
 * AI 분석 결과(condition_level + mood_status 한글 자유서술)를
 * 6개 감정(논문 기준) 중 하나로 매핑한다.
 */
export function resolveEmotion(
  condition: ConditionLevel | string | null | undefined,
  mood: string | null | undefined,
): EmotionInfo {
  const c = (condition ?? "normal") as ConditionLevel;
  const m = (mood ?? "").toLowerCase();

  // urgent는 우선 긴장(고각성 부정)으로
  if (c === "urgent") return EMOTIONS.alert;

  // mood 자유서술에서 단서 우선 추출 (논문의 음성 특징 키워드 기반)
  if (/분노|화|짜증|격앙|angry|anger/.test(m)) return EMOTIONS.alert;
  if (/불안|걱정|초조|두렵|무서|떨림|anxi|worry|fear/.test(m)) return EMOTIONS.anxious;
  if (/우울|슬|외로|쓸쓸|허전|down|sad/.test(m)) return EMOTIONS.sad;
  if (/지치|피곤|힘들|기운\s*없|졸림|무기력|tired|exhaust|low\s*energy/.test(m))
    return EMOTIONS.tired;
  if (/좋|행복|기쁘|즐거|상쾌|밝|happy|joy|great/.test(m)) return EMOTIONS.joyful;
  if (/평온|편안|괜찮|보통|차분|calm|fine|neutral/.test(m)) return EMOTIONS.calm;

  // condition_level fallback
  if (c === "good") return EMOTIONS.joyful;
  if (c === "caution") return EMOTIONS.tired;
  return EMOTIONS.calm;
}

export const EMOTION_LIST = Object.values(EMOTIONS);

// ─────────────────────────────────────────────────────────────
// 감정별 비약물적 개입 권고 (논문 기반: 시니어 안부 맥락)
// 출처: deep-research-report 「감정별 비약물적 개입 및 권고사항」
//   - 평온: 호흡 이완·명상 유지   (근거: 호흡이완 RCT)
//   - 기쁨: 긍정 강화·감사 회상·소셜 활동 (관찰)
//   - 슬픔: 감정 공유·사회적 연계·CBT 재구성 (메타분석)
//   - 지침: 휴식·수분·가벼운 산책 (전문가 권고)
//   - 분노/긴장: 10초 호흡·신체활동 전환·인지재평가 (CBT)
//   - 불안: 천천히 깊은 호흡·안심 멘트·사실 점검 (RCT)
// ─────────────────────────────────────────────────────────────

export type RecPriority = "now" | "soon" | "keep";
export type RecCadence = "daily" | "weekly" | "monthly";

export type EmotionRecommendation = {
  /** 우선순위: now=지금 바로, soon=오늘 안에, keep=평소처럼 유지 */
  priority: RecPriority;
  /** 권고 주기 — 일일/주간/월간. 미지정시 daily로 간주 */
  cadence?: RecCadence;
  /** 시니어가 따라할 수 있는 한 줄 행동 권고 */
  text: string;
  /** 한 줄 보충 — 왜/어떻게 (선택) */
  hint?: string;
  /** 근거 — 논문/가이드라인 출처 요약 (선택) */
  evidence?: string;
};

export const REC_CADENCE_LABEL: Record<RecCadence, string> = {
  daily: "오늘",
  weekly: "이번 주",
  monthly: "이번 달",
};

const RECOMMENDATIONS: Record<EmotionKey, EmotionRecommendation[]> = {
  // ── 기쁨(Joy) — 긍정 강화·감사 회상·소셜 활동 ─────────────────
  joyful: [
    { priority: "keep", cadence: "daily", text: "오늘 좋았던 일을 한 가지 떠올려 적어보세요", hint: "감사 일기는 긍정 정서를 더 오래 지속시킵니다.", evidence: "Positive psychology 연구: 감사 일기 6주 개입에서 우울감 감소 보고" },
    { priority: "soon", cadence: "daily", text: "가족이나 가까운 사람에게 짧은 안부 인사를 보내보세요", hint: "긍정적인 대화는 좋은 기분을 더 오래 유지시켜요." },
    { priority: "keep", cadence: "daily", text: "좋아하시는 취미·산책을 잠깐 즐겨보세요" },
    { priority: "soon", cadence: "weekly", text: "이번 주 한 번은 친구·이웃과 식사나 차를 함께 해보세요", hint: "사회적 연결은 노년기 정서 안정의 핵심 요인입니다.", evidence: "노인 사회적 지지 메타분석: 정기적 교류가 우울 위험 감소" },
    { priority: "keep", cadence: "weekly", text: "새로운 활동(요리·미술 등)을 한 가지 시도해 보세요" },
    { priority: "keep", cadence: "monthly", text: "봉사활동·멘토링 등 사회적 기여 활동에 참여해 보세요", hint: "타인을 돕는 활동은 자존감과 삶의 만족도를 높입니다." },
    { priority: "soon", cadence: "monthly", text: "정기 건강검진·인지건강 워크숍에 참여해 보세요" },
  ],

  // ── 평온(Calm) — 호흡 이완·명상 유지 ─────────────────────────
  calm: [
    { priority: "keep", cadence: "daily", text: "지금의 편안함을 유지해 보세요", hint: "물 한 잔, 창밖 보기처럼 작은 휴식이 좋아요." },
    { priority: "soon", cadence: "daily", text: "잠들기 전 천천히 5번 깊은 호흡을 해보세요", hint: "들숨 4초 · 날숨 6초. 평온을 내일까지 이어가는 데 도움이 돼요." },
    { priority: "keep", cadence: "daily", text: "부드러운 음악을 5~10분 감상해 보세요" },
    { priority: "soon", cadence: "weekly", text: "주 2~3회 가까운 공원에서 가벼운 산책을 해보세요", hint: "주 2회 30분 걷기 운동은 정서 안정에 효과적입니다.", evidence: "Ruiz-Comellas 등(2022): 노인 그룹 걷기 운동 4개월 RCT" },
    { priority: "keep", cadence: "weekly", text: "요가·명상 클래스에 참여해 보세요" },
    { priority: "soon", cadence: "monthly", text: "정기 취미 모임(독서·정원 가꾸기)에 참석해 보세요", hint: "고립 회피는 평온한 상태를 유지하는 데 중요합니다." },
    { priority: "keep", cadence: "monthly", text: "정기 신체검사를 한 번 받아보세요" },
  ],

  // ── 슬픔(Sadness) — 감정 공유·사회적 연계·운동 ────────────────
  sad: [
    { priority: "now", cadence: "daily", text: "마음이 가라앉을 때는 가족이나 친구에게 전화해 보세요", hint: "짧은 대화도 외로움을 크게 줄여줍니다." },
    { priority: "soon", cadence: "daily", text: "햇볕이 드는 곳에서 5~10분 천천히 걸어보세요", hint: "햇빛 노출과 가벼운 운동은 세로토닌 분비를 촉진합니다.", evidence: "노인 우울 메타분석: 유산소·근력 운동의 우울 개선 효과" },
    { priority: "soon", cadence: "daily", text: "오늘 한 가지 좋았던 일을 떠올려 보세요", hint: "작은 긍정 기억이 기분 회복에 도움이 됩니다." },
    { priority: "soon", cadence: "weekly", text: "주 2회 이상 친구·가족과 대면 또는 통화로 안부를 나눠보세요", hint: "주 2회 4개월 그룹 활동으로 우울 증상 약 59% 감소가 보고되었습니다.", evidence: "Ruiz-Comellas 등(2022) 그룹 운동·산책 RCT" },
    { priority: "soon", cadence: "weekly", text: "시니어 커뮤니티·복지관 모임에 한 번 참여해 보세요" },
    { priority: "keep", cadence: "weekly", text: "코미디 영상·웃음 치료 콘텐츠를 30분 정도 감상해 보세요" },
    { priority: "now", cadence: "monthly", text: "기분 저하가 2주 이상 이어지면 전문 상담을 받아보세요", hint: "보호자에게 알리거나 1577-0199(정신건강위기상담)에 전화할 수 있어요.", evidence: "DSM-5 주요우울장애 진단 기준: 2주 이상 지속" },
    { priority: "soon", cadence: "monthly", text: "주 2회 이상 규칙적 운동 프로그램(걷기·체조)을 시작해 보세요", evidence: "노인 우울 메타분석: 12주 이상 규칙적 운동의 누적 효과" },
  ],

  // ── 지침/피곤(저에너지) — 휴식·수분·점진적 활동 ──────────────
  tired: [
    { priority: "now", cadence: "daily", text: "지금은 무리하지 말고 10분 정도 편히 쉬어보세요" },
    { priority: "now", cadence: "daily", text: "따뜻한 물 한 잔을 천천히 드셔보세요", hint: "수분 부족도 피로와 어지럼의 원인이 됩니다." },
    { priority: "soon", cadence: "daily", text: "오늘은 일찍 잠자리에 드는 것을 권해드려요", hint: "수면 7~8시간 확보는 시니어 컨디션 회복의 기본입니다." },
    { priority: "keep", cadence: "daily", text: "카페인은 오후 2시 이후로는 피해 주세요" },
    { priority: "soon", cadence: "weekly", text: "주 2~3회 가벼운 스트레칭이나 10분 산책으로 활동량을 조금씩 늘려보세요", hint: "급격한 운동보다 점진적 활동이 시니어 피로 회복에 유리합니다." },
    { priority: "soon", cadence: "weekly", text: "수면 시간·낮잠을 일정하게 유지해 보세요", evidence: "노인 수면 위생 가이드라인: 규칙적 수면-각성 주기" },
    { priority: "now", cadence: "monthly", text: "피로가 2주 이상 이어지면 보호자에게 알리고 진료를 받아보세요", hint: "빈혈·갑상선·심혈관 등 신체 원인 확인이 필요할 수 있어요." },
    { priority: "soon", cadence: "monthly", text: "정기 건강검진(혈액검사 포함)을 한 번 받아보세요" },
  ],

  // ── 분노/긴장(고각성 부정) — 호흡·신체활동·인지재평가(CBT) ──
  alert: [
    { priority: "now", cadence: "daily", text: "잠시 멈추고 천천히 10까지 세며 깊게 숨을 쉬어보세요", hint: "들숨 4초 · 멈춤 2초 · 날숨 6초를 3번 반복합니다." },
    { priority: "now", cadence: "daily", text: "자리에서 일어나 가벼운 스트레칭이나 짧은 산책을 해보세요", hint: "신체 활동 전환은 분노 각성을 빠르게 낮춰줍니다." },
    { priority: "soon", cadence: "daily", text: "무엇이 마음을 불편하게 했는지 한 줄로 적어보세요", hint: "감정을 글로 옮기면 강도가 줄어듭니다.(인지재평가)" },
    { priority: "soon", cadence: "weekly", text: "주 1~2회 마인드풀니스·명상 시간을 가져보세요", evidence: "노인 대상 명상·이완 훈련의 분노·불안 완화 효과" },
    { priority: "soon", cadence: "weekly", text: "가족·친구와 분노의 원인을 차분히 이야기로 나눠보세요" },
    { priority: "keep", cadence: "weekly", text: "스트레스 관리·이완 훈련 워크숍에 참여해 보세요" },
    { priority: "soon", cadence: "monthly", text: "분노 조절 프로그램(인지행동치료 CBT)을 알아보세요", evidence: "고령층 CBT의 우울·불안 개선 메타분석 결과" },
    { priority: "keep", cadence: "monthly", text: "구조화된 사회적 지원 모임(자조모임)에 참여해 보세요" },
  ],

  // ── 불안(Fear) — 깊은 호흡·안심·운동 ─────────────────────────
  anxious: [
    { priority: "now", cadence: "daily", text: "지금 천천히 깊은 호흡을 5번 해보세요", hint: "들숨 4초 · 날숨 6초. 어깨에 힘을 빼고 천천히요." },
    { priority: "now", cadence: "daily", text: "\"지금 이 순간은 안전합니다\"라고 천천히 말해보세요", hint: "현재의 안전을 짚어주면 긴장이 가라앉습니다.(grounding)" },
    { priority: "soon", cadence: "daily", text: "걱정되는 일을 한 가지만 가족에게 이야기해 보세요" },
    { priority: "keep", cadence: "daily", text: "오늘은 카페인 섭취를 줄여 주세요" },
    { priority: "soon", cadence: "weekly", text: "주 2회 이상 30분 걷기 등 중강도 운동을 해보세요", hint: "그룹 걷기 4개월로 노인 불안 약 45% 감소 보고", evidence: "Ruiz-Comellas 등(2022) RCT / Nakhaee 등 메타분석" },
    { priority: "soon", cadence: "weekly", text: "그룹 산책·명상 클래스에 참여해 보세요" },
    { priority: "keep", cadence: "weekly", text: "이완 훈련(점진적 근육이완)을 1~2회 해보세요" },
    { priority: "now", cadence: "monthly", text: "불안이 자주 반복되면 가까운 의료기관 상담을 권해드려요", hint: "필요시 전문가가 약물 검토·조정을 도와드릴 수 있어요." },
    { priority: "soon", cadence: "monthly", text: "만성 스트레스 상담(심리상담 또는 정신건강의학과)을 한 번 받아보세요" },
  ],
};

export function getEmotionRecommendations(key: EmotionKey): EmotionRecommendation[] {
  return RECOMMENDATIONS[key] ?? [];
}

/** 주기별로 권고를 묶어서 반환 (자세히 보기·주간/월간 탭용) */
export function getEmotionRecommendationsByCadence(
  key: EmotionKey,
): Record<RecCadence, EmotionRecommendation[]> {
  const list = getEmotionRecommendations(key);
  return {
    daily: list.filter((r) => (r.cadence ?? "daily") === "daily"),
    weekly: list.filter((r) => r.cadence === "weekly"),
    monthly: list.filter((r) => r.cadence === "monthly"),
  };
}

/** 감정 + 상황(condition)에 맞는 "지금 해볼 한 가지"를 우선순위로 골라 1개 반환 */
export function pickTopRecommendation(
  key: EmotionKey,
  condition?: ConditionLevel | string | null,
): EmotionRecommendation {
  // 일일 권고에서만 1개 선정 (주간/월간은 "지금 한 가지"로 부적합)
  const list = getEmotionRecommendations(key).filter((r) => (r.cadence ?? "daily") === "daily");
  // urgent/caution일수록 now 우선
  const order: RecPriority[] =
    condition === "urgent" || condition === "caution"
      ? ["now", "soon", "keep"]
      : ["soon", "now", "keep"];
  for (const p of order) {
    const found = list.find((r) => r.priority === p);
    if (found) return found;
  }
  return list[0];
}

export const REC_PRIORITY_LABEL: Record<RecPriority, string> = {
  now: "지금 바로",
  soon: "오늘 안에",
  keep: "평소처럼",
};

// ─────────────────────────────────────────────────────────────
// 알림 레벨 — 보고서 §6 「알림·보호자 통보 정책」 기반
//   low  = 평소 안부 (하루 1회 확인)
//   mid  = 관심 신호 (보호자에게 부드럽게 공유 권유)
//   high = 위험 신호 (즉시 보호자 통보 + 위기상담 라인 안내)
// ─────────────────────────────────────────────────────────────

export type AlertLevel = "low" | "mid" | "high";

export type EmotionAlert = {
  level: AlertLevel;
  /** 시니어 본인에게 보일 부드러운 한 줄 상태 메시지 */
  message: string;
  /** 보호자에게 자동 알림이 갈 수 있는지 여부 */
  notifyGuardian: boolean;
  /** high일 때 노출할 위기상담/응급 라인 (없으면 생략) */
  hotline?: { label: string; tel: string }[];
};

export const ALERT_LEVEL_LABEL: Record<AlertLevel, string> = {
  low: "평소 안부",
  mid: "관심 신호",
  high: "주의 신호",
};

const HOTLINES = {
  suicide: { label: "자살예방상담 1393", tel: "1393" },
  mental: { label: "정신건강위기상담 1577-0199", tel: "1577-0199" },
  emergency: { label: "응급 119", tel: "119" },
};

/**
 * 감정 + 상황(condition)으로 알림 레벨을 산출.
 * - urgent → 무조건 high
 * - 슬픔/긴장 + caution → high
 * - 슬픔/지침/긴장/불안 → mid
 * - 행복/평온 → low
 */
export function resolveAlert(
  key: EmotionKey,
  condition?: ConditionLevel | string | null,
): EmotionAlert {
  const c = (condition ?? "normal") as ConditionLevel;

  if (c === "urgent") {
    return {
      level: "high",
      message: "지금 도움이 필요해 보여요. 가족이나 상담 라인에 연락해보세요.",
      notifyGuardian: true,
      hotline: [HOTLINES.suicide, HOTLINES.mental, HOTLINES.emergency],
    };
  }

  if ((key === "sad" || key === "alert") && c === "caution") {
    return {
      level: "high",
      message: "마음이 많이 무거워 보여요. 가까운 사람에게 잠시 이야기해 보세요.",
      notifyGuardian: true,
      hotline: key === "sad" ? [HOTLINES.suicide, HOTLINES.mental] : [HOTLINES.mental],
    };
  }

  if (key === "sad" || key === "tired" || key === "alert" || key === "anxious") {
    return {
      level: "mid",
      message:
        key === "sad"
          ? "오늘은 마음이 가라앉아 있어요. 가족과 짧게라도 이야기해보면 좋아요."
          : key === "tired"
            ? "평소보다 지쳐 있어요. 무리하지 말고 충분히 쉬어주세요."
            : key === "alert"
              ? "긴장이 느껴져요. 잠시 호흡을 가다듬어보세요."
              : "걱정이 느껴져요. 천천히 깊은 호흡으로 진정해보세요.",
      notifyGuardian: false,
    };
  }

  return {
    level: "low",
    message:
      key === "joyful"
        ? "오늘은 컨디션이 좋아 보여요. 이 기분을 이어가요."
        : "고르고 편안한 하루예요. 평소처럼 지내시면 돼요.",
    notifyGuardian: false,
  };
}
