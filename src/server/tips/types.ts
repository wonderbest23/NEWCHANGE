// Shared types for senior tips (꿀팁) feature.
// Categories are seeded in DB but mirrored here for icon/tone metadata.
import { Monitor, Plane, Sparkles, Building2, type LucideIcon } from "lucide-react";

export type TipCategorySlug = "kiosk" | "travel" | "ai" | "public";

export interface TipCategoryMeta {
  slug: TipCategorySlug;
  name: string;
  description: string;
  icon: LucideIcon;
  tone: "rose" | "amber" | "sky" | "emerald";
}

export const TIP_CATEGORIES: TipCategoryMeta[] = [
  {
    slug: "kiosk",
    name: "키오스크",
    description: "음식점·카페·무인점포",
    icon: Monitor,
    tone: "rose",
  },
  {
    slug: "travel",
    name: "여행·예매",
    description: "KTX·항공·숙소",
    icon: Plane,
    tone: "amber",
  },
  {
    slug: "ai",
    name: "AI·스마트폰",
    description: "ChatGPT·카톡·사진",
    icon: Sparkles,
    tone: "sky",
  },
  {
    slug: "public",
    name: "병원·관공서·금융",
    description: "예약·정부24·뱅킹",
    icon: Building2,
    tone: "emerald",
  },
];

export const TIP_CATEGORY_SLUGS = TIP_CATEGORIES.map((c) => c.slug);

export function getTipCategory(slug: string): TipCategoryMeta | undefined {
  return TIP_CATEGORIES.find((c) => c.slug === slug);
}

export interface TipStep {
  order: number;
  text: string;
  image_url?: string | null;
  tip?: string | null; // 추가 팁/주의사항
}

export interface TipListItem {
  id: string;
  category_slug: TipCategorySlug;
  title: string;
  summary: string;
  cover_image_url: string | null;
  tags: string[];
  pinned: boolean;
  views: number;
  like_count: number;
  step_count: number;
  published_at: string | null;
}

export interface TipDetail extends TipListItem {
  steps: TipStep[];
  is_published: boolean;
  created_at: string;
  updated_at: string;
}
