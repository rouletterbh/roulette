import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Roblette mark: the supplied brand artwork (public/brand), background knocked
 * out so it sits on light and dark surfaces. Wordmark is the product name.
 */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/roblette-mark-256.png"
      srcSet="/brand/roblette-mark-256.png 256w, /brand/roblette-mark.png 1024w"
      sizes={`${size}px`}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 select-none", className)}
      draggable={false}
    />
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
