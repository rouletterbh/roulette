"use client";

import { toHex, type Hex } from "viem";
import { colorOf } from "@/lib/roulette/constants";
import { cn } from "@/lib/utils";

const PARTS = [
  ["serverSeed", "Server seed", "border-ink"],
  ["playerSeed", "Player seed", "border-cobalt"],
  ["blockRef", "Block ref", "border-purple"],
  ["roundId", "Round id · uint256", "border-amber"],
] as const;

/**
 * Hash trace: the exact preimage bytes that were hashed, each component
 * underlined in its own colour, then keccak256 → mod 37 → pocket, plus the
 * commitment check. Everything shown is recomputed in the browser.
 */
export function HashTrace({ serverSeed, playerSeed, blockRef, roundId, hash, result, commitment, computedCommitment, stage, className }: { serverSeed: Hex; playerSeed: Hex; blockRef: Hex; roundId: number; hash: Hex; result: number; commitment: Hex; computedCommitment: Hex; stage: number; className?: string }) {
  const roundHex = toHex(BigInt(roundId), { size: 32 });
  const parts: Record<(typeof PARTS)[number][0], string> = { serverSeed, playerSeed, blockRef, roundId: roundHex };
  const commitOk = computedCommitment.toLowerCase() === commitment.toLowerCase();
  const strip = (h: string, i: number) => (i === 0 ? h : h.replace(/^0x/, ""));

  const row = (k: string, v: React.ReactNode, visible: boolean, opts: { bad?: boolean; strong?: boolean } = {}) => (
    <div key={k} className={cn("grid grid-cols-[88px_1fr] items-baseline gap-3 py-2.5 transition-opacity duration-300 sm:grid-cols-[120px_1fr]", visible ? "opacity-100" : "opacity-25")} aria-hidden={!visible}>
      <dt className="microlabel">{k}</dt>
      <dd className={cn("min-w-0 break-all font-mono text-[11.5px] leading-relaxed tnum", opts.bad ? "text-casino-red" : opts.strong ? "text-ink" : "text-ink-2")}>{visible ? v : "—"}</dd>
    </div>
  );

  return (
    <figure className={cn("relative border border-hairline", className)}>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2">
        <span className="microlabel !text-ink">Hash trace</span>
        <span className="microlabel tnum">keccak256 · mod 37 · computed locally</span>
      </figcaption>

      <div className="px-4 py-4">
        <div className="microlabel mb-2">Preimage · {(serverSeed.length + playerSeed.length + blockRef.length + roundHex.length - 8) / 2} bytes</div>
        <p className="break-all font-mono text-[11.5px] leading-[1.9] text-ink">
          {PARTS.map(([k, label, border], i) => (
            <span key={k} className={cn("border-b-2 pb-px", border)} title={label}>
              {strip(parts[k], i)}
            </span>
          ))}
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1" aria-label="Preimage components">
          {PARTS.map(([k, label, border]) => (
            <li key={k} className="flex items-center gap-2">
              <span className={cn("h-0 w-4 border-b-2", border)} aria-hidden />
              <span className="microlabel">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="divide-y divide-hairline border-t border-hairline px-4">
        {row("keccak256", hash, stage >= 3)}
        {row("mod 37", <>{hash.slice(0, 10)}… mod 37 = <strong className="font-medium">{result}</strong> · {colorOf(result).toUpperCase()}</>, stage >= 4, { strong: true })}
        {row("commit check", <>keccak256(serverSeed) = {computedCommitment.slice(0, 14)}… {commitOk ? "= commitment ✓" : `≠ commitment ${commitment.slice(0, 14)}… ✗`}</>, stage >= 2, { bad: !commitOk, strong: true })}
      </dl>
    </figure>
  );
}
