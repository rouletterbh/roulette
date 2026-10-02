"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { isHex, type Hex } from "viem";
import { commit, deriveResult } from "@/lib/fairness/commit-reveal";
import { useGame } from "@/store/game";
import { FairnessProof } from "@/components/roulette/fairness-proof";
import { colorOf } from "@/lib/roulette/constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RoundVerifier() {
  const params = useSearchParams();
  const rounds = useGame((s) => s.rounds);
  const requested = params.get("round");
  const found = requested ? rounds.find((r) => String(r.roundId) === requested) : null;

  const [f, setF] = useState({ roundId: "", commitment: "", serverSeed: "", playerSeed: "", blockRef: "", result: "" });
  const [out, setOut] = useState<null | { commitOk: boolean; result: number; resultOk: boolean }>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.trim() });
  const valid = isHex(f.serverSeed) && isHex(f.playerSeed) && isHex(f.blockRef) && isHex(f.commitment) && /^\d+$/.test(f.roundId);

  const verify = () => {
    if (!valid) return;
    const result = deriveResult(f.serverSeed as Hex, f.playerSeed as Hex, f.blockRef as Hex, Number(f.roundId));
    setOut({ commitOk: commit(f.serverSeed as Hex) === f.commitment, result, resultOk: f.result === "" || Number(f.result) === result });
  };
  const prefill = (r: (typeof rounds)[number]) => {
    setF({ roundId: String(r.roundId), commitment: r.reveal.commitment, serverSeed: r.reveal.serverSeed, playerSeed: r.reveal.playerSeed, blockRef: r.reveal.blockReference, result: String(r.result) });
    setOut(null);
  };

  const input = "h-10 w-full rounded-lg border border-border bg-surface px-3 font-mono text-[12px] outline-none focus:border-ink dark:bg-elevated";
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <div>
        <h2 className="font-display mb-2 text-3xl">Verify any round</h2>
        <p className="mb-6 text-[13.5px] text-muted">Paste the published values. The check runs entirely in your browser: nothing is sent anywhere.</p>
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
              <span className="eyebrow mb-1.5 block text-[10px]">{label}</span>
              <input value={f[k]} onChange={set(k)} placeholder={ph} className={input} spellCheck={false} />
            </label>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-4">
          <Button onClick={verify} disabled={!valid}>Verify round</Button>
          {out && (
            <div className="text-[13px]" role="status">
              <span className={out.commitOk ? "text-ink" : "text-casino-red"}>{out.commitOk ? "Commitment matches." : "Commitment does NOT match the seed."}</span>{" "}
              <span>Derived result: <strong>{out.result} {colorOf(out.result).toUpperCase()}</strong>{f.result !== "" && (out.resultOk ? " · matches" : " · DOES NOT match claimed")}</span>
            </div>
          )}
        </div>
      </div>
      <aside>
        <h2 className="eyebrow mb-3">Your recent rounds · this session</h2>
        {rounds.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-muted">Play a round at the practice table and it appears here with a full proof.</p>
        ) : (
          <ul className="space-y-2">
            {rounds.slice(0, 6).map((r) => (
              <li key={r.roundId}>
                <button type="button" onClick={() => prefill(r)} className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-2.5 text-left text-[13px] hover:border-ink">
                  <span>Round #{r.roundId}</span>
                  <span className="tnum">{r.result} {colorOf(r.result)}</span>
                  <span className={cn("text-[11px] uppercase tracking-[0.12em]", r.reveal.verified ? "text-ink" : "text-casino-red")}>{r.reveal.verified ? "verified" : "mismatch"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {found && <FairnessProof commitment={found.reveal} reveal={found.reveal} className="mt-4" />}
      </aside>
    </div>
  );
}
