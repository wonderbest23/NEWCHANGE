/**
 * Tripo3D 프롬프트 프리셋.
 *
 * 원칙:
 *  - 영문 작성 (한국어 가능하지만 영문이 일관성 ↑)
 *  - "단일 오브젝트" 가정 — 환경/조명/배경 묘사 금지
 *  - 5~15 단어 권장
 *  - low-poly + stylized 키워드로 모바일 폴리곤 예산 보호
 *  - 모든 프롬프트는 STYLE_SUFFIX 가 자동 부여되어 일관된 톤
 *
 * AI 3D 생성기 한계 (반드시 회피):
 *  - 사람 얼굴/손가락 디테일 ↓
 *  - 텍스트 글자
 *  - 미세한 메커니즘
 *  - 환경/배경 (단일 오브젝트만 잘 만듦)
 */

export interface PromptPreset {
  /** UI 버튼 라벨 (한국어 OK) */
  label: string;
  /** Tripo 에 전송될 핵심 프롬프트 (영문). STYLE_SUFFIX 가 자동 append */
  prompt: string;
}

/** 모든 프롬프트 끝에 자동 부여되는 스타일 suffix — 일관된 톤 유지 */
export const STYLE_SUFFIX =
  "low-poly stylized cartoon, single object, neutral pose, mobile game asset";

