// Admin CRUD + Firecrawl-powered ingestion for the agencies directory.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("관리자 권한이 필요합니다.");
}

const AGENCY_CATEGORIES = [
  "moving",
  "nursing_hospital",
  "hospital",
  "caregiver",
  "cleaning",
  "funeral",
  "hearing_aid",
  "legal_tax",
] as const;

const AgencyInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  category: z.enum(AGENCY_CATEGORIES),
  sigungu: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().url().nullable().optional().or(z.literal("")),
  hours: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  verified: z.boolean().optional(),
  source_name: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
});

export const upsertAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AgencyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      ...data,
      website: data.website || null,
      tags: data.tags ?? [],
    };
    const { data: row, error } = data.id
      ? await supabaseAdmin.from("agencies").update(payload).eq("id", data.id).select().maybeSingle()
      : await supabaseAdmin.from("agencies").insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { agency: row };
  });

export const deleteAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("agencies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- Firecrawl ingestion -----
const SearchInput = z.object({
  category: z.enum(AGENCY_CATEGORIES),
  sigungu: z.string().min(1),
  limit: z.number().min(1).max(10).default(5),
});

const CATEGORY_LABEL: Record<(typeof AGENCY_CATEGORIES)[number], string> = {
  moving: "포장이사 업체",
  nursing_hospital: "요양병원",
  hospital: "종합병원",
  caregiver: "간병인 업체",
  cleaning: "청소업체",
  funeral: "장례식장 상조",
  hearing_aid: "보청기 센터",
  legal_tax: "법무사 세무사",
};

type FirecrawlSearchResult = {
  url?: string;
  title?: string;
  description?: string;
};

export const firecrawlSearchAgencies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY가 설정되지 않았습니다.");

    const query = `서울 ${data.sigungu} ${CATEGORY_LABEL[data.category]}`;
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: data.limit, lang: "ko", country: "kr" }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Firecrawl search failed [${res.status}]: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    // v2 response: { success, data: { web: [...] } } or { success, data: [...] }
    const list: FirecrawlSearchResult[] =
      json?.data?.web ?? json?.data ?? json?.results ?? [];
    return {
      query,
      results: list.map((r) => ({
        url: r.url ?? "",
        title: r.title ?? "",
        description: r.description ?? "",
      })),
    };
  });

const ImportInput = z.object({
  category: z.enum(AGENCY_CATEGORIES),
  sigungu: z.string().min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        website: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
      }),
    )
    .min(1)
    .max(20),
});

export const importAgencies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const rows = data.items.map((it) => ({
      name: it.name.slice(0, 200),
      category: data.category,
      sigungu: data.sigungu,
      website: it.website || null,
      description: it.description?.slice(0, 500) || null,
      verified: false,
      source_name: "Firecrawl",
      source_url: it.website || null,
      tags: [] as string[],
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("agencies")
      .insert(rows)
      .select("id, name");
    if (error) throw new Error(error.message);
    return { inserted: inserted?.length ?? 0 };
  });
