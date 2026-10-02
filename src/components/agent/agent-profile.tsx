"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAgentSeats } from "@/store/agent-seat";
import { useStable } from "@/store/stable";
import { useCollection, summarize } from "@/store/collection";
import { getDemoAgent } from "@/lib/demo/agents";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useWallet } from "@/store/wallet";
import { AgentLog } from "./agent-log";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { betFromId } from "@/lib/roulette/bets";
import { cn, formatNumber, formatUsd, shortAddress } from "@/lib/utils";

interface View {
  id: string;
  name: string;
  thesis: string;
  ownerLabel: string;
  ownerHref: string;
  tableId: string;
  status: string;
  stoppedReason: string | null;
  bets: string;
  betId: string;
  stake: number;
  cadence: string;
  stopLoss: number;
  stopWin: number | null;
  maxRounds: number;
  timeLimitMinutes: number;
  rounds: number;
  wins: number;
  net: number | null;
  allowance: number | null;
  followers: number;
  collection: Array<{ symbol: string; usd: number; count: number }>;
  log: Parameters<typeof AgentLog>[0]["items"];
  demo: boolean;
}

export function AgentProfile({ id }: { id: string }) {
  const mounted = useMounted();
  const router = useRouter();
  const seat = useAgentSeats((s) => s.seats[id]);
  const acqs = useCollection((s) => s.acquisitions);
  const following = useStable((s) => s.following.includes(id));
  const toggle = useStable((s) => s.toggle);
  const setDraft = useStable((s) => s.setDraft);
  const wallet = useWallet();
  if (!mounted) return <div className="container-edge py-24" aria-busy="true" />;

  const isOwner = !!wallet.address && seat?.owner === wallet.address;
  let v: View | null = null;
  if (seat && (seat.isPublic || isOwner || seat.owner === "practice")) {
    const mine = summarize(acqs.filter((a) => a.agentId === seat.id));
    v = {
      id: seat.id, name: seat.name, thesis: seat.thesis, ownerLabel: seat.owner === "practice" ? "you (practice)" : shortAddress(seat.owner), ownerHref: seat.owner === "practice" ? "/play/practice" : `/player/${seat.owner}`, tableId: seat.tableId,
      status: seat.status, stoppedReason: seat.stoppedReason,
      bets: seat.rules.bets.map((b) => `${b.stake} on ${betFromId(b.betId)?.label}`).join(", "), betId: seat.rules.bets[0].betId, stake: seat.rules.bets[0].stake,
      cadence: seat.rules.cadence, stopLoss: seat.rules.stopLoss, stopWin: seat.rules.stopWin, maxRounds: seat.rules.maxRounds, timeLimitMinutes: seat.rules.timeLimitMinutes,
      rounds: seat.roundsPlayed, wins: seat.log.filter((l) => l.kind === "result" && (l.delta ?? 0) > 0).length, net: seat.net, allowance: seat.allowance, followers: seat.followers,
      collection: mine.holdings.map((h) => ({ symbol: h.symbol, usd: h.usd, count: h.count })), log: seat.log, demo: false,
    };
  } else {
    const d = getDemoAgent(id);
    if (d) {
      v = {
        id: d.id, name: d.name, thesis: d.thesis, ownerLabel: d.owner.name, ownerHref: `/player/${d.owner.wallet}`, tableId: d.tableId, status: d.status, stoppedReason: null,
        bets: d.bets.map((b) => `${b.stake} on ${b.label}`).join(", "), betId: d.bets[0].betId, stake: d.bets[0].stake, cadence: d.cadence, stopLoss: d.stopLoss, stopWin: d.stopWin, maxRounds: d.maxRounds, timeLimitMinutes: d.timeLimitMinutes,
        rounds: d.roundsInsideLimits, wins: Math.round(d.roundsInsideLimits * 0.47), net: null, allowance: null, followers: d.followers, collection: d.collection, log: [], demo: true,
      };
    }
  }

  if (!v) {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <h1 className="font-display text-display-md">No agent here.</h1>
        <p className="mt-4 max-w-md text-muted">This agent is private, was removed, or never existed.</p>
        <Button href="/agents" className="mt-8">See the league</Button>
      </div>
    );
  }
  const collected = v.collection.reduce((s, c) => s + c.usd, 0);
  const copyThesis = () => {
    setDraft({ name: `${v!.name} (copy)`, betId: v!.betId, stake: v!.stake, cadence: v!.cadence, stopLoss: v!.stopLoss, stopWin: v!.stopWin, maxRounds: v!.maxRounds, timeLimitMinutes: v!.timeLimitMinutes });
    router.push("/play/quick");
  };

  return (
    <div className="container-edge py-16 md:py-24">
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-5">
          <PlayerAvatar address={v.id} size={72} name={v.name} />
          <div>
            <Eyebrow className="mb-2 block">Agent</Eyebrow>
            <h1 className="font-display text-display-md leading-none">{v.name}</h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-2">{v.thesis || <span className="text-muted">No thesis written.</span>}</p>
            <p className="mt-2 text-[13px] text-muted">
              Authored by <Link href={v.ownerHref} className="text-ink underline-offset-2 hover:underline">{v.ownerLabel}</Link> · table <Link href={`/table/${v.tableId}`} className="text-ink underline-offset-2 hover:underline">{v.tableId}</Link>
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={v.status === "active" ? "accent" : v.status === "stopped" ? "outline" : "muted"}>{v.status === "pending-approval" ? "needs approval" : v.status}</Badge>
              {v.stoppedReason && <span className="text-[12px] text-muted">{v.stoppedReason}</span>}
              {v.demo && <DemoBadge />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant={following ? "outline" : "primary"} size="sm" onClick={() => toggle(v!.id)} aria-pressed={following}>{following ? "Following" : "Follow"}</Button>
          <Button variant="ghost" size="sm" onClick={copyThesis}>Copy thesis</Button>
          <span className="text-[12px] tnum text-muted">{v.followers + (following ? 1 : 0)} followers</span>
        </div>
      </div>

      <dl className="mt-12 grid grid-cols-2 gap-6 border-y border-hairline py-6 md:grid-cols-4">
        <div><dt className="eyebrow mb-1 text-[10px]">Rounds inside limits</dt><dd className="font-display text-3xl tnum">{v.rounds}{v.demo ? "" : ` / ${v.maxRounds}`}</dd></div>
        <div><dt className="eyebrow mb-1 text-[10px]">Wins</dt><dd className="font-display text-3xl tnum">{v.wins}</dd></div>
        <div><dt className="eyebrow mb-1 text-[10px]">Collected</dt><dd className="font-display text-3xl tnum">{formatUsd(collected)}</dd></div>
        <div><dt className="eyebrow mb-1 text-[10px]">{v.net != null ? "Net" : "Followers"}</dt><dd className={cn("font-display text-3xl tnum", v.net != null && v.net < 0 && "text-casino-red")}>{v.net != null ? `${v.net >= 0 ? "+" : ""}${formatNumber(v.net)}` : v.followers}</dd></div>
      </dl>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <section>
          <h2 className="font-display mb-4 text-3xl">The leash</h2>
          <dl className="divide-y divide-hairline text-[14px]">
            {[
              ["Bets", v.bets],
              ["Cadence", v.cadence.replace("-", " ")],
              ["Stop-loss", `−${formatNumber(v.stopLoss)} chips`],
              ["Stop-win", v.stopWin != null ? `+${formatNumber(v.stopWin)} chips` : "none"],
              ["Rounds", `≤ ${v.maxRounds}`],
              ["Time limit", `${v.timeLimitMinutes} minutes`],
              ...(v.allowance != null ? [["Allowance", `${formatNumber(v.allowance)} chips`]] : []),
            ].map(([k, val]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] py-2.5"><dt className="text-muted">{k}</dt><dd>{val}</dd></div>
            ))}
          </dl>
          <h2 className="font-display mb-4 mt-10 text-3xl">Collection</h2>
          {v.collection.length === 0 ? <p className="text-[13px] text-muted">Nothing collected yet.</p> : (
            <ul className="divide-y divide-hairline text-[14px]">
              {v.collection.map((c) => (
                <li key={c.symbol} className="flex items-center justify-between py-2.5"><span className="font-medium">{c.symbol}</span><span className="tnum text-muted">{c.count} × · {formatUsd(c.usd)}</span></li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-muted">Agents never influence outcomes. The wheel keeps 1/37 of every chip bet; agents play, they don&apos;t earn. What they collect is what their author walked away with.</p>
        </section>
        <section>
          <h2 className="font-display mb-4 text-3xl">Activity</h2>
          {v.demo ? <p className="text-[13px] text-muted">Activity logs are shown for agents you author. This is a demo agent.</p> : <AgentLog items={v.log} max={60} />}
        </section>
      </div>
    </div>
  );
}
