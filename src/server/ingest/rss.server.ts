// 경량 RSS/ATOM 파서 (Worker 호환, 외부 의존성 없음)

export type RssItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
};

function pick(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  let v = m[1].trim();
  // CDATA
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1].trim();
  return v;
}

function pickAttr(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i");
  return xml.match(re)?.[1];
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  // <item>...</item> (RSS 2.0)
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks) {
    const title = pick(block, "title");
    const link = pick(block, "link");
    if (!title || !link) continue;
    items.push({
      title: title.trim(),
      link: link.trim(),
      description: pick(block, "description"),
      pubDate: pick(block, "pubDate") ?? pick(block, "dc:date"),
      guid: pick(block, "guid") ?? link.trim(),
    });
  }
  if (items.length > 0) return items;

  // ATOM <entry>
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of entryBlocks) {
    const title = pick(block, "title");
    const link = pickAttr(block, "link", "href");
    if (!title || !link) continue;
    items.push({
      title: title.trim(),
      link,
      description: pick(block, "summary") ?? pick(block, "content"),
      pubDate: pick(block, "updated") ?? pick(block, "published"),
      guid: pick(block, "id") ?? link,
    });
  }
  return items;
}

export async function fetchRss(url: string, timeoutMs = 15000): Promise<RssItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "GyeotBot/1.0 (+https://together-care-app.lovable.app)" },
    });
    if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
    const xml = await res.text();
    return parseRss(xml);
  } finally {
    clearTimeout(t);
  }
}
