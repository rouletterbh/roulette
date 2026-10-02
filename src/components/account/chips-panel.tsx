import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/badge";
import { chipTokenIds, type ChipDenomination } from "@/config/tokens";
import type { DemoChipBalance } from "@/lib/demo/players";
import { cn } from "@/lib/utils";

/** Chip balance by denomination. Each denomination is an ERC-1155 id. */
export function ChipsPanel({ chips, total, detailed = false, className }: { chips: DemoChipBalance[]; total: number; detailed?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="eyebrow">Chip balance</span>
            <DemoBadge />
          </div>
          <p className="mt-2 font-display text-5xl tnum md:text-6xl">
            {total.toLocaleString("en-US")}
            <span className="ml-2 text-xl text-muted">chips</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button href="/cashier" variant="accent" size="md">
            Buy chips
          </Button>
          <Button href="/play" variant="outline" size="md">
            Play
          </Button>
        </div>
      </div>

      <ul className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-6" aria-label="Chips by denomination">
        {chips.map((c) => (
          <li key={c.denomination} className={cn("flex flex-col items-center gap-3 bg-surface px-3 py-5 dark:bg-elevated", c.count === 0 && "opacity-60")}>
            <Chip value={c.denomination} size={44} label={`${c.denomination} chip`} />
            <div className="text-center">
              <p className="font-display text-2xl tnum">{c.count}</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">× {c.denomination}</p>
            </div>
            {detailed && (
              <p className="font-mono text-[10.5px] tnum text-faint" title="ERC-1155 token id">
                #{chipTokenIds[c.denomination as ChipDenomination].toString()}
              </p>
            )}
          </li>
        ))}
      </ul>

      {detailed && (
        <dl className="mt-8 grid gap-6 text-[13.5px] md:grid-cols-3">
          <div>
            <dt className="eyebrow">Standard</dt>
            <dd className="mt-1.5 text-ink-2">ERC-1155 on Robinhood Chain. One token id per denomination, fully fungible within an id.</dd>
          </div>
          <div>
            <dt className="eyebrow">Escrow</dt>
            <dd className="mt-1.5 text-ink-2">Chips move to round escrow when you place a wager and return (or settle) when the round reveals.</dd>
          </div>
          <div>
            <dt className="eyebrow">Contract</dt>
            <dd className="mt-1.5 font-mono tnum text-muted">not set</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
