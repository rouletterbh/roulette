"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { isHex, keccak256, concatHex, toHex, type Hex } from "viem";
import { commit, deriveResult } from "@/lib/fairness/commit-reveal";
import { useGame } from "@/store/game";
import { FairnessProof } from "@/components/roulette/fairness-proof";
import { colorOf } from "@/lib/roulette/constants";
import { Button } from "@/components/ui/button";
import { VerificationPipeline, PIPELINE_STAGES } from "./verification-pipeline";
import { HashTrace } from "./hash-trace";
import { cn } from "@/lib/utils";

type Out = { commitOk: boolean; result: number; resultOk: boolean; hash: Hex; computedCommitment: Hex };
const short = (h: string) => (h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);
const STEP_MS = 260;

export function RoundVerifier() {
  const params = useSearchParams();
  const rounds = useGame((s) => s.rounds);
  const requested = params.get("round");
  const found = requested ? rounds.find((r) => String(r.roundId) === requested) : null;
  const reduce = useReducedMotion();

  const [f, setF] = useState({ roundId: "", commitment: "", serverSeed: "", playerSeed: "", blockRef: "", result: "" });
  const [out, setOut] = useState<Out | null>(null);
  const [stage, setStage] = useState(-1);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => clearTimeout(id)), []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.trim() });
  const valid = isHex(f.serverSeed) && isHex(f.playerSeed) && isHex(f.blockRef) && isHex(f.commitment) && /^\d+$/.test(f.roundId);

  const verify = () => {
    if (!valid) return;
    const serverSeed = f.serverSeed as Hex;
    const playerSeed = f.playerSeed as Hex;
    const blockRef = f.blockRef as Hex;
    const roundId = Number(f.roundId);
    const result = deriveResult(serverSeed, playerSeed, blockRef, roundId);
    const hash = keccak256(concatHex([serverSeed, playerSeed, blockRef, toHex(BigInt(roundId), { size: 32 })]));
    const computedCommitment = commit(serverSeed);
    setOut({ commitOk: computedCommitment === f.commitment, result, resultOk: f.result === "" || Number(f.result) === result, hash, computedCommitment });
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
    if (reduce) {
      setStage(PIPELINE_STAGES.length - 1);
      return;
    }
    setStage(0);
    for (let i = 1; i < PIPELINE_STAGES.length; i++) timers.current.push(window.setTimeout(() => setStage(i), i * STEP_MS));
  };

  const prefill = (r: (typeof rounds)[number]) => {
    setF({ roundId: String(r.roundId), commitment: r.reveal.commitment, serverSeed: r.reveal.serverSeed, playerSeed: r.reveal.playerSeed, blockRef: r.reveal.blockReference, result: String(r.result) });
    setOut(null);
    setStage(-1);
  };

  const ok = out ? out.commitOk && out.resultOk : null;
  const values = out
    ? {
        Commit: short(f.commitment),
        Lock: `#${f.roundId} · ${short(f.playerSeed)}`,
        Reveal: `${short(f.serverSeed)} · ${out.commitOk ? "hashes to commitment" : "commitment mismatch"}`,
        Hash: short(out.hash),
        Result: `${out.result} ${colorOf(out.result).toUpperCase()}${f.result !== "" ? (out.resultOk ? " · claimed ✓" : ` · claimed ${f.result} ✗`) : ""}`,
        Verified: ok ? "VERIFIED" : "MISMATCH",
      }
    : undefined;
  const failed = out ? { Reveal: !out.commitOk, Result: !out.resultOk, Verified: !ok } : undefined;

  const input = "h-10 w-full border border-border bg-surface px-3 font-mono text-[12px] outline-none transition-colors focus:border-ink dark:bg-elevated";

  return (
    <div>
      {/* Pipeline */}
      <section className="mt-14 border-y border-hairline py-8" aria-label="Commit–reveal pipeline">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <span className="microlabel !text-ink">Pipeline · commit → reveal → verify</span>
          <span className="microlabel tnum" role="status">
            {stage < 0 ? "idle · waiting for input" : stage < PIPELINE_STAGES.length - 1 ? `stage 0${stage + 1} / 06` : ok ? "verified · all stages match" : "mismatch · see red stage"}
          </span>
        </div>
        <VerificationPipeline stage={stage} values={values} failed={failed} />
      </section>

      {/* Verifier */}
      <section className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="font-display text-2xl md:text-3xl">Verify any round</h2>
            <span className="microlabel">01 / Verifier</span>
          </div>
          <p className="mt-2 mb-6 text-[13.5px] text-muted">Paste the published values. The check runs entirely in your browser: nothing is sent anywhere.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["roundId", "Round id", "23821"],
                ["result", "Claimed result (optional)", "17"],
                ["commitment", "Server commitment", "0x…"],
                ["serverSeed", "Server seed (revealed)", "0x…"],
                ["playerSeed", "Player seed", "0x…"],
                ["blockRef", "Block reference", "0x…"],
              ] as const
            ).map(([k, label, ph]) => (
              <label key={k} className={cn("block", (k === "commitment" || k === "serverSeed" || k === "playerSeed" || k === "blockRef") && "sm:col-span-2")}>
                <span className="microlabel mb-1.5 block">{label}</span>
                <input value={f[k]} onChange={set(k)} placeholder={ph} className={input} spellCheck={false} />
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button onClick={verify} disabled={!valid}>
              Verify round
            </Button>
            {out && (
              <div className="font-mono text-[12px] leading-relaxed" role="status">
                <span className={out.commitOk ? "text-ink" : "text-casino-red"}>{out.commitOk ? "Commitment matches." : "Commitment does NOT match the seed."}</span>{" "}
                <span className="text-ink-2">
                  Derived result: <strong className="font-medium text-ink">{out.result} {colorOf(out.result).toUpperCase()}</strong>
                  {f.result !== "" && (out.resultOk ? " · matches" : " · DOES NOT match claimed")}
                </span>
              </div>
            )}
          </div>

          {out && valid && (
            <HashTrace className="mt-8" serverSeed={f.serverSeed as Hex} playerSeed={f.playerSeed as Hex} blockRef={f.blockRef as Hex} roundId={Number(f.roundId)} hash={out.hash} result={out.result} commitment={f.commitment as Hex} computedCommitment={out.computedCommitment} stage={stage} />
          )}
        </div>

        <aside className="min-w-0">
          <div className="flex items-baseline justify-between border-t border-border pt-4">
            <h2 className="microlabel !text-ink">Your recent rounds</h2>
            <span className="microlabel">this session</span>
          </div>
          {rounds.length === 0 ? (
            <p className="mt-4 border border-dashed border-border p-5 text-[13px] text-muted">Play a round at the practice table and it appears here with a full proof.</p>
          ) : (
            <ul className="mt-2 divide-y divide-hairline border-b border-hairline">
              {rounds.slice(0, 6).map((r) => (
                <li key={r.roundId}>
                  <button type="button" onClick={() => prefill(r)} className="grid w-full grid-cols-[1fr_auto_auto] items-baseline gap-4 py-3 text-left text-[13px] transition-colors hover:text-ink">
                    <span className="font-mono text-[12px] tnum">Round #{r.roundId}</span>
                    <span className="font-mono text-[12px] tnum">
                      {r.result} {colorOf(r.result)}
                    </span>
                    <span className={cn("microlabel", r.reveal.verified ? "!text-ink" : "!text-casino-red")}>{r.reveal.verified ? "verified" : "mismatch"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {found && <FairnessProof commitment={found.reveal} reveal={found.reveal} className="mt-4" />}
        </aside>
      </section>
    </div>
  );
}
