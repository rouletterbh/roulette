import { cn } from "@/lib/utils";

/**
 * Editorial architecture diagram. Thin hairlines, no fills beyond the surface
 * token, currentColor throughout so it reads in light and dark mode.
 */
type Box = { id: string; x: number; y: number; w?: number; h?: number; title: string; sub: string; dashed?: boolean };

const boxes: Box[] = [
  { id: "wallet", x: 40, y: 30, w: 200, title: "Player wallet", sub: "ETH · chips · rewards" },
  { id: "treasury", x: 40, y: 180, w: 170, title: "CasinoTreasury", sub: "deposits · bankroll · reserves" },
  { id: "chip", x: 250, y: 180, w: 170, title: "Chip1155", sub: "ERC-1155 chip balances" },
  { id: "table", x: 470, y: 180, w: 210, title: "TableManager / RouletteGame", sub: "tables · rounds · escrow · settle" },
  { id: "vault", x: 730, y: 180, w: 190, title: "RewardVault", sub: "crypto · Stock Tokens inventory" },
  { id: "risk", x: 250, y: 330, w: 170, title: "RiskEngine", sub: "collateral check before acceptance" },
  { id: "rng", x: 470, y: 330, w: 210, title: "RandomnessManager", sub: "commit – reveal" },
];

const edges: Array<{ d: string; label?: string; lx?: number; ly?: number; anchor?: "start" | "middle" | "end"; both?: boolean }> = [
  { d: "M100 94 V180", label: "deposit", lx: 108, ly: 142, anchor: "start" },
  { d: "M210 212 H250", label: "mint", lx: 230, ly: 205, anchor: "middle" },
  { d: "M420 212 H470", label: "bet / pay", lx: 445, ly: 205, anchor: "middle", both: true },
  { d: "M680 212 H730", label: "claim", lx: 705, ly: 205, anchor: "middle" },
  { d: "M825 180 V130 H200 V94", label: "settle · crypto or Stock Tokens (pull)", lx: 512, ly: 122, anchor: "middle" },
  { d: "M575 244 V330", label: "commit · reveal", lx: 583, ly: 292, anchor: "start" },
  { d: "M520 244 V290 H335 V330", label: "checkWager()", lx: 427, ly: 283, anchor: "middle" },
  { d: "M250 362 H125 V244", label: "bankroll snapshot", lx: 187, ly: 380, anchor: "middle" },
];

export function ArchitectureDiagram({ className }: { className?: string }) {
  return (
    <figure className={cn("text-ink", className)}>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface dark:bg-elevated">
        <svg
          viewBox="0 0 960 520"
          role="img"
          aria-labelledby="arch-title arch-desc"
          className="block h-auto w-full min-w-[720px]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          <title id="arch-title">Contract architecture</title>
          <desc id="arch-desc">
            A player wallet deposits into CasinoTreasury, which mints Chip1155 chips. Chips are staked at TableManager / RouletteGame, which asks
            RiskEngine (reading a treasury snapshot) before accepting a wager and RandomnessManager for commit–reveal outcomes. Wins become claims
            in RewardVault and settle back to the wallet. AccessController and EmergencyPause apply across all contracts.
          </desc>
          <defs>
            <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {/* edges */}
          <g fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.55">
            {edges.map((e) => (
              <path key={e.d} d={e.d} markerEnd="url(#arch-arrow)" markerStart={e.both ? "url(#arch-arrow)" : undefined} />
            ))}
          </g>
          <g fontSize="11" fill="var(--muted)">
            {edges.map((e) => e.label && (
              <text key={e.label} x={e.lx} y={e.ly} textAnchor={e.anchor ?? "start"}>
                {e.label}
              </text>
            ))}
          </g>

          {/* boxes */}
          {boxes.map((b) => {
            const w = b.w ?? 180;
            const h = b.h ?? 64;
            return (
              <g key={b.id}>
                <rect x={b.x} y={b.y} width={w} height={h} rx="10" fill="var(--surface)" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
                <text x={b.x + 16} y={b.y + 28} fontSize="13" fill="currentColor" fontWeight={500}>
                  {b.title}
                </text>
                <text x={b.x + 16} y={b.y + 46} fontSize="10.5" fill="var(--muted)">
                  {b.sub}
                </text>
              </g>
            );
          })}

          {/* cross-cutting band */}
          <g>
            <rect x="40" y="450" width="880" height="50" rx="10" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="4 4" />
            <text x="56" y="472" fontSize="13" fill="currentColor" fontWeight={500}>
              AccessController · EmergencyPause
            </text>
            <text x="56" y="489" fontSize="10.5" fill="var(--muted)">
              cross-cutting: role checks on every privileged call; independent pause switches for deposits, gameplay, claims and withdrawals
            </text>
            <text x="904" y="481" fontSize="10.5" fill="var(--muted)" textAnchor="end">
              all contracts public on Blockscout
            </text>
          </g>
        </svg>
      </div>
      <figcaption className="mt-3 text-[12.5px] text-muted">
        Intended contract topology on Robinhood Chain. Contracts are in development; names and boundaries may change before deployment.
      </figcaption>
    </figure>
  );
}
