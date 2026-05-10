import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scoreResource } from "@/server/ingest/scoring";

const SEOUL_GUS = [
  "강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구",
  "동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구",
  "영등포구","용산구","은평구","종로구","중구","중랑구",
] as const;

const ListInput = z.object({
  region: z.enum(SEOUL_GUS).optional(),
  resourceType: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).max(10).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const SEOUL_DISTRICTS = SEOUL_GUS;

export const listLocalResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("local_resources")
      .select(
        "id, name, resource_type, category, district, region_sigungu, address, phone, opening_hours, cost, application_method, description, source_name, source_url, recommendation_tags, start_date, end_date, latitude, longitude, evidence_level, license"
      )
      .eq("is_active", true);

    if (data.region) q = q.eq("district", data.region);
    if (data.category) q = q.eq("category", data.category);
    if (data.resourceType) q = q.eq("resource_type", data.resourceType);
    if (data.tags?.length) q = q.overlaps("recommendation_tags", data.tags);

    const { data: rows, error } = await q
      .order("district")
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("name")
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const RecommendInput = z.object({
  region: z.enum(SEOUL_GUS).optional(),
  interestTags: z.array(z.string()).max(20).optional(),
  limit: z.number().int().min(1).max(20).default(8),
});

export const recommendLocalResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RecommendInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 사용자 프로필에서 자치구 가져오기
    const { data: profile } = await supabase
      .from("profiles")
      .select("region_sigungu")
      .eq("id", userId)
      .maybeSingle();
    const userDistrict = data.region ?? profile?.region_sigungu ?? null;

    // 최근 health_checkin 태그 → 관심사 추정
    let interestTags = data.interestTags ?? [];
    if (interestTags.length === 0) {
      const { data: recent } = await supabase
        .from("health_checkins")
        .select("id, condition_level, loneliness_detected, mood_status")
        .eq("senior_user_id", userId)
        .order("checkin_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const tags = new Set<string>();
      if (recent?.loneliness_detected) { tags.add("심리"); tags.add("사회참여"); }
      if (recent?.condition_level === "caution" || recent?.condition_level === "urgent") tags.add("건강");
      if (recent?.mood_status === "low") { tags.add("심리"); tags.add("문화"); }
      interestTags = Array.from(tags);
    }

    let q = supabase
      .from("local_resources")
      .select(
        "id, name, resource_type, category, district, region_sigungu, address, phone, opening_hours, description, source_name, source_url, recommendation_tags, start_date, end_date, latitude, longitude, evidence_level, license"
      )
      .eq("is_active", true);
    if (userDistrict) q = q.eq("district", userDistrict);
    const { data: pool } = await q.limit(100);

    const today = new Date();
    const scored = (pool ?? [])
      .map((r) => ({
        ...r,
        _score: scoreResource({
          resource: {
            district: r.district,
            start_date: r.start_date,
            end_date: r.end_date,
            latitude: r.latitude,
            longitude: r.longitude,
            tags: r.recommendation_tags ?? [],
          },
          user: { district: userDistrict, interestTags },
          today,
        }),
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, data.limit);

    return { items: scored, district: userDistrict, interestTags };
  });

const ToggleInput = z.object({ resourceId: z.string().uuid() });

export const toggleSavedResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ToggleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("saved_resources")
      .select("id")
      .eq("user_id", userId)
      .eq("resource_id", data.resourceId)
      .maybeSingle();
    if (existing) {
      await supabase.from("saved_resources").delete().eq("id", existing.id);
      return { saved: false };
    }
    await supabase.from("saved_resources").insert({ user_id: userId, resource_id: data.resourceId });
    return { saved: true };
  });
