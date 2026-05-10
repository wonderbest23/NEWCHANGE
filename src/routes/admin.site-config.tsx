import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { useSiteFooter, type FooterConfig } from "@/components/layouts/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/site-config")({
  head: () => ({ meta: [{ title: "사이트 설정 — 곁 관리자" }] }),
  component: SiteConfigPage,
});

type FieldDef = {
  key: keyof FooterConfig;
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

const FIELDS: FieldDef[] = [
  { key: "tagline", label: "브랜드 슬로건", multiline: true },
  { key: "email", label: "고객 지원 이메일", placeholder: "support@example.com" },
  { key: "phone", label: "고객 지원 전화번호", placeholder: "1588-0000" },
  { key: "hours", label: "운영 시간", placeholder: "평일 09:00 – 18:00" },
  { key: "companyName", label: "회사명", placeholder: "㈜곁 (Gyeot Inc.)" },
  { key: "ceo", label: "대표자명" },
  { key: "bizNumber", label: "사업자등록번호", placeholder: "000-00-00000" },
  { key: "mailOrderNumber", label: "통신판매업신고번호" },
  { key: "privacyOfficer", label: "개인정보보호책임자" },
  { key: "address", label: "사업장 주소", multiline: true },
  { key: "bizRegistrationUrl", label: "사업자정보확인 URL" },
];

function SiteConfigPage() {
  const { data: footer, isLoading } = useSiteFooter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FooterConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (footer && !form) setForm(footer);
  }, [footer, form]);

  const handleChange = (key: keyof FooterConfig, value: string) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_config")
        .upsert({ id: "default", footer: form, updated_at: new Date().toISOString() });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["site-config", "footer"] });
      toast.success("푸터 설정이 저장되었습니다.");
    } catch (e) {
      toast.error("저장 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (footer) setForm({ ...footer });
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">사이트 설정</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            모든 페이지 하단 푸터에 표시되는 정보를 관리합니다.
          </p>
        </div>

        {isLoading || !form ? (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border/60 bg-surface/40 p-6">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                푸터 정보
              </h2>
              <div className="space-y-5">
                {FIELDS.map(({ key, label, placeholder, multiline }) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={key} className="text-sm font-medium">
                      {label}
                    </Label>
                    {multiline ? (
                      <Textarea
                        id={key}
                        value={form[key]}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={placeholder}
                        rows={2}
                        className="resize-none rounded-xl text-sm"
                      />
                    ) : (
                      <Input
                        id={key}
                        value={form[key]}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={placeholder}
                        className="rounded-xl text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 미리보기 */}
            <div className="rounded-2xl border border-border/60 bg-surface/40 p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                미리보기
              </h2>
              <div className="rounded-xl border border-border/40 bg-background p-4 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">{form.companyName}</p>
                <p>{form.tagline}</p>
                <p>📧 {form.email} · 📞 {form.phone}</p>
                <p>🕐 {form.hours}</p>
                <p>대표: {form.ceo} | 사업자: {form.bizNumber}</p>
                <p>📍 {form.address}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "저장 중..." : "저장"}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={saving}>
                초기화
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
