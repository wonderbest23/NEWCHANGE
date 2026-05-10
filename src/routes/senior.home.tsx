import { createFileRoute, redirect } from "@tanstack/react-router";

// 신규 시니어 홈은 /home 으로 통합되었습니다. 기존 링크는 자동 이동.
export const Route = createFileRoute("/senior/home")({
  beforeLoad: () => {
    throw redirect({ to: "/home" });
  },
  component: () => null,
});
