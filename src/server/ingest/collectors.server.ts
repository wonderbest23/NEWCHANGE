// 서울 OpenAPI / data.go.kr / 자치구 RSS 수집기
// 모두 Worker(fetch) 호환. Puppeteer 미사용.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SEOUL_25, normalizeDistrict, stripHtml, parseDateLoose, extractTags, categorize, mapResourceType } from "./normalize.server";
import { fetchRss } from "./rss.server";
import { embedText } from "./embeddings.server";

type RunResult = { inserted: number; updated: number; errors: number; error?: string };

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw last;
}

async function logRun(source_name: string, district: string | null, status: string, r: RunResult) {
  await supabaseAdmin.from("ingest_runs").insert({
    source_name, district,
    status,
    inserted_count: r.inserted,
    updated_count: r.updated,
    error_count: r.errors,
    error_message: r.error ?? null,
    finished_at: new Date().toISOString(),
  });
}

type UpsertRow = {
  source_name: string;
  source_external_id: string;
  name: string;
  resource_type: string;
  category: string;
  district: string;
  region_sido: string;
  region_sigungu: string;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
  source_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  evidence_level: number;
  license: string;
  recommendation_tags: string[];
  is_active: boolean;
  last_fetched_at: string;
};

async function upsertResources(rows: UpsertRow[]): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  let inserted = 0, updated = 0;
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
      const { data: created } = await supabaseAdmin
        .from("local_resources")
        .insert(row)
        .select("id")
        .single();
      inserted++;
      // tags 정규화 테이블에도 기록
      if (created?.id && row.recommendation_tags.length) {
        await supabaseAdmin.from("content_tags").insert(
          row.recommendation_tags.map((tag) => ({ resource_id: created.id, tag }))
        );
      }
    }
  }
  return { inserted, updated };
}

