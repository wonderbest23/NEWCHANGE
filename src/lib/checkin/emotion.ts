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
/**
 * 권고 종류 — 어르신께 다양한 형태로 콘텐츠를 제안하기 위해 카테고리화.
 * - action: 직접 해보는 행동 (기존 권고 형식)
 * - book: 추천 도서
 * - quote: 인용문·명언
 * - meditation: 짧은 명상·호흡 가이드
 * - place: 가볼 만한 장소 (서울/공원/공간 등)
 * - music: 음악·재생목록
 * - content: 영상·읽을거리 (다큐·기사)
 */
export type RecKind = "action" | "book" | "quote" | "meditation" | "place" | "music" | "content";

export type EmotionRecommendation = {
  /** 우선순위: now=지금 바로, soon=오늘 안에, keep=평소처럼 유지 */
  priority: RecPriority;
  /** 권고 주기 — 일일/주간/월간. 미지정시 daily로 간주 */
  cadence?: RecCadence;
  /** 권고 종류. 미지정시 action으로 간주 */
  kind?: RecKind;
  /** 시니어가 따라할 수 있는 한 줄 행동 권고 (또는 책 제목·명언 본문) */
  text: string;
  /** 한 줄 보충 — 왜/어떻게 / 책의 한 줄 소개 / 명언 의미 (선택) */
  hint?: string;
  /** 근거 — 논문/가이드라인 출처 요약 (선택) */
  evidence?: string;
  /** 책의 저자, 명언의 화자, 장소의 위치 등 메타 (선택) */
  author?: string;
  /** 외부 참고 링크 (선택) */
  link?: string;
};

export const REC_CADENCE_LABEL: Record<RecCadence, string> = {
  daily: "오늘",
  weekly: "이번 주",
  monthly: "이번 달",
};

/**
 * 감정별 풍부한 콘텐츠 풀 — 책/명언/명상/장소/음악/콘텐츠.
 * 매일 같은 권고가 나오지 않도록 30+ 항목을 두고 날짜로 회전 추출.
 *
 * 출처 원칙:
 *  - 책: 한국 노년·심리 분야의 베스트셀러 또는 공인 추천도서
 *  - 명언: 출처 명확한 문헌/인사 인용
 *  - 명상·호흡: 임상 검증된 기법 (4-7-8, box breathing 등)
 *  - 장소: 서울 시민이 무료로 이용 가능한 공원·도서관·복지관 위주
 */
