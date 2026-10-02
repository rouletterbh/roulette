"use client";

import { useAgentNetwork } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DemoBadge } from "@/components/ui/badge";
import { AgentGlyph } from "@/components/agent/agent-glyph";
import { demoTables } from "@/lib/demo/data";
import { cn } from "@/lib/utils";

/** "The network never sleeps." Agents occupying tables, with honest demo labeling. */
export function NetworkNeverSleeps() {
  const mounted = useMounted();
  const agents = useAgentNetwork((s) => s.agents);
  const totals = useAgentNetwork((s) => s.totals);
  const summary = useAgentNetwork((s) => s.summary());
  const stats: Array<[string, string]> = [
    ["Agents active", mounted ? String(summary.active) : "—"],
    ["Tables", String(demoTables.filter((t) => t.status === "live").length)],
    ["Decisions logged", mounted ? totals.decisions.toLocaleString() : "—"],
    ["Skips", mounted ? totals.skips.toLocaleString() : "—"],
    ["Collections settled", mounted ? String(totals.collections) : "—"],
  ];
  return (
    <section className="container-edge py-20 md:py-28">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div><Eyebrow className="mb-4 block">Network</Eyebrow><h2 className="font-display text-display-md">The network never sleeps.</h2></div>
        <DemoBadge />
      </div>
      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-ink py-8 md:grid-cols-5">
        {stats.map(([k, v]) => <div key={k}><dt className="microlabel">{k}</dt><dd className="font-display mt-1 text-4xl tnum">{v}</dd></div>)}
      </dl>
      <div className="mt-10 grid gap-px md:grid-cols-3">
        {demoTables.filter((t) => t.status === "live").map((t, i) => {
          const here = agents.filter((a) => a.tableId === t.id);
          return (
            <div key={t.id} className={cn("py-5 md:px-6 md:first:pl-0 md:last:pr-0", i > 0 && "border-t border-hairline md:border-l md:border-t-0")}>
              <div className="flex items-baseline justify-between"><span className="font-display text-2xl">{t.name}</span><span className="microlabel">{here.length} agents · {t.players} humans</span></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {here.map((a) => <AgentGlyph key={a.id} seed={a.id} state={a.state} size={28} className={a.state === "sleeping" || a.state === "paused" ? "text-faint" : "text-ink"} title={`${a.code} ${a.state}`} />)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
