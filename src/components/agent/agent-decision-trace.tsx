import { cn } from "@/lib/utils";
import { explorerTx } from "@/config/chains";

/** A real transaction hash (chain mode). Simulated traces carry null. */
const isTxHash = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v);

export interface DecisionTrace {
  roundId: number;
  at: number;
  decision: string; // e.g. "BET BLACK" | "SKIP" | "STOP"
  rule: string; // natural language rule
  input: string; // e.g. "R R B R B"
  condition: boolean | null;
  leash: "pass" | "fail" | "n/a";
  leashNote?: string;
  maxAllowed?: number;
  wager?: number;
  commitment?: string;
  tx?: string | null;
  result?: string;
  outcome?: number | null;
}

/** Structured "why did the agent do this?" trace. Never a fake inner monologue. */
export function AgentDecisionTrace({ trace, className, compact }: { trace: DecisionTrace; className?: string; compact?: boolean }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Decision", <span key="d" className="font-medium text-ink">{trace.decision}</span>],
    ["Rule", trace.rule],
    ["Input", <span key="i" className="font-mono tracking-[0.2em]">{trace.input}</span>],
    ["Condition", trace.condition == null ? "—" : trace.condition ? "TRUE" : "FALSE"],
    ["Leash check", <span key="l" className={cn(trace.leash === "fail" && "text-casino-red")}>{trace.leash.toUpperCase()}{trace.leashNote ? ` · ${trace.leashNote}` : ""}</span>],
    ...(trace.maxAllowed != null ? [["Maximum allowed", `${trace.maxAllowed} chips`] as [string, React.ReactNode]] : []),
    ...(trace.wager != null ? [["Agent wager", `${trace.wager} chips`] as [string, React.ReactNode]] : []),
    ...(trace.commitment ? [["Commitment", <span key="c" className="font-mono text-[11px]">{trace.commitment.slice(0, 10)}…{trace.commitment.slice(-6)}</span>] as [string, React.ReactNode]] : []),
    ["Transaction", trace.tx ? (isTxHash(trace.tx) ? <a key="t" href={explorerTx(trace.tx)} target="_blank" rel="noreferrer" className="font-mono text-[11px] underline underline-offset-2 hover:text-ink">{trace.tx.slice(0, 10)}…{trace.tx.slice(-6)} ↗</a> : <span key="t" className="font-mono text-[11px]">{trace.tx.slice(0, 10)}…</span>) : <span key="t" className="text-faint">not broadcast</span>],
    ...(trace.result ? [["Result", trace.result] as [string, React.ReactNode]] : []),
    ...(trace.outcome != null ? [["Outcome", <span key="o" className={cn("tnum", trace.outcome > 0 ? "text-ink" : "text-muted")}>{trace.outcome > 0 ? "+" : ""}{trace.outcome} chips</span>] as [string, React.ReactNode]] : []),
  ];
  return (
    <div className={cn("border-t border-ink", className)}>
      <div className="flex items-center justify-between py-2"><span className="microlabel !text-ink">Decision trace</span><span className="font-mono text-[11px] tnum text-muted">Round #{trace.roundId}</span></div>
      <dl className={cn("divide-y divide-hairline", compact ? "text-[12px]" : "text-[13px]")}>
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[130px_1fr] gap-3 py-1.5"><dt className="microlabel">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
