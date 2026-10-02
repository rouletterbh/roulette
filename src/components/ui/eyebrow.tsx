import { cn } from "@/lib/utils";

export function Eyebrow({ children, className, live }: { children: React.ReactNode; className?: string; live?: boolean }) {
  return (
    <span className={cn("eyebrow inline-flex items-center gap-2", className)}>
      {live && <span className="live-dot" aria-hidden />}
      {children}
    </span>
  );
}
