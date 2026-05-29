import type { FishAnimationPreset } from "@/components/game/fishing/fishAnimationPresets";

export type AssetManifestItem = {
  id: string;
  name: string;
  type: "fish" | "rod" | "effect";
  modelUrl: string;
  scale: number;
  animationPreset?: FishAnimationPreset;
  fallbackEmoji: string;
};

export const ASSET_MANIFEST: Record<string, AssetManifestItem> = {
  fish_golden_koi: {
    id: "fish_golden_koi",
    name: "황금 비단잉어",
    type: "fish",
    modelUrl: "/models/approved/fish_golden_koi.glb",
    scale: 0.9,
    animationPreset: "fish_flop_heavy",
    fallbackEmoji: "🐠",
  },
  fish_carp: {
    id: "fish_carp",
    name: "잉어",
    type: "fish",
    modelUrl: "/models/approved/fish_carp.glb",
    scale: 0.82,
    animationPreset: "fish_flop_default",
    fallbackEmoji: "🐟",
  },
  fish_bass: {
    id: "fish_bass",
    name: "배스",
    type: "fish",
    modelUrl: "/models/approved/fish_bass.glb",
    scale: 0.78,
    animationPreset: "fish_fast_escape",
    fallbackEmoji: "🐡",
  },
  fish_minnow: {
    id: "fish_minnow",
    name: "송사리",
    type: "fish",
    modelUrl: "/models/approved/fish_minnow.glb",
    scale: 0.64,
    animationPreset: "fish_float_magic",
    fallbackEmoji: "🐟",
  },
};
