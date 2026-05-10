import { createFileRoute, Link } from "@tanstack/react-router";
import { POLICY_DOCS } from "@/lib/policy/policy-docs";
import { FileText, Download } from "lucide-react";

export const Route = createFileRoute("/policy/")({
  head: () => ({
    meta: [
      { title: "운영 정책 문서 — 곁(Gyeot) Care Call" },
      {
        name: "description",
        content:
          "곁 Care Call 서비스의 개인정보 처리방침, 음성 동의, 응급 정책 등 운영 정책 문서 모음(초안).",
      },
      { property: "og:title", content: "운영 정책 문서 — 곁(Gyeot) Care Call" },
      {
        property: "og:description",
        content:
          "곁 Care Call 서비스의 운영/법적 정책 문서 초안 모음. 외부 법무 검토용 배포본.",
      },
    ],
  }),
  component: PolicyIndexPage,
});

function PolicyIndexPage() {
  // Skip the README from the card grid (it's used as the intro instead)
  const readme = POLICY_DOCS.find((d) => d.slug.startsWith("00"));
  const items = POLICY_DOCS.filter((d) => !d.slug.startsWith("00"));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10 border-b border-border pb-8">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            곁 (Gyeot) · Care Call
          </p>
          <h1 className="mt-2 text-4xl font-bold text-foreground">
            운영 정책 문서
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            서비스 운영·법적 정책 초안 모음입니다. 모든 문서는{" "}
            <strong className="text-foreground">초안(draft)</strong> 상태이며,
            본문 수치(보존 기간, SLA 시간 등)와 스크립트 문구는 모두 후보값입니다.
          </p>
          {readme ? (
            <div className="mt-4">
              <Link
                to="/policy/$slug"
                params={{ slug: readme.slug }}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <FileText className="h-4 w-4" />
                전체 개요 및 사전 검증 항목 보기
              </Link>
            </div>
          ) : null}
        </header>

        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((doc) => (
            <li key={doc.slug}>
              <Link
                to="/policy/$slug"
                params={{ slug: doc.slug }}
                className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                    {doc.number}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground group-hover:text-primary">
                      {doc.title}
                    </h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {doc.filename}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <footer className="mt-12 rounded-lg border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <Download className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              각 문서 상세 페이지에서{" "}
              <strong className="text-foreground">PDF로 저장</strong> 버튼을
              눌러 브라우저 인쇄 → PDF로 저장하면 배포용 PDF가 생성됩니다.
              (인쇄 전용 스타일이 적용되어 헤더·버튼은 자동으로 숨겨집니다.)
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
}
