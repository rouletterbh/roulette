import Link from "next/link";
import { demoTreasury } from "@/lib/demo/data";
import { getMaximumSafeBet } from "@/lib/risk/engine";
import { formatUsd } from "@/lib/utils";
import { DemoBadge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";
import { ChainSolvencyStrip } from "./chain-stats";

/**
 * Live table limits derived from the risk engine. As treasury grows, limits expand
 * automatically — no human tops up the bankroll. Demo off: read from CasinoTreasury.
 */
export function SolvencyStrip() {
  return siteConfig.demoMode ? <DemoSolvencyStrip /> : <ChainSolvencyStrip />;
}

function DemoSolvencyStrip() {
  const t = demoTreasury;
  const safe = getMaximumSafeBet(t, 35);
  const items = [
    { label: "Bankroll", value: formatUsd(t.bankroll) },
    { label: "Available for payouts", value: formatUsd(safe.availableBankroll) },
    { label: "Reserved", value: formatUsd(t.reservedLiability) },
    { label: "Table max · straight bet", value: formatUsd(safe.maxStake), accent: true },
  ];
  return (
    <div className="container-edge">
      <Link
        href="/treasury"
        className="group grid grid-cols-2 gap-x-6 gap-y-5 border-y border-hairline py-6 transition-colors md:grid-cols-[repeat(4,1fr)_auto] md:items-center"
      >
        {items.map((i) => (
          <div key={i.label}>
            <div className="eyebrow mb-1.5 text-[10px]">{i.label}</div>
            <div className={"font-display text-2xl tnum md:text-3xl " + (i.accent ? "text-ink" : "text-ink")}>
              {i.value}
              {i.accent && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" aria-hidden />}
            </div>
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-between gap-3 text-[12.5px] text-muted md:col-span-1 md:flex-col md:items-end">
          <DemoBadge />
          <span className="transition-colors group-hover:text-ink">Limits scale with treasury →</span>
        </div>
      </Link>
    </div>
  );
}
