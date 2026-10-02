"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { useGame, type GameMode } from "@/store/game";
import { usePreferences } from "@/store/preferences";
import { useChips } from "@/store/chips";
import { useWallet } from "@/store/wallet";
import { useLiveTable, SPEED_MS } from "@/store/live-table";
import { useMediaQuery } from "@/hooks/use-media-query";
import { getMaximumSafeBet } from "@/lib/risk/engine";
import { demoTreasury, type TableSpeed } from "@/lib/demo/data";
import { RouletteWheel } from "./roulette-wheel";
import { RouletteBoard } from "./roulette-board";
import { ChipSelector } from "./chip-selector";
import { BetSlip } from "./bet-slip";
import { RecentNumbers } from "./recent-numbers";
import { RoundResult } from "./round-result";
import { TableStats } from "./table-stats";
import { FairnessProof } from "./fairness-proof";
import { RoundTimer } from "./round-timer";
import { TablePlayers } from "@/components/table/table-players";
import { TableFeed } from "@/components/table/table-feed";
import { RecentWinners, ShareTable } from "@/components/table/table-info";
import { SoundToggle } from "@/components/layout/sound-toggle";
import { WalletButton } from "@/components/layout/wallet-button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, cn, shortAddress } from "@/lib/utils";
import { RealMoneyGate } from "@/components/compliance/real-money-gate";
import { AgentSeatPanel } from "@/components/agent/agent-seat-panel";
import { AgentRail } from "@/components/table/agent-rail";
import { RoundTelemetry } from "@/components/agent/round-telemetry";
import { useAgentNetwork } from "@/store/agent-network";
import { useState, useCallback } from "react";

export interface GameTableConfig {
  mode: GameMode;
  tableId?: string;
  name: string;
  speed?: TableSpeed;
  seats?: number;
  minBet?: number;
  maxBet?: number;
  visibility?: "public" | "private";
  inviteCode?: string;
  /** Seed for the recent-results strip (indexed history for an existing table). */
  recent?: number[];
}

const PRACTICE_BALANCE = 1000;

export function GameTable({ config }: { config: GameTableConfig }) {
  if (config.mode === "practice") return <GameTableInner config={config} />;
  return (
    <RealMoneyGate>
      <GameTableInner config={config} />
    </RealMoneyGate>
  );
}

