import { siteConfig } from "@/config/site";

export function DemoBanner() {
  if (!siteConfig.demoMode) return null;
  return (
    <div className="border-b border-hairline bg-sunken/70 text-center text-[11px] tracking-[0.04em] text-muted dark:bg-elevated/60">
      <div className="container-edge flex h-7 items-center justify-center gap-2">
        <span className="rounded-full border border-dashed border-border-strong px-1.5 text-[9px] uppercase tracking-[0.14em]">Demo</span>
        Simulated wallet, balances and tables. Nothing here is live blockchain state.
      </div>
    </div>
  );
}
