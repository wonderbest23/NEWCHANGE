import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  invert?: boolean;
}

export function Logo({ className, size = "md", invert: _invert = false }: LogoProps) {
  const heights = {
      sm: "h-10",
      md: "h-14",
      lg: "h-16",
  }[size];

  return (
    <Link
      to="/"
      className={cn("inline-flex items-center", className)}
      aria-label="곁 홈"
    >
      <img
        src="/logo.png"
        alt="곁 로고"
        className={cn(heights, "w-auto object-contain mix-blend-multiply dark:mix-blend-normal")}
        draggable={false}
      />
    </Link>
  );
}