const ENRICHMENT: Record<EmotionKey, EmotionRecommendation[]> = {
  joyful: [
    // 책 — 긍정 강화
    { kind: "book", priority: "keep", cadence: "weekly", text: "『해피니스 프로젝트』", author: "그레첸 루빈", hint: "행복은 큰 변화가 아니라 매일의 작은 습관에서 옵니다." },
    { kind: "book", priority: "keep", cadence: "weekly", text: "『나는 매일매일 자신감을 마신다』", author: "이미경", hint: "스스로를 토닥이는 30일 루틴." },
    { kind: "book", priority: "keep", cadence: "monthly", text: "『인생수업』", author: "엘리자베스 퀴블러 로스, 데이비드 케슬러", hint: "삶의 기쁨과 의미를 다시 발견하는 책." },
    // 명언
    { kind: "quote", priority: "keep", cadence: "daily", text: "행복은 우리 안에 있다. 멀리서 찾지 마라.", author: "공자" },
    { kind: "quote", priority: "keep", cadence: "daily", text: "감사하는 마음은 가장 큰 미덕이며, 다른 모든 미덕의 어머니다.", author: "키케로" },
    { kind: "quote", priority: "keep", cadence: "daily", text: "오늘 하루도 좋은 하루가 될 수 있다는 사실에 감사합시다.", author: "법정 스님" },
    // 장소
    { kind: "place", priority: "soon", cadence: "weekly", text: "서울숲 · 가족 산책길", author: "성동구 — 무료, 지하철 분당선 서울숲역", hint: "넓은 잔디밭과 사슴 방사장이 있어 마음이 트입니다." },
    { kind: "place", priority: "soon", cadence: "weekly", text: "남산공원 둘레길", author: "중구 — 케이블카·도보 모두 가능", hint: "탁 트인 서울 야경이 작은 행복을 더해줍니다." },
    // 음악/콘텐츠
    { kind: "music", priority: "keep", cadence: "daily", text: "정훈희 『꽃밭에서』", hint: "밝고 따뜻한 한국 가요 — 햇살 같은 멜로디." },
    { kind: "content", priority: "keep", cadence: "weekly", text: "EBS 『인생 후반전』 다큐 시리즈", hint: "비슷한 연배 어르신들의 행복한 삶 사례." },
  ],

  calm: [
    // 명상·호흡
    { kind: "meditation", priority: "keep", cadence: "daily", text: "4-7-8 호흡법 — 들숨 4초·멈춤 7초·날숨 8초", hint: "잠들기 전 3회 반복 → 부교감신경 활성화로 평온 유지." },
    { kind: "meditation", priority: "keep", cadence: "daily", text: "박스 호흡 — 4-4-4-4 (들숨·멈춤·날숨·멈춤 각 4초)", hint: "긴장 풀고 평온을 더 길게 잡아주는 기법." },
    { kind: "meditation", priority: "soon", cadence: "weekly", text: "바디스캔 명상 (10분)", hint: "발끝부터 머리까지 천천히 신체를 의식하며 내려놓기." },
    // 책
    { kind: "book", priority: "keep", cadence: "weekly", text: "『있는 그대로 사랑하라』", author: "틱낫한", hint: "마음챙김으로 매 순간을 평온하게 머무는 법." },
    { kind: "book", priority: "keep", cadence: "monthly", text: "『고요할수록 밝아지는 것들』", author: "혜민 스님", hint: "평온한 일상에 깊이를 더하는 짧은 글들." },
    // 명언
    { kind: "quote", priority: "keep", cadence: "daily", text: "고요한 마음은 모든 보물을 담을 수 있는 그릇이다.", author: "노자" },
    { kind: "quote", priority: "keep", cadence: "daily", text: "평화는 미소에서 시작된다.", author: "마더 테레사" },
    // 장소
    { kind: "place", priority: "soon", cadence: "weekly", text: "양재시민의숲", author: "서초구 — 잔디 + 산책로", hint: "도심에서 가장 조용한 숲. 평온한 분위기로 유명." },
    { kind: "place", priority: "soon", cadence: "weekly", text: "선유도공원 (한강 위 정원)", author: "영등포구 — 한강 풍광", hint: "물길과 정원이 어우러진 사색 산책지." },
    // 음악
    { kind: "music", priority: "keep", cadence: "daily", text: "이루마 『River Flows in You』", hint: "잔잔한 피아노 — 호흡과 박자가 맞는 느린 곡." },
  ],

  sad: [
    // 책 — 우울 회복
    { kind: "book", priority: "soon", cadence: "weekly", text: "『죽음의 수용소에서』", author: "빅터 프랭클", hint: "어떤 상황에서도 의미를 발견할 수 있다는 로고테라피." },
    { kind: "book", priority: "soon", cadence: "weekly", text: "『상처받지 않는 영혼』", author: "마이클 싱어", hint: "마음의 무게를 내려놓는 법을 안내합니다." },
    { kind: "book", priority: "soon", cadence: "monthly", text: "『지금 이 순간을 살아라』", author: "에크하르트 톨레", hint: "과거의 슬픔에서 오늘로 돌아오는 가이드." },
    // 명언
    { kind: "quote", priority: "soon", cadence: "daily", text: "이 또한 지나가리라.", author: "다윗 왕 (전해지는 잠언)", hint: "지금의 슬픔은 영원하지 않습니다." },
    { kind: "quote", priority: "soon", cadence: "daily", text: "별을 보려면 어둠이 필요하다.", author: "찰스 비어드" },
    { kind: "quote", priority: "soon", cadence: "daily", text: "슬픔은 사랑했다는 증거입니다.", author: "C.S. 루이스" },
    // 명상
    { kind: "meditation", priority: "now", cadence: "daily", text: "자기 자비 명상 (5분)", hint: "\"내가 평안하기를, 내가 건강하기를\"을 천천히 3번 되뇌어 보세요." },
    // 장소 — 햇살·자연
    { kind: "place", priority: "soon", cadence: "weekly", text: "올림픽공원 들꽃마루", author: "송파구 — 햇살 잘 드는 잔디밭", hint: "햇빛을 쬐며 천천히 걷는 것만으로도 기분이 회복됩니다." },
    { kind: "place", priority: "soon", cadence: "weekly", text: "한강공원 — 망원지구", author: "마포구 — 한강 일몰", hint: "노을을 보며 가까운 사람과 통화 한 번 해보세요." },
    // 음악
    { kind: "music", priority: "keep", cadence: "daily", text: "이선희 『인연』 / 김광석 『서른 즈음에』", hint: "감정을 토닥여 주는 한국 발라드 — 감정 정화에 도움." },
  ],

  tired: [
    // 명상·호흡 (회복용)
    { kind: "meditation", priority: "now", cadence: "daily", text: "10분 NSDR 휴식 (Non-Sleep Deep Rest)", hint: "눈 감고 누워 호흡에만 집중 — 짧지만 깊은 회복." },
    { kind: "meditation", priority: "now", cadence: "daily", text: "심호흡 5회 + 어깨 으쓱 3번", hint: "긴장된 어깨 근육이 풀리며 산소 공급이 늘어납니다." },
    // 책
    { kind: "book", priority: "soon", cadence: "weekly", text: "『잘 쉬는 법』", author: "클라우디아 해먼드", hint: "BBC가 추천한 10가지 쉼의 방식 — 누워 있지 않아도 쉴 수 있다." },
    { kind: "book", priority: "soon", cadence: "monthly", text: "『느리게 사는 즐거움』", author: "에크낫 이스워런", hint: "서두름이 피로를 만든다는 통찰." },
    // 명언
    { kind: "quote", priority: "now", cadence: "daily", text: "휴식은 게으름이 아니라 회복이다.", author: "오노레 드 발자크" },
    { kind: "quote", priority: "soon", cadence: "daily", text: "쉼표 없이 좋은 음악은 없다.", author: "스티브 위트(작가)" },
    // 장소
    { kind: "place", priority: "soon", cadence: "weekly", text: "근처 공공도서관 — 조용한 열람실", hint: "조용한 공간에서 30분만 앉아 있어도 피로가 풀립니다." },
    // 음악
    { kind: "music", priority: "keep", cadence: "daily", text: "조용필 『바람의 노래』", hint: "잔잔하고 깊은 한국 가요." },
    { kind: "content", priority: "keep", cadence: "weekly", text: "ASMR 『빗소리』 또는 『난로 타는 소리』 (10분)", hint: "백색소음은 신경계를 안정시켜 회복을 돕습니다." },
  ],

  alert: [
    // 호흡·이완
    { kind: "meditation", priority: "now", cadence: "daily", text: "5-5-5 호흡 (들숨·멈춤·날숨 각 5초)", hint: "긴장된 교감신경을 빠르게 진정시킵니다." },
    { kind: "meditation", priority: "now", cadence: "daily", text: "점진적 근육 이완 (PMR) — 발끝부터 머리까지", hint: "각 부위 5초 힘주고 → 10초 풀기. 신체 긴장 해소." },
    // 책 — 분노·스트레스 관리
    { kind: "book", priority: "soon", cadence: "weekly", text: "『화, 다스리는 법』", author: "틱낫한", hint: "분노를 안고 이해하는 마음챙김 접근." },
    { kind: "book", priority: "soon", cadence: "monthly", text: "『감정의 발견』", author: "마크 브래킷", hint: "감정을 인정·이해·표현하는 RULER 모델." },
    // 명언
    { kind: "quote", priority: "now", cadence: "daily", text: "분노는 한 순간의 광기다. 잠시 멈추라.", author: "호라티우스" },
    { kind: "quote", priority: "soon", cadence: "daily", text: "남에게 화내는 것은 다른 사람의 잘못으로 자신을 벌하는 것이다.", author: "마르쿠스 아우렐리우스" },
    // 장소
    { kind: "place", priority: "soon", cadence: "weekly", text: "북한산둘레길 — 우이령길", author: "강북·도봉구 — 완만한 트레킹", hint: "신체활동은 분노 각성을 빠르게 낮춥니다." },
    // 음악
    { kind: "music", priority: "keep", cadence: "daily", text: "Ludovico Einaudi 『Nuvole Bianche』", hint: "긴장 풀어주는 잔잔한 피아노 — 호흡과 박자가 맞아 진정 효과." },
  ],

  anxious: [
    // 호흡·그라운딩
    { kind: "meditation", priority: "now", cadence: "daily", text: "5-4-3-2-1 그라운딩", hint: "지금 보이는 5가지 · 들리는 4가지 · 만질 수 있는 3가지 · 냄새 2가지 · 맛 1가지를 천천히 짚어보세요." },
    { kind: "meditation", priority: "now", cadence: "daily", text: "긴 날숨 호흡 (4초 들숨 · 8초 날숨)", hint: "긴 날숨은 미주신경을 자극해 빠르게 안정을 되찾아 줍니다." },
    // 책
    { kind: "book", priority: "soon", cadence: "weekly", text: "『불안이라는 친구』", author: "스콧 스토셀", hint: "걱정을 적이 아닌 친구처럼 다루는 시선." },
    { kind: "book", priority: "soon", cadence: "monthly", text: "『지금 알고 있는 걸 그때도 알았더라면』", author: "류시화 엮음", hint: "흔들리는 마음을 다잡는 한 줄 잠언 모음." },
    // 명언
    { kind: "quote", priority: "now", cadence: "daily", text: "걱정의 96%는 실제로 일어나지 않는다.", author: "코넬대 연구 (Borkovec, 1999)", hint: "지금의 걱정도 대부분 그냥 지나갈 거예요." },
    { kind: "quote", priority: "now", cadence: "daily", text: "용기는 두려움이 없는 것이 아니라, 두려움 속에서도 한 발 내딛는 것이다.", author: "넬슨 만델라" },
    { kind: "quote", priority: "soon", cadence: "daily", text: "지금 이 순간은 안전합니다.", author: "마음챙김 기법 (MBSR)" },
    // 장소
    { kind: "place", priority: "soon", cadence: "weekly", text: "청계천 산책로", author: "종로/중구 — 도심 속 물길", hint: "물 흐르는 소리는 불안을 가라앉히는 자연의 백색소음." },
    // 음악
    { kind: "music", priority: "keep", cadence: "daily", text: "Marconi Union 『Weightless』", hint: "Mindlab 연구에서 불안 65% 감소 효과로 보고된 '세상에서 가장 편안한 곡'.", evidence: "Mindlab International, 2011 — 음악과 불안 측정 실험" },
    { kind: "content", priority: "soon", cadence: "weekly", text: "정신건강위기상담 1577-0199 (24시간 무료)", hint: "혼자 견디지 마세요. 전화 한 통으로 큰 짐을 덜 수 있어요." },
  ],
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
  // 기본 행동 권고 + 풍부한 콘텐츠(책/명언/명상/장소/음악) 병합 후
  // kind 필드에 기본값(action)을 채워서 반환.
  const base = RECOMMENDATIONS[key] ?? [];
  const extras = ENRICHMENT[key] ?? [];
  return [...base, ...extras].map((r) => ({
    ...r,
    kind: r.kind ?? "action",
  }));
}

