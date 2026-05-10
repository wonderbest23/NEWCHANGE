import { createFileRoute, redirect } from "@tanstack/react-router";

// /partner 단독 진입 시 기본 화면(파트너 작업)으로 이동
export const Route = createFileRoute("/partner/")({
  beforeLoad: () => {
    throw redirect({ to: "/partner/tasks" });
  },
  component: () => null,
});
