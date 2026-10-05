"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGame } from "@/store/game";
import { useChainGame } from "@/store/chain-game";
import { useWallet } from "@/store/wallet";
import { betFromId, type PlacedBet } from "@/lib/roulette/bets";
import { checkWager } from "@/lib/risk/engine";
import { useChipApproval, useChipBalances, useCurrentRound, useEscrow, useRandomnessRound, useTreasurySnapshot } from "@/lib/web3/hooks";
import { enterTableUnits, leaveTable as leaveTableTx, placeBets as placeBetsTx } from "@/lib/web3/actions";
import { useTxFlow } from "@/lib/web3/use-tx-flow";
import { buildChainCommitment, buildChainReveal, chainStatusLabel, planChainSync } from "@/lib/web3/round-sync";
import { BETTING_WINDOW_SECONDS, PAUSE_FLAGS, ROUND_STATUS, contractAddresses, gameContractsReady, resolveChainTableId, selectChips, type ChipBalances } from "@/lib/web3/contracts";
import { TransactionModal } from "@/components/cashier/transaction-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { explorerAddress } from "@/config/chains";
import { formatNumber } from "@/lib/utils";
import { track, bucketAmount } from "@/lib/analytics/events";
import type { GameTableConfig } from "./game-table";

/**
 * ChainGameDriver — rendered by GameTable when demo mode is off and the table is a
 * real-money mode. It owns no game UI of its own; it
 *   (a) mirrors chain round state into the game store (Open → betting, Closed → closed,
 *       Settled → spinning with the chain reveal so the existing wheel/settlement run),
 *   (b) registers live `placeBets` / `leaveTable` handlers on the chain-game bridge store,
 *   (c) renders the enter/leave-table card and the shared TransactionModal.
 * Round open/close/reveal/settle are operator transactions; this component only reads them.
 */
const toPlaced = (bets: Record<string, number>): PlacedBet[] =>
  Object.entries(bets)
    .filter(([, stake]) => stake > 0)
    .flatMap(([id, stake]) => {
      const def = betFromId(id);
      return def ? [{ ...def, stake }] : [];
    });

/** "1 × 50, 2 × 5": what the wallet actually holds, largest first. Chips are fixed denominations and cannot be split. */
function describeChips(balances: ChipBalances): string {
  const parts = (Object.keys(balances) as unknown as Array<keyof ChipBalances>)
    .map((d) => [Number(d), balances[d]] as const)
    .filter(([, n]) => n > 0n)
    .sort((a, b) => b[0] - a[0])
    .map(([d, n]) => `${n.toString()} × ${d}`);
  return parts.length ? parts.join(", ") : "none";
}

/** Below this many seconds left in the (approximate) betting window, the table refuses to start a bet transaction. */
const LATE_BET_GUARD_SECONDS = 10;

/** Seconds until the operator is expected to close bets (approximate: the window is not on chain). */
function useBetsCloseIn(openedAt: number, open: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open || !openedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, openedAt]);
  if (!open || !openedAt) return null;
  return Math.max(0, Math.round(openedAt + BETTING_WINDOW_SECONDS - now / 1000));
}

