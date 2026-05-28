/**
 * Tripo3D API 래퍼 + Supabase Storage 미러링.
 *
 * 환경:
 *   TRIPO3D_API_KEY  (wrangler secret put TRIPO3D_API_KEY)
 *   TRIPO3D_BASE_URL (선택. 기본: https://api.tripo3d.ai/v2/openapi)
 *
 * 본 모듈은 server-only. 절대 클라이언트 번들에 들어가지 않도록 *.server.ts
 * 패턴으로 마킹.
 *
 * Tripo API 변경 가능성을 고려해 응답 파싱은 방어적으로:
 *   - 알려진 필드 (output.pbr_model, output.rendered_image) 우선
 *   - 미일치 시 generic walk 로 GLB URL 후보 탐색
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_BASE = "https://api.tripo3d.ai/v2/openapi";
const STORAGE_BUCKET = "asset-forge";

function apiBase(): string {
  return (process.env.TRIPO3D_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

function apiKey(): string {
  const k = process.env.TRIPO3D_API_KEY;
  if (!k) throw new Error("TRIPO3D_API_KEY not configured");
  return k;
}

async function tripoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

export interface TripoCreateResult {
  ok: boolean;
  task_id?: string;
  error?: string;
}

/**
 * Text → 3D 작업 생성.
 *
 * Tripo 요청 본문 형식 (v2 openapi):
 *   { type: "text_to_model", prompt: string, model_version?: string }
 * 응답: { code: 0, data: { task_id: string } }
 */
export async function createTextTo3DTask(prompt: string): Promise<TripoCreateResult> {
  try {
    const res = await tripoFetch("/task", {
      method: "POST",
      body: JSON.stringify({
        type: "text_to_model",
        prompt,
        // 기본 모델 버전 (Tripo 공식 문서가 새 버전 내면 env override 가능)
        model_version: process.env.TRIPO3D_MODEL_VERSION || undefined,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `tripo_${res.status}: ${text.slice(0, 200)}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: `bad_json: ${text.slice(0, 200)}` };
    }
    const data = parsed as { data?: { task_id?: string } } | undefined;
    const task_id = data?.data?.task_id;
    if (!task_id) {
      return { ok: false, error: `no_task_id: ${text.slice(0, 200)}` };
    }
    return { ok: true, task_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface TripoTaskStatus {
  ok: boolean;
  status: "queued" | "running" | "success" | "failed" | "unknown";
  progress?: number; // 0..1
  glb_url?: string;
  preview_url?: string;
  raw?: unknown;
  error?: string;
}

/**
 * 작업 상태 조회. Tripo 응답 다양성에 방어적.
 *
 *   data.status 가 "running"/"success"/"failed"/"queued" 등.
 *   data.output.pbr_model 또는 data.output.model_url 에 GLB URL.
 *   data.output.rendered_image 에 프리뷰.
 */
export async function getTaskStatus(taskId: string): Promise<TripoTaskStatus> {
  try {
    const res = await tripoFetch(`/task/${encodeURIComponent(taskId)}`);
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: "unknown",
        error: `tripo_${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const parsed = JSON.parse(text) as {
      data?: {
        status?: string;
        progress?: number;
        output?: Record<string, unknown>;
      };
    };
    const d = parsed.data ?? {};
    const rawStatus = (d.status ?? "").toLowerCase();

    const mappedStatus: TripoTaskStatus["status"] =
      rawStatus === "success" || rawStatus === "succeeded" || rawStatus === "completed"
        ? "success"
        : rawStatus === "failed" || rawStatus === "error" || rawStatus === "cancelled"
          ? "failed"
          : rawStatus === "queued" || rawStatus === "pending"
            ? "queued"
            : rawStatus === "running" || rawStatus === "processing"
              ? "running"
              : "unknown";

    const out = (d.output ?? {}) as Record<string, unknown>;
    const glbCandidate =
      (out.pbr_model as string | undefined) ??
      (out.model_url as string | undefined) ??
      (out.model as string | undefined) ??
      undefined;
    const previewCandidate =
      (out.rendered_image as string | undefined) ??
      (out.preview_url as string | undefined) ??
      undefined;

    return {
      ok: true,
      status: mappedStatus,
      progress: typeof d.progress === "number" ? d.progress : undefined,
      glb_url: glbCandidate,
      preview_url: previewCandidate,
      raw: d,
    };
  } catch (err) {
    return {
      ok: false,
      status: "unknown",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 외부 URL 의 GLB/이미지를 받아 Supabase Storage `asset-forge` 버킷에 업로드.
 * 결과: 공개 URL.
 *
 * Storage 버킷은 Dashboard 에서 미리 public 으로 만들어둘 것 (마이그레이션 코멘트 참고).
 */
export async function mirrorToStorage(opts: {
  url: string;
  destPath: string; // e.g. "assets/<asset_id>/model.glb"
  contentType: string;
}): Promise<{ ok: boolean; publicUrl?: string; size?: number; error?: string }> {
  try {
    const res = await fetch(opts.url);
    if (!res.ok) return { ok: false, error: `download_${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(opts.destPath, buf, {
        contentType: opts.contentType,
        upsert: true,
      });
    if (upErr) return { ok: false, error: upErr.message };
    const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(opts.destPath);
    return { ok: true, publicUrl: data.publicUrl, size: buf.byteLength };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
