import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Printer } from "lucide-react";
import { POLICY_DOCS, getPolicyDoc } from "@/lib/policy/policy-docs";

export const Route = createFileRoute("/policy/$slug")({
  loader: ({ params }) => {
    const doc = getPolicyDoc(params.slug);
    if (!doc) throw notFound();
    return { doc };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.doc.title ?? "운영 정책 문서";
    return {
      meta: [
        { title: `${title} — 곁(Gyeot) Care Call` },
        {
          name: "description",
          content: `${title} (초안). 곁 Care Call 운영/법적 정책 문서.`,
        },
        { property: "og:title", content: `${title} — 곁(Gyeot) Care Call` },
        {
          property: "og:description",
          content: `${title} (초안). 곁 Care Call 운영/법적 정책 문서.`,
        },
      ],
    };
  },
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          문서를 불러오지 못했어요
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          다시 시도
        </button>
      </div>
    );
  },
  notFoundComponent: () => {
    const { slug } = Route.useParams();
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          정책 문서를 찾을 수 없어요
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          요청한 슬러그: <code className="rounded bg-muted px-1.5 py-0.5">{slug}</code>
        </p>
        <Link
          to="/policy"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />
          정책 문서 목록
        </Link>
      </div>
    );
  },
  component: PolicyDetailPage,
});

function PolicyDetailPage() {
  const { doc } = Route.useLoaderData();

  // Build prev/next from the same ordered list used by the index
  const idx = POLICY_DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = idx > 0 ? POLICY_DOCS[idx - 1] : undefined;
  const next = idx >= 0 && idx < POLICY_DOCS.length - 1 ? POLICY_DOCS[idx + 1] : undefined;

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar (hidden on print) */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <Link
            to="/policy"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            정책 목록
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" />
            PDF로 저장 / 인쇄
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
        {/* Print-only header band */}
        <div className="print-only mb-6 border-b border-border pb-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            곁 (Gyeot) · Care Call · 운영 정책 문서
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            파일: {doc.filename} · 상태: 초안(draft)
          </p>
        </div>

        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
        </div>

        {/* Footer nav (hidden on print) */}
        <nav className="no-print mt-12 flex items-center justify-between border-t border-border pt-6 text-sm">
          <div>
            {prev ? (
              <Link
                to="/policy/$slug"
                params={{ slug: prev.slug }}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                {prev.title}
              </Link>
            ) : null}
          </div>
          <div>
            {next ? (
              <Link
                to="/policy/$slug"
                params={{ slug: next.slug }}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                {next.title}
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Link>
            ) : null}
          </div>
        </nav>

        {/* Print-only footer */}
        <div className="print-only mt-8 border-t border-border pt-3 text-xs text-muted-foreground">
          본 문서는 초안이며, 시행 전 법무 검토가 필요합니다. ©{" "}
          {new Date().getFullYear()} 곁(Gyeot)
        </div>
      </article>
    </div>
  );
}
