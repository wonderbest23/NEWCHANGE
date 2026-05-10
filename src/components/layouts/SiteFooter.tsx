import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Mail, Phone } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { supabase } from "@/integrations/supabase/client";

export interface FooterConfig {
  tagline: string;
  email: string;
  phone: string;
  hours: string;
  companyName: string;
  ceo: string;
  bizNumber: string;
  mailOrderNumber: string;
  privacyOfficer: string;
  address: string;
  bizRegistrationUrl: string;
}

const DEFAULT_FOOTER: FooterConfig = {
  tagline: "가족이 함께 만드는 따뜻한 돌봄. 곁이 일상의 안부를 잇습니다.",
  email: "support@gyeot.kr",
  phone: "1588-0000",
  hours: "평일 09:00 – 18:00 (점심 12:00 – 13:00)",
  companyName: "㈜곁 (Gyeot Inc.)",
  ceo: "홍길동",
  bizNumber: "000-00-00000",
  mailOrderNumber: "제 0000-서울강남-00000호",
  privacyOfficer: "김보호",
  address: "서울특별시 강남구 테헤란로 123, 10층 (06234)",
  bizRegistrationUrl: "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=0000000000",
};

export function useSiteFooter() {
  return useQuery<FooterConfig>({
    queryKey: ["site-config", "footer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_config")
        .select("footer")
        .eq("id", "default")
        .single();
      if (error || !data) return DEFAULT_FOOTER;
      return { ...DEFAULT_FOOTER, ...(data.footer as Partial<FooterConfig>) };
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_FOOTER,
  });
}

export function SiteFooter() {
  const { data: f = DEFAULT_FOOTER } = useSiteFooter();

  return (
    <footer className="border-t border-border/40 bg-background/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        {/* 상단: 브랜드 + 지원 */}
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-3">
            <Logo size="sm" />
            <p className="max-w-sm text-sm text-muted-foreground">{f.tagline}</p>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/70">
              고객 지원
            </h3>
            <a
              href={`mailto:${f.email}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>{f.email}</span>
            </a>
            <a
              href={`tel:${f.phone}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Phone className="h-3.5 w-3.5" />
              <span>{f.phone}</span>
            </a>
            <p className="text-xs text-muted-foreground">{f.hours}</p>
          </div>
        </div>

        <div className="my-8 h-px bg-border/60" />

        {/* 사업자 정보 */}
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">{f.companyName}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>대표 : {f.ceo}</span>
            <span>사업자등록번호 : {f.bizNumber}</span>
            <span>통신판매업신고 : {f.mailOrderNumber}</span>
            <span>개인정보보호책임자 : {f.privacyOfficer}</span>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{f.address}</span>
          </div>
          <div className="flex flex-col gap-1 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Gyeot Inc. All rights reserved.</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Link to="/policy/terms" className="hover:text-foreground">
                이용약관
              </Link>
              <Link
                to="/policy/privacy"
                className="font-medium text-foreground/80 hover:text-foreground"
              >
                개인정보처리방침
              </Link>
              <a
                href={f.bizRegistrationUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground"
              >
                사업자정보확인
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