/**
 * 날짜 기반 결정적(deterministic) 회전 — 같은 날엔 항상 같은 결과,
 * 다른 날엔 다른 결과를 보여줘 매일 새로운 콘텐츠가 노출되도록 함.
 *
 * @param items 후보 풀
 * @param count 추출 개수
 * @param salt  emotionKey 등을 더해 감정별로 회전 위상 분리
 */
export function rotateDaily<T>(items: T[], count: number, salt = ""): T[] {
  if (items.length === 0) return [];
  if (items.length <= count) return items;
  // YYYY-MM-DD (KST) 를 시드로 사용
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  let seed = 0;
  for (const c of dayKey + salt) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  // 시작 인덱스 + 균등 간격으로 count 개 추출 — 풀이 크면 다양성 유지
  const start = seed % items.length;
  const step = Math.max(1, Math.floor(items.length / count));
  const picked: T[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(items[(start + i * step) % items.length]);
  }
  return picked;
}

/**
 * 감정별 "오늘의 다양한 안내" — 행동 1개 + 책/명언/명상/장소/음악 등 다른 종류 2~3개를
 * 서로 다른 카테고리로 골라 반환. 매일 회전.
 */
export function getDailyMixedRecommendations(
  key: EmotionKey,
  count = 4,
): EmotionRecommendation[] {
  const all = getEmotionRecommendations(key);
  // kind 별로 묶음
  const buckets = new Map<RecKind, EmotionRecommendation[]>();
  for (const r of all) {
    const k = (r.kind ?? "action") as RecKind;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }
  // 우선순위: action(즉각 행동) → meditation → quote → book → place → music → content
  const order: RecKind[] = ["action", "meditation", "quote", "book", "place", "music", "content"];
  const out: EmotionRecommendation[] = [];
  for (const k of order) {
    const list = buckets.get(k);
    if (!list?.length) continue;
    const [pick] = rotateDaily(list, 1, key + ":" + k);
    if (pick) out.push(pick);
    if (out.length >= count) break;
  }
  return out;
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

const PRIORITY_RANK: Record<RecPriority, number> = {
  now: 0,
  soon: 1,
  keep: 2,
};

/** urgent/caution일 때 '지금 바로' 권고를 앞에 두기 */
export function sortRecommendationsByCondition(
  items: EmotionRecommendation[],
  condition?: ConditionLevel | string | null,
): EmotionRecommendation[] {
  const c = (condition ?? "normal") as ConditionLevel;
  if (c !== "urgent" && c !== "caution") return items;
  return [...items].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}

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