// ---- (1) 서울시 노인복지시설 OpenAPI ----
export async function ingestSeoulWelfare(): Promise<RunResult> {
  const key = process.env.SEOUL_OPENAPI_KEY;
  if (!key) return { inserted: 0, updated: 0, errors: 1, error: "SEOUL_OPENAPI_KEY missing" };
  try {
    const url = `http://openapi.seoul.go.kr:8088/${key}/json/fcltOpenInfo_OWI/1/1000/`;
    const res = await withRetry(() => fetch(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    const root = (json["fcltOpenInfo_OWI"] ?? json["fcltopeninfo_owi"]) as { row?: Array<Record<string, string>> } | undefined;
    const items = root?.row ?? [];
    const rows: UpsertRow[] = [];
    for (const it of items) {
      const district = normalizeDistrict(it.SIGUN_NM ?? it.REFINE_LOTNO_ADDR ?? it.REFINE_ROADNM_ADDR);
      if (!district) continue;
      const name = it.FCLT_NM ?? "";
      if (!name) continue;
      const desc = `${it.FCLT_KIND_NM ?? ""} ${it.FCLT_KIND_DTL_NM ?? ""}`.trim();
      const text = `${name} ${desc}`;
      rows.push({
        source_name: "서울시 열린데이터광장",
        source_external_id: `fcltOpenInfo_OWI:${it.FCLT_CD ?? name}`,
        name,
        resource_type: mapResourceType(name, desc, "welfare_center"),
        category: categorize(name, "노인복지시설"),
        district,
        region_sido: "서울특별시",
        region_sigungu: district,
        address: it.REFINE_ROADNM_ADDR ?? it.REFINE_LOTNO_ADDR ?? null,
        phone: it.FCLT_TEL_NO ?? null,
        description: desc || null,
        source_url: null,
        latitude: it.REFINE_WGS84_LAT ? Number(it.REFINE_WGS84_LAT) : null,
        longitude: it.REFINE_WGS84_LOGT ? Number(it.REFINE_WGS84_LOGT) : null,
        evidence_level: 3,
        license: "공공누리 제1유형",
        recommendation_tags: extractTags(text),
        is_active: true,
        last_fetched_at: new Date().toISOString(),
      });
    }
    const r = await upsertResources(rows);
    const result: RunResult = { ...r, errors: 0 };
    await logRun("서울시 열린데이터광장", null, "success", result);
    return result;
  } catch (e) {
    const result: RunResult = { inserted: 0, updated: 0, errors: 1, error: String(e) };
    await logRun("서울시 열린데이터광장", null, "failed", result);
    return result;
  }
}

// ---- (2) 서울시 공공서비스예약 (행사) ----
export async function ingestSeoulReservations(): Promise<RunResult> {
  const key = process.env.SEOUL_OPENAPI_KEY;
  if (!key) return { inserted: 0, updated: 0, errors: 1, error: "SEOUL_OPENAPI_KEY missing" };
  try {
    const url = `http://openapi.seoul.go.kr:8088/${key}/json/ListPublicReservationCulture/1/500/`;
    const res = await withRetry(() => fetch(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    const root = (json["ListPublicReservationCulture"] ?? {}) as { row?: Array<Record<string, string>> };
    const items = root.row ?? [];
    const rows: UpsertRow[] = [];
    for (const it of items) {
      const district = normalizeDistrict(it.AREANM ?? it.PLACENM);
      if (!district) continue;
      const name = it.SVCNM ?? "";
      if (!name) continue;
      const desc = stripHtml(it.DTLCONT ?? it.SVCSTATNM ?? "");
      const text = `${name} ${desc}`;
      rows.push({
        source_name: "서울시 공공서비스예약",
        source_external_id: `rsv:${it.SVCID ?? name}`,
        name,
        resource_type: "event",
        category: "행사",
        district,
        region_sido: "서울특별시",
        region_sigungu: district,
        address: it.PLACENM ?? null,
        phone: it.TELNO ?? null,
        description: desc || null,
        source_url: it.SVCURL ?? null,
        start_date: parseDateLoose(it.SVCOPNBGNDT),
        end_date: parseDateLoose(it.SVCOPNENDDT),
        latitude: it.Y ? Number(it.Y) : null,
        longitude: it.X ? Number(it.X) : null,
        evidence_level: 3,
        license: "공공누리 제1유형",
        recommendation_tags: extractTags(text),
        is_active: true,
        last_fetched_at: new Date().toISOString(),
      });
    }
    const r = await upsertResources(rows);
    const result: RunResult = { ...r, errors: 0 };
    await logRun("서울시 공공서비스예약", null, "success", result);
    return result;
  } catch (e) {
    const result: RunResult = { inserted: 0, updated: 0, errors: 1, error: String(e) };
    await logRun("서울시 공공서비스예약", null, "failed", result);
    return result;
  }
}

// ---- (3) 자치구 RSS ----
export async function ingestDistrictRss(): Promise<RunResult> {
  const { data: sources } = await supabaseAdmin
    .from("rss_sources")
    .select("*")
    .eq("enabled", true);
  if (!sources?.length) return { inserted: 0, updated: 0, errors: 0 };

  let totalIns = 0, totalUpd = 0, totalErr = 0;
  for (const src of sources) {
    try {
      const items = await withRetry(() => fetchRss(src.url));
      const rows: UpsertRow[] = items.slice(0, 30).map((it) => {
        const desc = stripHtml(it.description);
        const text = `${it.title} ${desc}`;
        return {
          source_name: `${src.district} 공식 RSS`,
          source_external_id: it.guid ?? it.link,
          name: it.title,
          resource_type: mapResourceType(it.title, desc, "event"),
          category: src.category,
          district: src.district,
          region_sido: "서울특별시",
          region_sigungu: src.district,
          address: null,
          phone: null,
          description: desc.slice(0, 1000) || null,
          source_url: it.link,
          start_date: parseDateLoose(it.pubDate),
          end_date: null,
          latitude: null,
          longitude: null,
          evidence_level: 2,
          license: "공공누리 제1유형",
          recommendation_tags: extractTags(text),
          is_active: true,
          last_fetched_at: new Date().toISOString(),
        };
      });
      const r = await upsertResources(rows);
      totalIns += r.inserted; totalUpd += r.updated;
      await supabaseAdmin.from("rss_sources").update({ last_fetched_at: new Date().toISOString() }).eq("id", src.id);
      await logRun(`RSS:${src.district}`, src.district, "success", { ...r, errors: 0 });
    } catch (e) {
      totalErr++;
      await logRun(`RSS:${src.district}`, src.district, "failed", { inserted: 0, updated: 0, errors: 1, error: String(e) });
    }
  }
  return { inserted: totalIns, updated: totalUpd, errors: totalErr };
}

// ---- (3.5) 서울 일자리플러스센터: 시니어 친화 채용정보 ----
const SENIOR_JOB_KEYWORDS =
  /시니어|노인|어르신|경비|미화|청소|관리원|돌봄|요양|아파트|환경|주차|안내|방역|배식|급식|수위|순찰|택배\s?분류/;

function isSeniorFriendlyJob(it: Record<string, string>): boolean {
  const title = `${it.JO_SJ ?? ""} ${it.JOBCODE_NM ?? ""} ${it.DTY_CN ?? ""} ${it.BSNS_SUMRY_CN ?? ""}`;
  if (SENIOR_JOB_KEYWORDS.test(title)) return true;
  // 학력 관계없음(J00100) + 경력 무관(J01300) 조합도 시니어 진입 장벽이 낮은 자리
  const eduOk = (it.ACDMCR_CMMN_CODE_SE ?? "") === "J00100";
  const careerOk = (it.CAREER_CND_CMMN_CODE_SE ?? "") === "J01300";
  return eduOk && careerOk;
}

export async function ingestSeoulSeniorJobs(): Promise<RunResult> {
  const key = process.env.SEOUL_OPENAPI_KEY;
  if (!key) return { inserted: 0, updated: 0, errors: 1, error: "SEOUL_OPENAPI_KEY missing" };
  try {
    const rows: UpsertRow[] = [];
    // 페이지당 최대 1000건. 안전하게 2페이지(2000건)까지만 조회.
    for (let page = 0; page < 2; page++) {
      const start = page * 1000 + 1;
      const end = start + 999;
      const url = `http://openapi.seoul.go.kr:8088/${key}/json/GetJobInfo/${start}/${end}/`;
      const res = await withRetry(() => fetch(url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, unknown>;
      const root = (json["GetJobInfo"] ?? {}) as { row?: Array<Record<string, string>>; list_total_count?: number };
      const items = root.row ?? [];
      if (items.length === 0) break;
      for (const it of items) {
        if (!isSeniorFriendlyJob(it)) continue;
        const district = normalizeDistrict(it.WORK_PARAR_BASS_ADRES_CN ?? it.BASS_ADRES_CN);
        if (!district) continue;
        const name = it.JO_SJ || it.CMPNY_NM || it.JOBCODE_NM;
        if (!name) continue;
        const desc = stripHtml(
          [it.BSNS_SUMRY_CN, it.DTY_CN, it.GUI_LN, it.HOPE_WAGE && `급여: ${it.HOPE_WAGE}`, it.WORK_TIME_NM && `근무: ${it.WORK_TIME_NM}`]
            .filter(Boolean)
            .join("\n"),
        );
        const text = `${name} ${desc} ${it.JOBCODE_NM ?? ""}`;
        const tags = new Set(extractTags(text));
        tags.add("일자리");
        tags.add("시니어");
        rows.push({
          source_name: "서울일자리플러스센터",
          source_external_id: `GetJobInfo:${it.JO_REGIST_NO ?? it.JO_REQST_NO ?? name}`,
          name: String(name),
          resource_type: "job",
          category: "job",
          district,
          region_sido: "서울특별시",
          region_sigungu: district,
          address: it.WORK_PARAR_BASS_ADRES_CN ?? it.BASS_ADRES_CN ?? null,
          phone: it.MNGR_PHON_NO ?? null,
          description: desc || null,
          source_url: "https://job.seoul.go.kr",
          start_date: parseDateLoose(it.JO_REG_DT),
          end_date: parseDateLoose(it.RCEPT_CLOS_NM),
          latitude: null,
          longitude: null,
          evidence_level: 3,
          license: "공공누리 제1유형",
          recommendation_tags: Array.from(tags),
          is_active: true,
          last_fetched_at: new Date().toISOString(),
        });
      }
      if (items.length < 1000) break;
    }
    const r = await upsertResources(rows);
    const result: RunResult = { ...r, errors: 0 };
    await logRun("서울일자리플러스센터", null, "success", result);
    return result;
  } catch (e) {
    const result: RunResult = { inserted: 0, updated: 0, errors: 1, error: String(e) };
    await logRun("서울일자리플러스센터", null, "failed", result);
    return result;
  }
}

// ---- (4) 임베딩 백필 (배치) ----
export async function backfillEmbeddings(limit = 50): Promise<RunResult> {
  const { data: rows } = await supabaseAdmin
    .from("local_resources")
    .select("id, name, description, region_sigungu, recommendation_tags")
    .is("embedding", null)
    .limit(limit);
  if (!rows?.length) return { inserted: 0, updated: 0, errors: 0 };
  let updated = 0, errors = 0;
  for (const row of rows) {
    const text = `${row.name} ${row.description ?? ""} ${row.region_sigungu ?? ""} ${(row.recommendation_tags ?? []).join(" ")}`;
    const vec = await embedText(text);
    if (!vec) { errors++; continue; }
    const { error } = await supabaseAdmin
      .from("local_resources")
      .update({ embedding: vec as unknown as string })
      .eq("id", row.id);
    if (error) errors++; else updated++;
  }
  const result: RunResult = { inserted: 0, updated, errors };
  await logRun("embeddings", null, errors === 0 ? "success" : "partial", result);
  return result;
}

export { SEOUL_25 };
