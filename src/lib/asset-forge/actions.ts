/**
 * Asset Forge server functions.
 *
 *  - requestAsset:   admin 이 프롬프트 입력 → Tripo task 생성 + DB row.
 *  - pollAsset:      특정 asset 의 Tripo 상태 동기화 (admin/owner).
 *  - listAssets:     관리자 UI 용 목록 (status, kind 필터 옵션).
 *  - getActiveAsset: kind 별 active=true 인 최신 success 자산 (시나리오 클라가 사용).
 *  - setAssetActive: 같은 kind 의 다른 자산 active 토글.
 *
 * 관리자 권한 체크는 단순화: env 의 `ADMIN_USER_IDS` (콤마 구분) 에 포함된 user_id 만.
 * 더 정교한 RBAC 은 별도 작업.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createTextTo3DTask,
  getTaskStatus,
  mirrorToStorage,
} from "@/lib/asset-forge/tripo.server";
import { buildFinalPrompt } from "@/lib/asset-forge/prompts";

const ASSET_KINDS = [
  "kiosk",
  "coffee_machine",
  "excavator",
  "pet",
  "fish",
  "monster",
  "generic",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

function isAdmin(userId: string): boolean {
  const list = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) {
    // env 미설정 → dev 환경. 누구나 admin 권한 (위험! prod 전 반드시 설정)
    return true;
  }
  return list.includes(userId);
}

const RequestSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  prompt: z.string().min(3).max(500),
  scenario_id: z.string().optional(),
});

export const requestAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RequestSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    if (!isAdmin(userId)) return { ok: false as const, reason: "not_admin" as const };

    // 1) Style suffix 자동 부여 후 Tripo task 생성
    const finalPrompt = buildFinalPrompt(data.prompt);
    const tripo = await createTextTo3DTask(finalPrompt);
    if (!tripo.ok || !tripo.task_id) {
      return { ok: false as const, reason: tripo.error ?? "tripo_failed" };
    }

    // 2) DB row insert — final prompt 저장 (재현 가능하도록)
    const { data: row, error } = await supabaseAdmin
      .from("generated_assets" as never)
      .insert({
        kind: data.kind,
        scenario_id: data.scenario_id ?? null,
        prompt: finalPrompt,
        status: "running",
        tripo_task_id: tripo.task_id,
        created_by: userId,
      } as never)
      .select("*")
      .single();
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const, asset: row };
  });

const PollSchema = z.object({ asset_id: z.string().uuid() });

export const pollAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PollSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    if (!isAdmin(userId)) return { ok: false as const, reason: "not_admin" as const };
    return await pollAssetById(data.asset_id);
  });

/**
 * 핵심 polling 함수. 단일 자산을 Tripo 와 동기화.
 *  - status update
 *  - success 면 GLB/preview 를 Storage 미러
 */
export async function pollAssetById(assetId: string): Promise<
  | { ok: true; status: string; glb_url?: string }
  | { ok: false; reason: string }
> {
  const { data: assetRow } = await supabaseAdmin
    .from("generated_assets" as never)
    .select("*")
    .eq("id", assetId)
    .maybeSingle();
  if (!assetRow) return { ok: false, reason: "not_found" };
  const asset = assetRow as unknown as {
    id: string;
    tripo_task_id: string | null;
    status: string;
    kind: string;
  };
  if (!asset.tripo_task_id) return { ok: false, reason: "no_task_id" };
  if (asset.status === "success" || asset.status === "failed") {
    return { ok: true, status: asset.status };
  }

  const tripo = await getTaskStatus(asset.tripo_task_id);
  if (!tripo.ok) {
    return { ok: false, reason: tripo.error ?? "tripo_status_failed" };
  }

  // status mapping → DB 업데이트
  let nextStatus: string = tripo.status === "unknown" ? "running" : tripo.status;
  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (tripo.status === "success" && tripo.glb_url) {
    // Storage 로 미러
    const glbDest = `assets/${assetId}/model.glb`;
    const upload = await mirrorToStorage({
      url: tripo.glb_url,
      destPath: glbDest,
      contentType: "model/gltf-binary",
    });
    if (upload.ok && upload.publicUrl) {
      patch.glb_url = upload.publicUrl;
      patch.external_glb_url = tripo.glb_url;
      patch.file_size_bytes = upload.size ?? null;
    } else {
      // 미러 실패 — external URL 만이라도 보관
      patch.external_glb_url = tripo.glb_url;
      patch.error_message = `mirror_failed: ${upload.error}`;
    }
    if (tripo.preview_url) {
      const previewDest = `assets/${assetId}/preview.png`;
      const previewUp = await mirrorToStorage({
        url: tripo.preview_url,
        destPath: previewDest,
        contentType: "image/png",
      });
      if (previewUp.ok && previewUp.publicUrl) {
        patch.preview_url = previewUp.publicUrl;
        patch.external_preview_url = tripo.preview_url;
      }
    }
  } else if (tripo.status === "failed") {
    patch.error_message = "tripo_task_failed";
  }

  const { error: upErr } = await supabaseAdmin
    .from("generated_assets" as never)
    .update(patch as never)
    .eq("id", assetId);
  if (upErr) return { ok: false, reason: upErr.message };

  return { ok: true, status: nextStatus, glb_url: patch.glb_url as string | undefined };
}

const ListSchema = z.object({
  kind: z.enum(ASSET_KINDS).optional(),
  status: z.enum(["queued", "running", "success", "failed", "expired"]).optional(),
});

export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    if (!isAdmin(userId)) return { ok: false as const, reason: "not_admin" as const };
    let q = supabaseAdmin
      .from("generated_assets" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const, assets: rows ?? [] };
  });

const ActiveSchema = z.object({ kind: z.enum(ASSET_KINDS) });

export const getActiveAsset = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ActiveSchema.parse(d))
  .handler(async ({ data }) => {
    // 누구나 success + active 인 모델 조회 가능 (시나리오 클라가 사용)
    const { data: row } = await supabaseAdmin
      .from("generated_assets" as never)
      .select("id, kind, glb_url, preview_url, prompt")
      .eq("kind", data.kind)
      .eq("status", "success")
      .eq("active", true)
      .not("glb_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { ok: true as const, asset: row ?? null };
  });

const SetActiveSchema = z.object({ asset_id: z.string().uuid(), active: z.boolean() });

export const setAssetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SetActiveSchema.parse(d))
  .handler(async ({ context, data }) => {
    if (!isAdmin(context.userId)) return { ok: false as const, reason: "not_admin" as const };
    const { error } = await supabaseAdmin
      .from("generated_assets" as never)
      .update({ active: data.active, updated_at: new Date().toISOString() } as never)
      .eq("id", data.asset_id);
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const };
  });
