import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/** Project mark: a wheel glyph + configurable wordmark. Replace freely once branding lands. */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("shrink-0", className)} aria-hidden>
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <path d="M12 1.5v4.5M12 18v4.5M1.5 12H6M18 12h4.5M4.6 4.6l3.2 3.2M16.2 16.2l3.2 3.2M4.6 19.4l3.2-3.2M16.2 7.8l3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16.8" cy="8" r="1.5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 text-ink", className)} aria-label={`${siteConfig.name} home`}>
      <LogoMark />
      {wordmark && <span className="font-display text-[22px] leading-none tracking-[-0.01em]">{siteConfig.name}</span>}
    </Link>
  );
}