function GameTableInner({ config }: { config: GameTableConfig }) {
  const g = useGame();
  const live = useLiveTable();
  const chips = useChips();
  const wallet = useWallet();
  const prefersReduced = useReducedMotion();
  const reducedPref = usePreferences((s) => s.reducedMotion);
  const reduced = !!prefersReduced || reducedPref;
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const initialized = useRef(false);
  const netTable = useAgentNetwork((s) => (config.tableId ? s.tables[config.tableId] : undefined));
  const [railHighlight, setRailHighlight] = useState<string | null>(null);
  const onHighlight = useCallback((id: string | null) => setRailHighlight(id), []);

  const practice = config.mode === "practice";
  const shared = config.mode === "live" || config.mode === "private";
  const needsWallet = !practice;
  const connected = wallet.status === "connected";
  const speed = config.speed ?? "standard";

  // Enter the table: practice uses free chips; real modes escrow the demo chip balance.
  useEffect(() => {
    if (initialized.current) return;
    if (needsWallet && !connected) return;
    initialized.current = true;
    const treasury = practice ? undefined : demoTreasury;
    g.init(config.mode, practice ? PRACTICE_BALANCE : chips.balance);
    if (treasury) useGame.setState({ treasury: { ...treasury } });
    if (config.recent?.length) useGame.setState({ recent: [...config.recent] });
    if (shared) live.start(config.tableId ?? config.name, speed, config.seats ?? 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Leave the table: reconcile escrow back to the chip wallet.
  useEffect(() => {
    return () => {
      if (!initialized.current || practice) return;
      useChips.getState().setBalance(useGame.getState().balance);
      useLiveTable.getState().stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Solo modes auto-advance after a result; shared tables are driven by the table timer.
  useEffect(() => {
    if (shared || g.phase !== "result") return;
    const id = setTimeout(() => g.nextRound(), 5000);
    return () => clearTimeout(id);
  }, [g.phase, g.roundId, g, shared]);

  useEffect(() => {
    if (!shared || !initialized.current) return;
    const id = setInterval(() => useLiveTable.getState().tick(), 250);
    return () => clearInterval(id);
  }, [shared, connected]);

  if (needsWallet && !connected) {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <Badge tone="outline" className="mb-5">{config.mode === "quick" ? "Quick play" : config.mode === "private" ? "Private table" : "Live table"}</Badge>
        <h1 className="font-display text-display-md">Connect a wallet to sit down.</h1>
        <p className="mt-4 max-w-md text-muted">Your chips stay in your wallet until you join a table. Nothing moves without your signature.</p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <WalletButton />
          <Button href="/play/practice" variant="outline">Try practice instead</Button>
        </div>
      </div>
    );
  }

  const placed = g.placedBets();
  const total = g.totalWager();
  const liability = g.liability();
  const safe = getMaximumSafeBet(g.treasury, 35);
  const maxOutside = Math.min(config.maxBet ?? Infinity, Math.floor(safe.maxRoundExposure));
  const maxStraight = Math.min(config.maxBet ?? Infinity, Math.max(0, Math.floor(safe.maxStake)));
  const spinning = g.phase === "spinning";
  const bettingOpen = g.phase === "betting";
  const result = g.pendingReveal?.result ?? null;
  const unit = "chips";
  const selfName = wallet.ensName ?? (wallet.address ? shortAddress(wallet.address) : "You");
  const selfAddress = wallet.address ?? "0x0000000000000000000000000000000000000000";
  const statusLabel = bettingOpen ? (shared ? `Bets open · ${live.secondsLeft()}s` : "Bets open") : g.phase === "closed" ? "Betting closed" : spinning ? "No more bets" : "Result";

  return (
    <div className="container-edge pb-28 pt-6 lg:pb-16">
      {/* table header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-5">
        <div className="flex items-center gap-4">
          {shared && <RoundTimer endsAt={live.bettingEndsAt} duration={SPEED_MS[speed]} active={bettingOpen} size={56} />}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-3xl leading-none">{config.name}</h1>
              {practice ? <Badge tone="outline">No value</Badge> : <DemoBadge />}
              {config.visibility === "private" && <Badge tone="muted">Private</Badge>}
              {shared && <Badge tone="accent"><span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />Live</Badge>}
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">
              European roulette · {practice ? "practice chips only · nothing touches the chain" : `${speed} rounds · min ${config.minBet ?? 1} · max ${formatNumber(maxOutside)} outside · ${formatNumber(maxStraight)} straight`}
            </p>
            {shared && netTable && <RoundTelemetry className="mt-2" roundId={g.roundId} phase={bettingOpen ? "open" : g.phase === "result" ? "settling" : "locked"} nextAt={live.bettingEndsAt} exposurePct={netTable.exposurePct} />}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="eyebrow text-[10px]">{practice ? "Practice balance" : "Chips at table"}</div>
            <div className="font-display text-2xl tnum leading-none">{formatNumber(g.balance)}</div>
          </div>
          <SoundToggle />
          {practice ? (
            <button type="button" onClick={() => g.init("practice", PRACTICE_BALANCE)} className="h-9 rounded-full border border-border px-3 text-[12px] font-medium hover:border-ink">Reset</button>
          ) : (
            <Button href={config.mode === "quick" ? "/play" : "/tables"} variant="outline" size="sm">Leave table</Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px] lg:gap-8">
        {/* LEFT */}
        <aside className="order-3 flex flex-col gap-5 lg:order-1 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-1">
          {shared ? (
            <>
              <AgentRail tableId={config.tableId ?? config.mode} selfAddress={selfAddress} selfName={selfName} onHighlight={onHighlight} />
              <TablePlayers seats={live.seats} spectators={live.spectators} selfName={selfName} selfAddress={selfAddress} selfBets={total} onMute={live.mute} onBlock={live.block} onReport={live.report} muted={live.muted} />
              <TableFeed items={live.feed} muted={live.muted} onChat={live.chat} onReact={live.react} selfAddress={selfAddress} className="min-h-[260px] border-t border-hairline pt-4" />
            </>
          ) : (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="eyebrow">Recent</h2>
                  <span className="text-[11px] tnum text-muted">Round #{g.roundId}</span>
                </div>
                <RecentNumbers numbers={g.recent} size="md" max={12} />
              </div>
              <TableStats numbers={g.recent} />
              <dl className="grid grid-cols-2 gap-3 border-t border-hairline pt-4 text-[12.5px] tnum">
                <div><dt className="text-muted">Spins</dt><dd className="font-medium">{g.stats.spins}</dd></div>
                <div><dt className="text-muted">Wins</dt><dd className="font-medium">{g.stats.wins}</dd></div>
                <div><dt className="text-muted">Largest win</dt><dd className="font-medium">{formatNumber(g.stats.largestWin)}</dd></div>
                <div><dt className="text-muted">Streak</dt><dd className="font-medium">{g.stats.streak} <span className="text-muted">/ {g.stats.bestStreak}</span></dd></div>
              </dl>
              <div className="border-t border-hairline pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="eyebrow">Table limits</h2>
                  <Link href="/faq" className="text-[11px] text-muted underline-offset-2 hover:underline">How limits work</Link>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px] tnum">
                  <dt className="text-muted">Bankroll</dt><dd className="text-right">{formatNumber(g.treasury.bankroll, { maximumFractionDigits: 0 })}</dd>
                  <dt className="text-muted">Reserved</dt><dd className="text-right">{formatNumber(g.treasury.reservedLiability, { maximumFractionDigits: 0 })}</dd>
                  <dt className="text-muted">Per-round cap</dt><dd className="text-right">{formatNumber(safe.maxRoundExposure, { maximumFractionDigits: 0 })}</dd>
                  <dt className="text-muted">Max straight</dt><dd className="text-right font-medium">{formatNumber(safe.maxStake, { maximumFractionDigits: 0 })}</dd>
                </dl>
              </div>
              <FairnessProof commitment={g.commitment} reveal={g.phase === "result" ? g.lastRound?.reveal : null} compact className="hidden lg:block" />
            </>
          )}
        </aside>

        {/* CENTER */}
        <div className="order-1 flex min-w-0 flex-col gap-6 lg:order-2">
          <div className="relative mx-auto w-full max-w-[min(78vw,520px)] lg:max-w-[520px]">
            <RouletteWheel result={result} spinning={spinning} onComplete={g.onSpinComplete} restingResult={g.lastRound?.result ?? null} reducedMotion={reduced} />
            <div className="pointer-events-none absolute inset-x-0 top-[-6px] flex justify-center">
              <span className={cn("rounded-full px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.14em] tnum transition-colors", bettingOpen ? "bg-accent text-accent-ink" : "bg-ink text-canvas")}>
                {statusLabel}
              </span>
            </div>
            <RoundResult round={g.lastRound} visible={g.phase === "result"} onNext={shared ? () => {} : g.nextRound} unit={unit} hideNext={shared} />
          </div>

          {shared && (
            <div className="flex items-center justify-between gap-4">
              <RecentNumbers numbers={g.recent} size="sm" max={isMobile ? 8 : 14} />
              <span className="text-[11px] tnum text-muted">Round #{g.roundId}</span>
            </div>
          )}

          <div className="mt-2 lg:mt-6">
            <RouletteBoard bets={g.bets} onBet={g.addBet} onRemove={g.removeBet} disabled={!bettingOpen} vertical={isMobile} winning={g.phase === "result" ? g.lastRound?.result ?? null : null} practice={practice} externalHighlight={railHighlight} />
            <ChipSelector className="mt-5" value={g.selectedChip} onChange={g.selectChip} onClear={g.clear} onUndo={g.undo} onRepeat={g.repeat} onDouble={g.double} onMaxSafe={() => g.maxSafe()} disabled={!bettingOpen} canUndo={g.history.length > 0} canRepeat={!!g.lastBets} hasBets={placed.length > 0} practice={practice} />
          </div>
        </div>

        {/* RIGHT */}
        <aside className="order-2 lg:order-3">
          <div className="flex flex-col gap-4 lg:sticky lg:top-24">
            <BetSlip bets={placed} totalWager={total} liability={liability} balance={g.balance} phase={g.phase} onPlace={g.placeBets} onRemove={g.removeBet} error={g.error} practice={practice} maxRoundExposure={safe.maxRoundExposure} locked={g.betsLocked} shared={shared} />
            <AgentSeatPanel owner={practice ? "practice" : selfAddress} tableId={config.tableId ?? config.mode} balance={g.balance} shared={shared} practice={practice} />
            {shared ? (
              <>
                <RecentWinners winners={live.recentWinners} className="rounded-2xl border border-border bg-surface p-5 dark:bg-elevated" />
                {config.inviteCode && <ShareTable code={config.inviteCode} />}
                <FairnessProof commitment={g.commitment} reveal={g.phase === "result" ? g.lastRound?.reveal : null} compact />
              </>
            ) : (
              <>
                <p className="text-center text-[11.5px] text-muted">
                  {practice ? <>Ready for the real table? <Link href="/cashier" className="underline underline-offset-2">Get chips</Link></> : <>Need more chips? <Link href="/cashier" className="underline underline-offset-2">Open the cashier</Link></>}
                </p>
                <FairnessProof commitment={g.commitment} reveal={g.phase === "result" ? g.lastRound?.reveal : null} compact className="lg:hidden" />
              </>
            )}
          </div>
        </aside>
      </div>

      {/* mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-canvas/90 p-3 backdrop-blur-md lg:hidden" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] text-muted">
            <div className="tnum"><span className="font-medium text-ink">{formatNumber(total)}</span> wagered</div>
            <div className="tnum">Balance {formatNumber(g.balance)}</div>
          </div>
          <Button size="lg" variant={bettingOpen && !g.betsLocked ? "accent" : "outline"} disabled={!bettingOpen || placed.length === 0 || g.betsLocked} onClick={g.placeBets} className="min-w-[160px]">
            {bettingOpen ? (g.betsLocked ? "Bets in" : shared ? "Lock bets" : "Place bet") : g.phase === "closed" ? "Closed" : spinning ? "Spinning…" : "Settled"}
          </Button>
        </div>
      </div>
    </div>
  );
}