export const PROMPT_PRESETS: Record<string, PromptPreset[]> = {
  // ── 키오스크 (카페/편의점/패스트푸드 자가 주문) ──────────────────
  kiosk: [
    {
      label: "카페 키오스크",
      prompt:
        "cafe self-order kiosk, vertical touchscreen on white pedestal, soft rounded edges, friendly pastel colors",
    },
    {
      label: "패스트푸드 키오스크",
      prompt:
        "fast food ordering kiosk, large vertical screen, red and white body, rounded modern design",
    },
    {
      label: "편의점 결제기",
      prompt:
        "convenience store payment kiosk, slim white body, small screen on top, card reader at front",
    },
    {
      label: "모던 화이트",
      prompt:
        "modern minimal kiosk, all white body, single large touchscreen, sleek pedestal base",
    },
    {
      label: "스탠드형",
      prompt:
        "freestanding tablet-style kiosk on tall stand, dark frame, rounded screen",
    },
    {
      label: "은행 ATM",
      prompt:
        "bank ATM machine, blue and silver body, small screen with keypad below",
    },
  ],

  // ── 커피머신 (에스프레소 머신, 자동 머신) ──────────────────────
  coffee_machine: [
    {
      label: "에스프레소 (2그룹)",
      prompt:
        "compact espresso machine, two group heads with portafilters, chrome top, dark body",
    },
    {
      label: "에스프레소 (1그룹)",
      prompt:
        "small home espresso machine, single group head, polished steel body, water tank on side",
    },
    {
      label: "빈티지",
      prompt:
        "vintage style espresso machine, brass dome top, wooden handles, classic round shape",
    },
    {
      label: "자동 머신",
      prompt:
        "modern bean-to-cup coffee machine, sleek white body, touch panel on front, bean hopper on top",
    },
    {
      label: "프렌치 프레스",
      prompt:
        "french press coffee maker, tall glass body with metal frame, plunger lid",
    },
    {
      label: "드립 커피포트",
      prompt:
        "pour over drip coffee station, glass server with cone dripper on top",
    },
    {
      label: "그라인더",
      prompt:
        "coffee bean grinder, conical hopper on top, dark body with collection container",
    },
  ],

  // ── 포크레인 (소형 굴착기, 다양한 색상/크기) ────────────────────
  excavator: [
    {
      label: "노란 미니 굴착기",
      prompt:
        "cute yellow mini excavator with tracks, oversized bucket arm, friendly cartoon proportions",
    },
    {
      label: "주황 산업용",
      prompt:
        "industrial orange excavator with tracks, large boom arm, sturdy cab",
    },
    {
      label: "파란 컴팩트",
      prompt:
        "compact blue excavator, rounded cab, short boom arm, smiling cartoon design",
    },
    {
      label: "초록 굴착기",
      prompt:
        "small green excavator with caterpillar tracks, exposed engine bay, retro style",
    },
    {
      label: "휠로더",
      prompt:
        "yellow wheel loader with front bucket, four big rubber wheels, compact body",
    },
    {
      label: "덤프트럭",
      prompt:
        "yellow construction dump truck with tilting bed, cartoon proportions, big wheels",
    },
    {
      label: "지게차",
      prompt:
        "orange forklift truck, two front forks, small cabin, four wheels",
    },
  ],

  // ── 펫 (반려견 다양한 견종) ────────────────────────────────────
  pet: [
    {
      label: "골든 리트리버",
      prompt:
        "cute golden retriever puppy, big sparkly eyes, floppy ears, fluffy fur, sitting pose",
    },
    {
      label: "시바견",
      prompt:
        "small shiba inu puppy, orange and white fur, curled tail, perky ears, smiling",
    },
    {
      label: "말티즈",
      prompt:
        "fluffy white maltese puppy, big black nose, short legs, cute floppy ears",
    },
    {
      label: "포메라니안",
      prompt:
        "pomeranian puppy with extra fluffy orange fur, tiny face peeking through fur, cute",
    },
    {
      label: "프렌치 불독",
      prompt:
        "french bulldog puppy, gray with white chest, big bat ears, short snub face",
    },
    {
      label: "비글",
      prompt:
        "beagle puppy, tri-color fur, long floppy ears, wagging tail, friendly expression",
    },
    {
      label: "검은 라브라도",
      prompt:
        "black labrador puppy, glossy short fur, big paws, happy open mouth",
    },
    {
      label: "치와와",
      prompt:
        "tiny chihuahua puppy, tan fur, oversized pointed ears, large sparkly eyes",
    },
  ],

  // ── 물고기 (낚시용 — rarity 별 종류) ──────────────────────────
  fish: [
    {
      label: "송사리 (일반)",
      prompt:
        "small silver minnow fish, slim body, blue accent stripe, simple fins",
    },
    {
      label: "배스 (일반)",
      prompt:
        "stylized green bass fish, large mouth, scaly body, sturdy fins",
    },
    {
      label: "잉어 (희귀)",
      prompt:
        "koi carp fish, orange and white pattern, long whiskers, flowing fins",
    },
    {
      label: "황금잉어 (전설)",
      prompt:
        "legendary golden carp, glowing yellow scales, ornate flowing fins, magical aura",
    },
    {
      label: "메기",
      prompt:
        "catfish with long whiskers, dark brown body, flat head, smooth skin",
    },
    {
      label: "참돔",
      prompt:
        "red sea bream fish, pink-red scales, fan tail, deep body, cute eyes",
    },
    {
      label: "송어",
      prompt:
        "rainbow trout, pink stripe along body, speckled scales, sleek shape",
    },
    {
      label: "복어",
      prompt:
        "puffer fish puffed up round, beige with spots, tiny fins, surprised expression",
    },
  ],

  // ── 몬스터 (산책 몬스터 — 8종 rarity별) ────────────────────────
  monster: [
    {
      label: "새싹이 (common)",
      prompt:
        "tiny grass sprout creature, green leafy body with two big sparkly eyes, cute friendly face",
    },
    {
      label: "꽃돌이 (common)",
      prompt:
        "small flower bud creature, pink petals framing a cute face, green stem body",
    },
    {
      label: "돌맹이 (common)",
      prompt:
        "small gray stone creature with moss patches, simple sleepy eyes, rounded shape",
    },
    {
      label: "바람이 (rare)",
      prompt:
        "wispy white cloud spirit creature, swirling translucent body, gentle smile",
    },
    {
      label: "햇살이 (rare)",
      prompt:
        "sunbeam fairy creature, glowing yellow body, soft feathery wings, warm aura",
    },
    {
      label: "달빛이 (rare)",
      prompt:
        "dark blue night creature with crescent moon on forehead, small star patterns, dreamy eyes",
    },
    {
      label: "할머니숲 (legendary)",
      prompt:
        "ancient forest elder spirit, large mushroom hat, kind wrinkled face, glowing eyes",
    },
    {
      label: "황금새 (legendary)",
      prompt:
        "legendary golden bird, glowing iridescent feathers, ornate tail plume, majestic pose",
    },
  ],

  // ── 기타 (자유 입력) ───────────────────────────────────────────
  generic: [
    {
      label: "낚싯대 (Mobile WebAR)",
      prompt:
        "Mobile WebAR fishing rod game asset, simple clean fishing rod with reel, stylized semi-realistic, optimized for mobile GLB, low-poly, PBR texture, no brand logo, no background, game-ready asset. Negative: real brand logo, overly complex reel, too many tiny parts, high polygon count, broken geometry",
    },
    {
      label: "벤치",
      prompt: "wooden park bench, stylized, two-seat with curved backrest",
    },
    {
      label: "가로등",
      prompt: "ornate street lamp post, lantern style, dark metal, single light",
    },
    {
      label: "우산",
      prompt: "open umbrella, rainbow striped fabric, wooden handle",
    },
    {
      label: "선물 상자",
      prompt: "cute gift box with big bow, red wrapping, colorful ribbon",
    },
  ],
};

/** Tripo 에 보낼 최종 프롬프트 — 핵심 + STYLE_SUFFIX 결합 */
export function buildFinalPrompt(core: string): string {
  const trimmed = core.trim();
  if (!trimmed) return STYLE_SUFFIX;
  // 이미 suffix 가 포함됐다면 중복 방지
  if (trimmed.toLowerCase().includes("low-poly")) return trimmed;
  return `${trimmed}, ${STYLE_SUFFIX}`;
}