export function ChainGameDriver({ config }: { config: GameTableConfig }) {
  const router = useRouter();
  const address = useWallet((s) => s.address);
  const tableId = resolveChainTableId(config.tableId);
  const round = useCurrentRound(tableId);
  const { round: rm } = useRandomnessRound(round.roundId);
  const escrow = useEscrow(address);
  const chips = useChipBalances(address);
  const approval = useChipApproval(address);
  const treasury = useTreasurySnapshot();
  const flow = useTxFlow();
  const phase = useGame((s) => s.phase);
  const balance = useGame((s) => s.balance);
  const chainRoundId = useGame((s) => s.chainRoundId);
  const storeCommitment = useGame((s) => s.commitment);
  const submittedBets = useChainGame((s) => s.submittedBets);
  const [enterUnits, setEnterUnits] = useState<string>("");

  const ready = gameContractsReady();
  const gameplayPaused = (treasury.pauseFlags & PAUSE_FLAGS.gameplay) !== 0;
  const escrowUnits = escrow.units;
  const closeIn = useBetsCloseIn(round.openedAt, round.status === ROUND_STATUS.Open);

  // Latest values for the imperative handlers registered on the bridge store.
  const latest = useRef({ round, escrow, chips, approval, treasury, flow, gameplayPaused });
  useEffect(() => {
    latest.current = { round, escrow, chips, approval, treasury, flow, gameplayPaused };
  });

  // (1) Treasury → store, in chip units, so the local risk engine mirrors RiskEngine.checkWager.
  useEffect(() => {
    if (treasury.snapshot) useGame.setState({ treasury: treasury.snapshot });
  }, [treasury.snapshot]);

  // (2) Escrow → table balance. Skipped while a round is in flight: the local settlement math owns
  //     the balance until the wheel lands, then the re-read below reconciles it with the chain.
  useEffect(() => {
    if (!escrow.isFetched || flow.busy) return;
    if (phase === "closed" || phase === "spinning") return;
    if (balance !== escrowUnits) useGame.setState({ balance: escrowUnits });
  }, [escrowUnits, escrow.isFetched, phase, balance, flow.busy]);

  // (3) Fairness data for the current chain round.
  const commitment = useMemo(() => (round.roundId != null ? buildChainCommitment(round.roundId, rm, round.openedAt) : null), [round.roundId, rm, round.openedAt]);
  const reveal = useMemo(() => (round.roundId != null ? buildChainReveal(round.roundId, rm, round.openedAt) : null), [round.roundId, rm, round.openedAt]);

  // (4) Phase sync: pure plan, then apply to the store in order.
  const refetchEscrow = escrow.refetch;
  useEffect(() => {
    if (!round.scanned) return;
    const actions = planChainSync({
      chain: { roundId: round.roundId, status: round.status, result: round.result, openedAt: round.openedAt },
      store: { phase, chainRoundId },
      reveal,
      commitment,
      submittedBets,
    });
    if (actions.length === 0) return;
    for (const a of actions) {
      if (a.type === "open") useChainGame.setState({ submittedBets: {} });
      useGame.getState().setChainRound(a);
    }
    if (actions.some((a) => a.type === "open" || a.type === "idle")) void refetchEscrow();
  }, [round.scanned, round.roundId, round.status, round.result, round.openedAt, phase, chainRoundId, reveal, commitment, submittedBets, refetchEscrow]);

  // (5) Commitment / player seed can land after the round opened.
  useEffect(() => {
    if (phase !== "betting" || chainRoundId == null || !commitment) return;
    if (commitment.roundId !== Number(chainRoundId)) return;
    if (storeCommitment?.commitment !== commitment.commitment || storeCommitment?.playerSeed !== commitment.playerSeed) useGame.setState({ commitment });
  }, [phase, chainRoundId, commitment, storeCommitment]);

  // (6) When the wheel lands, re-read balances so escrow reflects the chain settlement.
  //     Keyed on the phase transition only: refetch identities must never retrigger it.
  useEffect(() => {
    if (phase !== "result") return;
    void latest.current.escrow.refetch();
    void latest.current.treasury.refetch();
  }, [phase]);

  /* ------------------------------------------------------------ handlers */

  const handlePlace = useCallback(() => {
    const L = latest.current;
    const g = useGame.getState();
    if (g.phase !== "betting" || g.chainRoundId == null) return;
    if (L.gameplayPaused) return useGame.setState({ error: "Gameplay is paused by the operator" });
    if (L.round.status !== ROUND_STATUS.Open) return useGame.setState({ error: "The round is not open on chain" });
    // A bet needs a wallet signature and a block; submitting in the last seconds only burns the signature.
    const secondsLeft = L.round.openedAt ? L.round.openedAt + BETTING_WINDOW_SECONDS - Date.now() / 1000 : Infinity;
    if (secondsLeft < LATE_BET_GUARD_SECONDS) return useGame.setState({ error: "Too late for this round: bets are about to close. Your slip is kept; place it when the next round opens." });
    const submitted = useChainGame.getState().submittedBets;
    const reduced = Object.entries(submitted).some(([id, stake]) => (g.bets[id] ?? 0) < stake);
    if (reduced) {
      const restored = { ...g.bets };
      for (const [id, stake] of Object.entries(submitted)) restored[id] = Math.max(restored[id] ?? 0, stake);
      return useGame.setState({ error: "Bets already placed on chain can't be reduced", bets: restored, history: [] });
    }
    const delta: Record<string, number> = {};
    for (const [id, stake] of Object.entries(g.bets)) {
      const d = stake - (submitted[id] ?? 0);
      if (d > 0) delta[id] = d;
    }
    const placed = toPlaced(delta);
    if (placed.length === 0) return useGame.setState({ betsLocked: true, error: null });
    const check = checkWager(g.treasury, toPlaced(g.bets));
    if (!check.ok) return useGame.setState({ error: check.reason ?? "Table limit reached" });
    const total = placed.reduce((s, b) => s + b.stake, 0);
    if (total > g.balance) return useGame.setState({ error: "Not enough chips at the table" });
    const roundId = g.chainRoundId;
    const snapshot = { ...g.bets };
    L.flow.open({
      title: "Place bets",
      summary: [
        ["Round", `#${roundId.toString()}`],
        ["Bets", `${placed.length}${Object.keys(submitted).length ? " new" : ""}`],
        ["Stake", `${formatNumber(total)} chips`],
        ["Max net payout", `${formatNumber(check.maxNetPayout)} chips`],
      ],
      run: (report) => placeBetsTx(roundId, placed, report),
      onSuccess: async () => {
        useChainGame.setState({ submittedBets: snapshot });
        const now = useGame.getState();
        useGame.setState({ betsLocked: true, error: null, balance: Math.max(0, now.balance - total) });
        track("bet_submit", { mode: now.mode, bets: placed.length, amount: bucketAmount(total) });
        await latest.current.escrow.refetch();
      },
    });
  }, []);

  const openLeave = useCallback(
    (navigateTo: string | null) => {
      const L = latest.current;
      const units = L.escrow.escrow;
      if (units === 0n) {
        if (navigateTo) router.push(navigateTo);
        return;
      }
      const g = useGame.getState();
      const inFlight = g.phase === "closed" || g.phase === "spinning" || (g.phase === "betting" && g.betsLocked);
      L.flow.open({
        title: navigateTo ? "Leave table" : "Cash out",
        summary: [
          ["Chips to wallet", `${formatNumber(Number(units))}`],
          ["Method", "leaveTable · mints escrow back as chips"],
          ...(inFlight ? ([["Note", "Bets already placed stay in the round; winnings return to escrow"]] as Array<[string, string]>) : []),
        ],
        run: (report) => leaveTableTx(units, report),
        onSuccess: async () => {
          await Promise.all([latest.current.escrow.refetch(), latest.current.chips.refetch()]);
          if (navigateTo) router.push(navigateTo);
        },
      });
    },
    [router],
  );

  const handleLeave = useCallback(() => openLeave(config.mode === "quick" ? "/play" : "/tables"), [openLeave, config.mode]);

  const openEnter = useCallback(
    (units: number | undefined) => {
      const L = latest.current;
      const amount = units ?? L.chips.units;
      L.flow.open({
        title: "Enter table",
        needsApproval: !L.approval.approved,
        summary: [
          ["Chips to escrow", `${formatNumber(amount)}`],
          ["Table", config.name],
          ["Method", "enterTable · chips burn into escrow, Leave table mints them back"],
        ],
        run: (report) => enterTableUnits(L.chips.balances, units, report),
        onSuccess: async () => {
          await Promise.all([latest.current.escrow.refetch(), latest.current.chips.refetch(), latest.current.approval.refetch()]);
          setEnterUnits("");
        },
      });
    },
    [config.name],
  );

  // (7) Register the live handlers on the bridge store for GameTable.
  const bridgeReady = ready && treasury.isFetched && round.scanned && escrow.isFetched;
  useEffect(() => {
    useChainGame.setState({ active: true, ready: bridgeReady, placeBets: handlePlace, leaveTable: handleLeave });
  }, [bridgeReady, handlePlace, handleLeave]);
  useEffect(() => () => useChainGame.getState().reset(), []);

  /* ---------------------------------------------------------------- view */

  if (!ready) {
    return (
      <div className="mb-6 rounded-2xl border border-casino-red/40 bg-surface p-4 text-[13px] dark:bg-elevated" role="alert">
        Contract addresses are not configured for this build (NEXT_PUBLIC_ROULETTE_GAME_ADDRESS / TREASURY / CHIP1155). Live play is unavailable; <Link href="/play/practice" className="underline underline-offset-2">practice</Link> still works.
      </div>
    );
  }

  const parsedEnter = enterUnits === "" ? undefined : Math.max(0, Math.floor(Number(enterUnits)));
  // Chips are whole denominations: an amount the wallet's chips cannot make exactly cannot be escrowed.
  const enterSel = parsedEnter != null && parsedEnter > 0 && parsedEnter <= chips.units ? selectChips(chips.balances, parsedEnter) : null;
  const enterInexact = enterSel != null && !enterSel.exact;
  const enterDisabled = chips.units === 0 || flow.busy || enterInexact || (parsedEnter != null && (parsedEnter <= 0 || parsedEnter > chips.units));
  const label = chainStatusLabel(round.status, round.roundId != null);

  return (
    <>
      <section className="mb-6 rounded-2xl border border-border bg-surface p-4 dark:bg-elevated" aria-label="Onchain table status">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={round.status === ROUND_STATUS.Open ? "accent" : "outline"}>Onchain</Badge>
            <span className="text-muted">{round.scanned ? label : "Reading chain state…"}</span>
            {round.roundId != null && (
              <span className="tnum text-muted">
                · round #{round.roundId.toString()} · {round.betCount} {round.betCount === 1 ? "bet" : "bets"}
              </span>
            )}
            {closeIn != null && (
              <span className="tnum text-muted" aria-live="polite">
                · {closeIn < LATE_BET_GUARD_SECONDS ? "closing: too late to bet this round" : `bets close in about ${closeIn}s`}
              </span>
            )}
            {gameplayPaused && <Badge tone="red">Gameplay paused</Badge>}
            {treasury.isFetched && !treasury.isSolvent && <Badge tone="red">Treasury insolvent</Badge>}
          </div>
          {contractAddresses.game && (
            <a href={explorerAddress(contractAddresses.game)} target="_blank" rel="noreferrer" className="text-muted underline-offset-2 hover:underline">
              Contract ↗
            </a>
          )}
        </div>

        {escrow.isFetched && escrow.escrow === 0n ? (
          <div className="mt-4 border-t border-hairline pt-4">
            {chips.units === 0 && chips.enabled && !chips.isLoading ? (
              <p className="text-[13.5px]">
                No chips in your wallet yet. <Link href="/cashier" className="underline underline-offset-2">Get chips at the cashier</Link> to sit down.
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[180px] flex-1">
                  <label htmlFor="enter-units" className="eyebrow mb-1.5 block">
                    Chips to bring to the table
                  </label>
                  <input
                    id="enter-units"
                    type="number"
                    min={1}
                    max={chips.units}
                    placeholder={`All (${formatNumber(chips.units)})`}
                    value={enterUnits}
                    onChange={(e) => setEnterUnits(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-canvas px-3 text-[16px] tnum outline-none focus:border-ink"
                  />
                </div>
                <Button variant="accent" disabled={enterDisabled} onClick={() => openEnter(parsedEnter)}>
                  Enter table
                </Button>
                <p className="basis-full text-[12px] text-muted">
                  {approval.approved ? "One signature: chips move into escrow." : "Two signatures: approve the treasury once, then escrow chips."} Wallet holds {formatNumber(chips.units)} chips ({describeChips(chips.balances)}).
                </p>
                {enterInexact && (
                  <p className="basis-full text-[12.5px] text-casino-red" role="alert">
                    Chips come in 1, 5, 10, 25, 50 and 100 and cannot be split, so your wallet cannot make exactly {formatNumber(parsedEnter ?? 0)}.{" "}
                    {enterSel && enterSel.units > 0 ? `The closest it can make is ${formatNumber(enterSel.units)}. ` : ""}
                    Leave the field empty to bring all {formatNumber(chips.units)}: you only stake what you bet, and Cash out returns the rest as smaller chips.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          escrow.isFetched && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-[13px]">
              <span>
                <span className="font-medium tnum">{formatNumber(escrow.units)}</span> chips at the table · <span className="tnum">{formatNumber(chips.units)}</span> in wallet
              </span>
              <div className="flex gap-2">
                {chips.units > 0 && (
                  <Button size="sm" variant="outline" disabled={flow.busy} onClick={() => openEnter(undefined)}>
                    Add all chips
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={flow.busy} onClick={() => openLeave(null)}>
                  Cash out
                </Button>
              </div>
            </div>
          )
        )}
        {round.error && <p className="mt-3 text-[12px] text-casino-red">Chain read failed: {round.error.message}</p>}
      </section>
      <TransactionModal {...flow.modalProps} />
    </>
  );
}
