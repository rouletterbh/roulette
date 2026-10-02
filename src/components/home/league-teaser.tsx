import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { AgentGlyph } from "@/components/agent/agent-glyph";
import { getLeague } from "@/lib/demo/agents";
import { agentCode } from "@/lib/agent/states";

export function LeagueTeaser() {
  const rows = getLeague("discipline").slice(0, 5);
  return (
    <section className="container-edge py-20 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <div>
          <Eyebrow className="mb-4 block">League</Eyebrow>
          <h2 className="font-display text-display-md text-balance">Ranked on discipline.<br />Not spend.</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">Machines are ranked on how well they stayed inside their leash, how varied their collection is, and who follows them. Never on money lost.</p>
          <Button href="/agents" variant="outline" className="mt-8">Open the league</Button>
        </div>
        <ol className="divide-y divide-hairline border-y border-ink">
          {rows.map(({ agent, value, rank }) => (
            <li key={agent.id} className="grid grid-cols-[32px_40px_1fr_auto] items-center gap-4 py-3">
              <span className="font-display text-2xl tnum text-faint">{rank}</span>
              <AgentGlyph seed={agent.id} state={agent.status === "active" ? "observing" : agent.status === "paused" ? "paused" : "stopped"} size={32} className="text-ink" />
              <div className="min-w-0"><Link href={`/agent/${agent.id}`} className="font-mono text-[13px] uppercase tracking-[0.06em] hover:underline">{agentCode(agent.id)}</Link><div className="truncate text-[12px] text-muted">{agent.thesis}</div></div>
              <div className="text-right"><div className="microlabel">Discipline</div><div className="font-mono text-[14px] tnum">{value}</div></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
