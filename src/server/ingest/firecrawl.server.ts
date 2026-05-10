// Firecrawl 기반 수집기 — 깨진 RSS를 대체.
// - 자치구별 노인 프로그램/강좌를 검색해 local_resources에 저장
// - 서울시평생학습포털, 50플러스재단 등 카테고리별 사이트도 검색
//
// 비용 관리: 25개 구 × limit 5 = 1회 ≈ 125 search credits.
// 따라서 Firecrawl 작업은 주 1회만 cron으로 호출.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SEOUL_25, normalizeDistrict, extractTags } from "./normalize.server";

type RunResult = { inserted: number; updated: number; errors: number; error?: string };

type FirecrawlSearchResult = {
  url?: string;
  title?: string;
  description?: string;
};

async function logRun(source: string, district: string | null, status: string, r: RunResult) {
  await supabaseAdmin.from("ingest_runs").insert({
    source_name: source,
    district,
    status,
    inserted_count: r.inserted,
    updated_count: r.updated,
    error_count: r.errors,
    error_message: r.error ?? null,
    finished_at: new Date().toISOString(),
  });
}

async function firecrawlSearch(query: string, limit = 5): Promise<FirecrawlSearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit, lang: "ko", country: "kr" }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firecrawl HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: { web?: FirecrawlSearchResult[] } | FirecrawlSearchResult[];
    results?: FirecrawlSearchResult[];
  };
  const list =
    (json.data && "web" in json.data && json.data.web) ||
    (Array.isArray(json.data) && json.data) ||
    json.results ||
    [];
  return list as FirecrawlSearchResult[];
}

type Row = {
  source_name: string;
  source_external_id: string;
  name: string;
  resource_type: string;
  category: string;
  district: string;
  region_sido: string;
  region_sigungu: string;
  description: string | null;
  source_url: string | null;
  evidence_level: number;
  license: string;
  recommendation_tags: string[];
  is_active: boolean;
  last_fetched_at: string;
};

async function upsertRows(rows: Row[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const { data: existing } = await supabaseAdmin
      .from("local_resources")
      .select("id")
      .eq("source_name", row.source_name)
      .eq("source_external_id", row.source_external_id)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin.from("local_resources").update(row).eq("id", existing.id);
      updated++;
    } else {
      await supabaseAdmin.from("local_resources").insert(row);
      inserted++;
    }
  }
  return { inserted, updated };
}

// ---- 자치구별 시니어 프로그램 검색 ----
// 검색어 다양화: 복지관 프로그램, 평생학습, 일자리, 무료강좌 등
const DISTRICT_QUERIES = [
  { suffix: "노인복지관 프로그램", category: "복지관 프로그램", tags: ["복지", "프로그램"] },
  { suffix: "어르신 무료 강좌", category: "강좌", tags: ["교육", "강좌"] },
  { suffix: "시니어 일자리 모집", category: "일자리", tags: ["일자리"] },
];

export async function ingestFirecrawlDistrictPrograms(): Promise<RunResult> {
  let totalIns = 0;
  let totalUpd = 0;
  let totalErr = 0;
  let lastErr: string | undefined;

  for (const district of SEOUL_25) {
    for (const q of DISTRICT_QUERIES) {
      const query = `서울 ${district} ${q.suffix}`;
      try {
        const results = await firecrawlSearch(query, 4);
        const rows: Row[] = [];
        for (const r of results) {
          if (!r.title || !r.url) continue;
          // 제목/설명에서 다른 자치구가 들어 있으면 스킵 (오탐 줄이기)
          const detected = normalizeDistrict(r.title + " " + (r.description ?? ""));
          if (detected && detected !== district) continue;

          const text = `${r.title} ${r.description ?? ""}`;
          const tags = new Set(extractTags(text));
          q.tags.forEach((t) => tags.add(t));
          tags.add(district);

          rows.push({
            source_name: `Firecrawl:${district}:${q.category}`,
            source_external_id: r.url,
            name: r.title.slice(0, 200),
            resource_type: q.category,
            category: q.category,
            district,
            region_sido: "서울특별시",
            region_sigungu: district,
            description: (r.description ?? "").slice(0, 800) || null,
            source_url: r.url,
            evidence_level: 1, // 검색 기반이라 신뢰도 낮음
            license: "출처 표기",
            recommendation_tags: Array.from(tags),
            is_active: true,
            last_fetched_at: new Date().toISOString(),
          });
        }
        if (rows.length) {
          const r = await upsertRows(rows);
          totalIns += r.inserted;
          totalUpd += r.updated;
          await logRun(`Firecrawl:${district}:${q.category}`, district, "success", {
            ...r,
            errors: 0,
          });
        }
      } catch (e) {
        totalErr++;
        lastErr = String(e);
        await logRun(`Firecrawl:${district}:${q.category}`, district, "failed", {
          inserted: 0,
          updated: 0,
          errors: 1,
          error: String(e),
        });
        // Firecrawl 한도 오류면 더 진행하지 않음
        if (lastErr.includes("402") || lastErr.includes("429")) {
          return { inserted: totalIns, updated: totalUpd, errors: totalErr, error: lastErr };
        }
      }
    }
  }
  return { inserted: totalIns, updated: totalUpd, errors: totalErr, error: lastErr };
}

// ---- 시 단위 추가 소스: 50플러스재단, 평생학습포털 ----
const CITY_WIDE_QUERIES = [
  { suffix: "50플러스재단 강좌 site:50plus.or.kr", category: "강좌", source: "50플러스재단" },
  { suffix: "평생학습포털 어르신 강좌 site:sll.seoul.go.kr", category: "강좌", source: "서울평생학습포털" },
  { suffix: "어르신 일자리 site:senior50.seoul.go.kr OR site:job.seoul.go.kr", category: "일자리", source: "서울일자리" },
];

export async function ingestFirecrawlCityWide(): Promise<RunResult> {
  let totalIns = 0;
  let totalUpd = 0;
  let totalErr = 0;
  let lastErr: string | undefined;

  for (const q of CITY_WIDE_QUERIES) {
    try {
      const results = await firecrawlSearch(q.suffix, 10);
      const rows: Row[] = [];
      for (const r of results) {
        if (!r.title || !r.url) continue;
        const text = `${r.title} ${r.description ?? ""}`;
        const district = normalizeDistrict(text) ?? "전 지역";
        const tags = new Set(extractTags(text));
        tags.add(q.category);
        rows.push({
          source_name: q.source,
          source_external_id: r.url,
          name: r.title.slice(0, 200),
          resource_type: q.category,
          category: q.category,
          district,
          region_sido: "서울특별시",
          region_sigungu: district,
          description: (r.description ?? "").slice(0, 800) || null,
          source_url: r.url,
          evidence_level: 2,
          license: "출처 표기",
          recommendation_tags: Array.from(tags),
          is_active: true,
          last_fetched_at: new Date().toISOString(),
        });
      }
      if (rows.length) {
        const r = await upsertRows(rows);
        totalIns += r.inserted;
        totalUpd += r.updated;
        await logRun(q.source, null, "success", { ...r, errors: 0 });
      }
    } catch (e) {
      totalErr++;
      lastErr = String(e);
      await logRun(q.source, null, "failed", {
        inserted: 0,
        updated: 0,
        errors: 1,
        error: String(e),
      });
      if (lastErr.includes("402") || lastErr.includes("429")) {
        return { inserted: totalIns, updated: totalUpd, errors: totalErr, error: lastErr };
      }
    }
  }
  return { inserted: totalIns, updated: totalUpd, errors: totalErr, error: lastErr };
}
