import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";

export const Route = createFileRoute("/home")({
  beforeLoad: requireAuthBeforeLoad,
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <p className="text-lg text-foreground/70">안전하게 확인 중입니다.</p>
    </div>
  ),
  component: () => <Outlet />,
});
