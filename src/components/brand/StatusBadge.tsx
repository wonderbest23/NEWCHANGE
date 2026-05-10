import { cn } from "@/lib/utils";

type Tone = "rose" | "sage" | "amber" | "muted" | "ink";

const tones: Record<Tone, string> = {
  rose: "bg-rose-soft text-primary",
  sage: "bg-sage-soft text-foreground",
  amber: "bg-amber-soft text-foreground",
  muted: "bg-muted text-muted-foreground",
  ink: "bg-foreground text-background",
};

export function StatusBadge({
  tone = "muted",
  children,
  className,
  dot = false,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
