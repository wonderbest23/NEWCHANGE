/**
 * ScenarioHub — 모든 게임/교육 모드 landing 화면.
 *
 * 카테고리(game/edu) 별 카드 그리드. 클릭 시 /scenario/$id 로 이동.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SCENARIOS, scenariosByCategory } from "@/lib/scenario/registry";
import { cn } from "@/lib/utils";

export function ScenarioHub() {
  const gameList = scenariosByCategory("game");
  const eduList = scenariosByCategory("edu");

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-8 px-4 py-8 pb-24">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">베타</p>
          <h1 className="font-display text-3xl text-foreground">AR 시나리오</h1>
          <p className="mt-1 text-sm text-foreground/65">게임과 교육 시나리오를 한곳에서.</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/home">
            <ArrowLeft className="mr-1 h-4 w-4" />홈
          </Link>
        </Button>
      </header>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          게임
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {gameList.map((s) => (
            <ScenarioCard key={s.id} s={s} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg">교육 실습</h2>
        <div className="grid grid-cols-2 gap-3">
          {eduList.map((s) => (
            <ScenarioCard key={s.id} s={s} />
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] text-foreground/50">
        총 {SCENARIOS.length}개 시나리오 · 일부는 베타입니다
      </p>
    </div>
  );
}

function ScenarioCard({ s }: { s: (typeof SCENARIOS)[number] }) {
  const Icon = s.icon;
  const locked = s.status === "locked";
  return (
    <Link
      to="/scenario/$scenarioId"
      params={{ scenarioId: s.id }}
      disabled={locked}
      className={cn("block", locked && "pointer-events-none opacity-50")}
    >
      <Card
        className={cn(
          "relative overflow-hidden border-border p-4 transition-transform active:scale-95",
          "bg-gradient-to-br",
          s.accent,
        )}
      >
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
          <Icon className="h-5 w-5" />
        </div>
        <p className="font-display text-base leading-tight">{s.title}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-foreground/70">{s.subtitle}</p>
        <p className="mt-2 text-[10px] leading-snug text-foreground/55">{s.blurb}</p>
        {s.status === "beta" && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-200/90 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
            BETA
          </span>
        )}
      </Card>
    </Link>
  );
}
