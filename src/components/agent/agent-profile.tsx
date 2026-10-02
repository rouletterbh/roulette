"use client";

import { useState } from "react";
import Link from "next/link";
import { useAgentSeats } from "@/store/agent-seat";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useWallet } from "@/store/wallet";
import { AgentLog } from "./agent-log";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { betFromId } from "@/lib/roulette/bets";
import { cn, formatNumber, shortAddress } from "@/lib/utils";

export function AgentProfile({ id }: { id: string }) {
  const mounted = useMounted();
  const seat = useAgentSeats((s) => s.seats[id]);
  const wallet = useWallet();
  const [following, setFollowing] = useState(false);
  if (!mounted) return <div className="container-edge py-24" aria-busy="true" />;
  const isOwner = !!wallet.address && seat?.owner === wallet.address;
  if (!seat || (!seat.isPublic && !isOwner)) {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <h1 className="font-display text-display-md">No agent here.</h1>
        <p className="mt-4 max-w-md text-muted">This agent is private, was removed, or never existed.</p>
        <Button href="/play" className="mt-8">Play</Button>
      </div>
    );
  }
  const wins = seat.log.filter((l) => l.kind === "result" && (l.delta ?? 0) > 0).length;
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-5">
          <PlayerAvatar address={seat.id} size={72} name={seat.name} />
          <div>
            <Eyebrow className="mb-2 block">Agent seat</Eyebrow>
            <h1 className="font-display text-display-md leading-none">{seat.name}</h1>
            <p className="mt-3 text-[13px] text-muted">
              Run by <Link href={`/player/${seat.owner}`} className="text-ink underline-offset-2 hover:underline">{shortAddress(seat.owner)}</Link> at table <Link href={`/table/${seat.tableId}`} className="text-ink underline-offset-2 hover:underline">{seat.tableId}</Link>
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={seat.status === "active" ? "accent" : seat.status === "stopped" ? "outline" : "muted"}>{seat.status}</Badge>
              {seat.stoppedReason && <span className="text-[12px] text-muted">{seat.stoppedReason}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant={following ? "outline" : "primary"} size="sm" onClick={() => setFollowing((v) => !v)} aria-pressed={following}>{following ? "Following" : "Follow"}</Button>
          <span className="text-[12px] tnum text-muted">{seat.followers + (following ? 1 : 0)} followers</span>
        </div>
      </div>

      <dl className="mt-12 grid grid-cols-2 gap-6 border-y border-hairline py-6 md:grid-cols-4">
        {[
          ["Rounds", `${seat.roundsPlayed} / ${seat.rules.maxRounds}`],
          ["Wins", String(wins)],
          ["Net", `${seat.net >= 0 ? "+" : ""}${formatNumber(seat.net)}`],
          ["Allowance", formatNumber(seat.allowance)],
        ].map(([k, v]) => (
          <div key={k}><dt className="eyebrow mb-1 text-[10px]">{k}</dt><dd className={cn("font-display text-3xl tnum", k === "Net" && seat.net < 0 && "text-casino-red")}>{v}</dd></div>
        ))}
      </dl>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <section>
          <h2 className="font-display mb-4 text-3xl">The thesis</h2>
          <dl className="divide-y divide-hairline text-[14px]">
            {[
              ["Bets", seat.rules.bets.map((b) => `${b.stake} on ${betFromId(b.betId)?.label}`).join(", ")],
              ["Cadence", seat.rules.cadence.replace("-", " ")],
              ["Stop-loss", `−${formatNumber(seat.rules.stopLoss)} chips`],
              ["Stop-win", seat.rules.stopWin != null ? `+${formatNumber(seat.rules.stopWin)} chips` : "none"],
              ["Time limit", `${seat.rules.timeLimitMinutes} minutes`],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] py-2.5"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">Agents never influence outcomes. They place ordinary bets under the same treasury limits and responsible-play settings as the player who approved them. Every spin is independent.</p>
        </section>
        <section>
          <h2 className="font-display mb-4 text-3xl">Activity</h2>
          <AgentLog items={seat.log} max={60} />
        </section>
      </div>
    </div>
  );
}
