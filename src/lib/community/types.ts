// Shared types for community feature (client+server safe)
import {
  Briefcase, Scale, HeartHandshake, Newspaper, Building2, MessageCircle,
  type LucideIcon,
} from "lucide-react";

export type CategorySlug = "free" | "jobs" | "legal" | "welfare" | "news" | "agency";

export type Category = {
  slug: CategorySlug;
  name: string;
  description: string;
  icon: LucideIcon;
  tone: "rose" | "sage" | "amber";
  count: number;
};

const ICONS: Record<CategorySlug, LucideIcon> = {
  free: MessageCircle,
  jobs: Briefcase,
  legal: Scale,
  welfare: HeartHandshake,
  news: Newspaper,
  agency: Building2,
};

const TONES: Record<CategorySlug, "rose" | "sage" | "amber"> = {
  free: "rose", jobs: "amber", legal: "sage", welfare: "rose", news: "sage", agency: "amber",
};

const NAMES: Record<CategorySlug, { name: string; description: string }> = {
  free:    { name: "자유게시판", description: "일상·취미·소소한 이야기" },
  jobs:    { name: "구인구직",   description: "시니어 일자리·단기 알바" },
  legal:   { name: "법률자문",   description: "전문가 답변, 상담 후기" },
  welfare: { name: "복지혜택",   description: "정부·지자체 지원, 신청 후기" },
  news:    { name: "새로운소식", description: "지역 뉴스·생활 정보" },
  agency:  { name: "대행업체",   description: "신뢰할 만한 업체 추천·후기" },
};

export const ALL_SLUGS: CategorySlug[] = ["free", "jobs", "legal", "welfare", "news", "agency"];

export const CATEGORY_META: Category[] = ALL_SLUGS.map((slug) => ({
  slug,
  ...NAMES[slug],
  icon: ICONS[slug],
  tone: TONES[slug],
  count: 0,
}));

export const getCategoryMeta = (slug: string): Category | undefined =>
  CATEGORY_META.find((c) => c.slug === slug);

export type Author = {
  id: string;
  handle: string;
  age: number;
  sido: string;
  sigungu: string;
  verified: boolean;
};

export type Post = {
  id: string;
  category: CategorySlug;
  title: string;
  body: string;
  author: Author;
  createdAgo: string;
  views: number;
  likes: number;
  comments: number;
  pinned?: boolean;
  region_sido?: string | null;
  region_sigungu?: string | null;
  ai_generated?: boolean;
};

export type Comment = {
  id: string;
  postId: string;
  body: string;
  author: Author;
  createdAgo: string;
  likes: number;
  ai_generated?: boolean;
};

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return "어제";
  if (d < 7) return `${d}일 전`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}주 전`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}달 전`;
  return `${Math.floor(d / 365)}년 전`;
}

// Re-exports for backwards-compat with mock import sites.
export const CATEGORIES = CATEGORY_META;
export const getCategory = getCategoryMeta;
