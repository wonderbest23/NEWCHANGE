import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { scenarioById } from "@/lib/scenario/registry";

/** 레거시/오타 URL → registry id */
const SCENARIO_ID_ALIASES: Record<string, string> = {
  "walk-monster": "walk_monster",
};

export const Route = createFileRoute("/scenario/$scenarioId")({
  ssr: false,
  beforeLoad: async ({ params, location }) => {
    const canonicalId = SCENARIO_ID_ALIASES[params.scenarioId] ?? params.scenarioId;
    if (canonicalId !== params.scenarioId) {
      throw redirect({
        to: "/scenario/$scenarioId",
        params: { scenarioId: canonicalId },
      });
    }
    await requireAuthBeforeLoad({ location });
  },
  component: ScenarioRoute,
});

function ScenarioRoute() {
  const { scenarioId } = Route.useParams();
  const router = useRouter();
  const def = scenarioById(scenarioId);

  if (!def) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-foreground/80">존재하지 않는 시나리오예요.</p>
        <button
          onClick={() => router.navigate({ to: "/scenario" })}
          className="mt-4 text-sm underline"
        >
          돌아가기
        </button>
      </div>
    );
  }

  if (def.status === "locked") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-foreground/80">{def.title}은 아직 잠겨 있어요.</p>
      </div>
    );
  }

  const ScenarioComponent = lazy(def.loader);

  const handleExit = () => router.navigate({ to: "/scenario" });

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <ScenarioComponent
        scenarioId={def.id}
        onExit={handleExit}
        onScenarioComplete={() => {
          // 추후 보상 토스트/리다이렉트 추가 가능
          handleExit();
        }}
      />
    </Suspense>
  );
}
