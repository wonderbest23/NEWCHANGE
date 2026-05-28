import { createFileRoute } from "@tanstack/react-router";
import { WalkMonsterBeta } from "@/components/game/WalkMonsterBeta";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { checkBetaGameAccess } from "@/lib/game/beta-gate";

type Search = {
  key?: string;
};

export const Route = createFileRoute("/beta/walk-monster")({
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "산책 몬스터 베타 — 곁" }],
  }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    key: typeof search.key === "string" ? search.key : undefined,
  }),
  beforeLoad: async ({ location }) => {
    await requireAuthBeforeLoad({ location });
  },
  component: BetaWalkMonsterPage,
});

function BetaWalkMonsterPage() {
  const { key } = Route.useSearch();
  const gate = checkBetaGameAccess(key);
  if (!gate.ok) {
    return <WalkMonsterBeta gateError={gate.reason} />;
  }
  return <WalkMonsterBeta />;
}
