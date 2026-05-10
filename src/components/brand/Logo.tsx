import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  invert?: boolean;
}

export function Logo({ className, size = "md", invert = false }: LogoProps) {
  const sizes = {
    sm: { wrap: "gap-1.5", icon: "h-6 w-6", dot: "h-3 w-3", text: "text-lg" },
    md: { wrap: "gap-2", icon: "h-8 w-8", dot: "h-4 w-4", text: "text-xl" },
    lg: { wrap: "gap-2.5", icon: "h-10 w-10", dot: "h-5 w-5", text: "text-2xl" },
  }[size];

  return (
    <Link
      to="/"
      className={cn(
        "inline-flex items-center font-display font-semibold tracking-tight",
        sizes.wrap,
        className,
      )}
    >
      <span
        className={cn(
          "relative inline-flex items-center justify-center rounded-full",
          sizes.icon,
          invert ? "bg-background/10" : "bg-rose-soft",
        )}
      >
        <Heart className={cn(sizes.dot, "fill-primary stroke-primary")} strokeWidth={2} />
      </span>
      <span className={sizes.text}>곁</span>
    </Link>
  );
}
