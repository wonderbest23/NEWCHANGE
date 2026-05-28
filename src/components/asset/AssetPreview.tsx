/**
 * AssetPreview — Tripo3D 가 생성한 자산을 시나리오에 표시하는 공용 컴포넌트.
 *
 * 두 가지 모드:
 *  - "image":  preview_url (Tripo 렌더 PNG) 를 <img> 로 표시. 가벼움.
 *  - "3d":     Three.js GLB live viewer (auto-rotate). 무거움.
 *
 * fallback:
 *  - 활성 자산이 없으면 props.fallback 을 렌더 (이모지 등).
 *
 * 사용:
 *   <AssetPreview kind="fish" mode="image" size={120} fallback={<span>🐟</span>} />
 *   <AssetPreview kind="pet" mode="3d" size={240} fallback={<span>🐶</span>} />
 */

import { lazy, Suspense, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { getActiveAsset } from "@/lib/asset-forge/actions";
import { cn } from "@/lib/utils";

const Asset3DViewer = lazy(() =>
  import("./Asset3DViewer").then((m) => ({ default: m.Asset3DViewer })),
);

interface Props {
  kind: string;
  mode?: "image" | "3d";
  /** 픽셀 정수 사이즈 (정사각형) */
  size?: number;
  fallback?: ReactNode;
  className?: string;
  /** 3D 모드에서 자동 회전 여부 (default true) */
  autoRotate?: boolean;
}

export function AssetPreview({
  kind,
  mode = "image",
  size = 120,
  fallback,
  className,
  autoRotate = true,
}: Props) {
  const q = useQuery({
    queryKey: ["asset-forge-active", kind],
    queryFn: async () =>
      getActiveAsset({
        data: { kind },
        headers: await authHeaders(),
      } as Parameters<typeof getActiveAsset>[0]),
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const data = query.state.data as unknown as
        | { ok?: boolean; asset?: { glb_url?: string | null; preview_url?: string | null } }
        | undefined;
      const hasAsset = !!(data?.asset?.glb_url ?? data?.asset?.preview_url);
      return hasAsset ? false : 20_000;
    },
  });

  const asset = (q.data as unknown as {
    ok?: boolean;
    asset?: { glb_url?: string | null; preview_url?: string | null };
  } | undefined)?.asset;

  const previewUrl = asset?.preview_url ?? null;
  const glbUrl = asset?.glb_url ?? null;
  const hasAny = !!(previewUrl || glbUrl);

  if (!hasAny) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ width: size, height: size }}
      >
        {fallback ?? <span className="text-foreground/40">—</span>}
      </div>
    );
  }

  if (mode === "3d" && glbUrl) {
    return (
      <div
        className={cn("relative overflow-hidden rounded-2xl bg-black/15", className)}
        style={{ width: size, height: size }}
      >
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          }
        >
          <Asset3DViewer glbUrl={glbUrl} size={size} autoRotate={autoRotate} />
        </Suspense>
      </div>
    );
  }

  // image mode (또는 3d 인데 glb 없고 preview 만 있을 때)
  if (previewUrl) {
    return (
      <img
        src={previewUrl}
        alt=""
        width={size}
        height={size}
        className={cn(
          "rounded-2xl object-contain shadow-lg",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div className={cn("flex items-center justify-center", className)} style={{ width: size, height: size }}>
      {fallback}
    </div>
  );
}
