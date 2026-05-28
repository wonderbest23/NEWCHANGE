import { createFileRoute } from "@tanstack/react-router";
import { ScenarioHub } from "@/components/scenarios/ScenarioHub";

export const Route = createFileRoute("/scenario/")({
  component: ScenarioHub,
});
