import Link from "next/link";
import { AgentGlyph } from "./agent-glyph";
import { AgentStatus } from "./agent-status";
import type { AgentState } from "@/lib/agent/states";
import { cn } from "@/lib/utils";

export function AgentMiniCard({ id, code, name, strategyClass, state, meta, href, className, leashPct, action }: { id: string; code: string; name: string; strategyClass: string; state: AgentState; meta?: Array<[string, string]>; href?: string; className?: string; leashPct?: number; action?: React.ReactNode }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <AgentGlyph seed={id} state={state} size={40} className="text-ink" />
          <div>
            <div className="font-mono text-[13px] uppercase tracking-[0.06em]">{code}</div>
            <div className="text-[12px] text-muted">{name} · {strategyClass}</div>
          </div>
        </div>
        <AgentStatus state={state} />
      </div>
      {meta && (
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3">
          {meta.map(([k, v]) => <div key={k}><dt className="microlabel">{k}</dt><dd className="font-mono text-[12.5px] tnum">{v}</dd></div>)}
        </dl>
      )}
      {leashPct != null && (
        <div className="mt-3 flex items-center gap-2"><span className="microlabel">Leash</span><span className="h-1 flex-1 bg-hairline"><span className="block h-full bg-ink" style={{ width: `${Math.min(100, leashPct)}%`, background: leashPct >= 80 ? "var(--agent-warn)" : undefined }} /></span><span className="font-mono text-[11px] tnum">{Math.round(leashPct)}%</span></div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </>
  );
  const cls = cn("block border-t border-ink pt-4", className);
  return href ? <Link href={href} className={cn(cls, "transition-colors hover:bg-sunken/60 dark:hover:bg-elevated")}>{body}</Link> : <div className={cls}>{body}</div>;
}
