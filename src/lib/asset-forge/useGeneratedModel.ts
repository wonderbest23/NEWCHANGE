/**
 * useGeneratedModel — kind 별 active GLB 모델을 fetch + Three.js 로 로드.
 *
 * 사용:
 *   const { group, ready, error } = useGeneratedModel("fish");
 *   if (group) scene.add(group);
 *
 * 캐시:
 *  - kind 별로 같은 GLB URL 은 모듈 메모리에 1회만 로드.
 *  - 컴포넌트 unmount 시 group dispose 는 호출 측 책임.
 *
 * Fallback:
 *  - kind 에 success 자산이 없으면 group=null. 시나리오는 기존 placeholder 사용.
 */
import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useQuery } from "@tanstack/react-query";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { getActiveAsset } from "@/lib/asset-forge/actions";

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

async function loadGLB(url: string): Promise<THREE.Group> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(err),
      );
    });
    cache.set(url, p);
  }
  // 매 호출마다 scene 의 clone 을 반환 (같은 모델을 여러 자리에서 쓸 때 안전)
  const original = await p;
  return original.clone(true);
}

export function useGeneratedModel(kind: string) {
  const q = useQuery({
    queryKey: ["asset-forge-active", kind],
    queryFn: async () =>
      getActiveAsset({
        data: { kind },
        headers: await authHeaders(),
      } as Parameters<typeof getActiveAsset>[0]),
    staleTime: 30_000,
    retry: 1,
    // 시나리오 진입 시마다 다시 가져온다 (admin 에서 새로 만든 모델 즉시 반영).
    refetchOnMount: "always",
    // 모델이 아직 없으면 20초마다 polling — admin 에서 success 되면 자동 적용.
    refetchInterval: (query) => {
      const data = query.state.data as unknown as { ok?: boolean; asset?: { glb_url?: string | null } } | undefined;
      const hasModel = !!data?.asset?.glb_url;
      return hasModel ? false : 20_000;
    },
  });

  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asset = (q.data as unknown as { ok: boolean; asset?: { glb_url?: string | null } } | undefined)
    ?.asset;
  const glbUrl = asset?.glb_url ?? null;

  useEffect(() => {
    if (!glbUrl) {
      setGroup(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadGLB(glbUrl)
      .then((g) => {
        if (cancelled) return;
        setGroup(g);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  return {
    group,
    ready: !!group,
    loading,
    error,
    glbUrl,
  };
}
