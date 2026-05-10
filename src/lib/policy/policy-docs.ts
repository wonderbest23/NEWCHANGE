// Build-time import of all policy markdown files. Vite's import.meta.glob
// inlines them as strings so the routes work without filesystem access at runtime.
const rawDocs = import.meta.glob("../../../docs/policy/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type PolicyDoc = {
  slug: string;        // e.g. "01-privacy-policy"
  number: string;      // "01"
  filename: string;    // "01-privacy-policy.md"
  title: string;       // first H1 from markdown, fallback to slug
  content: string;     // raw markdown
};

function extractTitle(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : fallback;
}

function buildDocs(): PolicyDoc[] {
  const docs: PolicyDoc[] = [];
  for (const [path, content] of Object.entries(rawDocs)) {
    const filename = path.split("/").pop()!;
    const slug = filename.replace(/\.md$/, "");
    const numberMatch = slug.match(/^(\d+)/);
    docs.push({
      slug,
      number: numberMatch ? numberMatch[1] : "",
      filename,
      title: extractTitle(content, slug),
      content,
    });
  }
  // Sort by leading number, README first
  return docs.sort((a, b) => {
    if (a.slug.startsWith("00")) return -1;
    if (b.slug.startsWith("00")) return 1;
    return a.slug.localeCompare(b.slug);
  });
}

export const POLICY_DOCS: PolicyDoc[] = buildDocs();

export function getPolicyDoc(slug: string): PolicyDoc | undefined {
  return POLICY_DOCS.find((d) => d.slug === slug);
}
