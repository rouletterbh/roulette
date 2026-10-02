import Link from "next/link";
import { NumberPill } from "@/components/ui/number-pill";
import { cn, formatNumber, formatUsd } from "@/lib/utils";

export function AgentCollectionEvent({ agentName, agentId, roundId, result, chips, usd, symbol, status, className }: { agentName: string | null; agentId: string | null; roundId: number; result: number; chips: number; usd: number; symbol: string; status: "collected" | "win-balance" | "settled" | "claimed"; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3 text-[13px]", className)}>
      <NumberPill n={result} size="sm" />
      <div className="min-w-0">
        <div className="truncate">
          {agentId ? <Link href={`/agent/${agentId}`} className="font-mono text-[12px] uppercase tracking-[0.06em] hover:underline">{agentName}</Link> : <span className="font-medium">You</span>}
          <span className="text-muted"> · </span>
          <span className="tnum">{formatNumber(chips)}</span> chips → <span className={cn("font-medium", status === "win-balance" ? "text-muted" : "text-ink")}>{symbol}</span>
        </div>
        <div className="microlabel mt-0.5">Round #{roundId} · <Link href={`/fairness?round=${roundId}`} className="hover:underline">verified</Link> · {status === "win-balance" ? "settled · unclaimed" : status}</div>
      </div>
      <div className="text-right font-mono text-[12.5px] tnum">{formatUsd(usd)}</div>
    </div>
  );
}
