import { Logo } from "@/components/brand/Logo";

export function SeniorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--amber-soft)" }}>
      <header className="px-6 pt-6">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Logo size="md" />
          <span className="text-sm font-medium text-foreground/60">오늘</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
