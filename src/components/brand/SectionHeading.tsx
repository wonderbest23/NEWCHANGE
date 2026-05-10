import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-rose-soft px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-primary",
        className,
      )}
    >
      <span className="h-1 w-1 rounded-full bg-primary" />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  singleLine = false,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "left" | "center";
  singleLine?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        singleLine ? "max-w-none" : "max-w-3xl",
        align === "center" && "mx-auto text-center items-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        className={cn(
          "font-display tracking-tight text-foreground",
          singleLine
            ? "whitespace-nowrap text-[clamp(1.1rem,4.6vw,3rem)] leading-[1.15] [word-break:keep-all]"
            : "text-3xl leading-[1.1] sm:text-4xl md:text-5xl text-balance",
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-base text-muted-foreground sm:text-lg text-pretty">{subtitle}</p>
      )}
    </div>
  );
}
