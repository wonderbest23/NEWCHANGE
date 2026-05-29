import type { FishKey } from "@/lib/game/useFishingSession";
import { ASSET_MANIFEST, type AssetManifestItem } from "./asset-manifest";

const FISH_ASSET_BY_KEY: Record<FishKey, string> = {
  goldfish: "fish_golden_koi",
  carp: "fish_carp",
  bass: "fish_bass",
  minnow: "fish_minnow",
};

export function fishAssetForKey(fishKey: FishKey | null | undefined): AssetManifestItem | null {
  if (!fishKey) return null;
  const id = FISH_ASSET_BY_KEY[fishKey];
  return ASSET_MANIFEST[id] ?? null;
}

/** manifest에 rod 항목이 있으면 URL (없으면 null → asset-forge generic) */
export function rodAssetFromManifest(): AssetManifestItem | null {
  return Object.values(ASSET_MANIFEST).find((a) => a.type === "rod") ?? null;
}

export function resolveRodGlbUrl(generatedUrl: string | null | undefined): string | null {
  return generatedUrl ?? rodAssetFromManifest()?.modelUrl ?? null;
}
