"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/badge";
import { useCreatedTables } from "@/store/created-tables";
import { useWallet } from "@/store/wallet";
import { WalletButton } from "@/components/layout/wallet-button";
import { getMaximumSafeBet } from "@/lib/risk/engine";
import { demoTreasury, type TableSpeed } from "@/lib/demo/data";
import { cn, formatNumber } from "@/lib/utils";

const steps = ["Name", "Type", "Limits", "Speed", "Create"] as const;

function code() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => a[b % a.length]).join("");
}

export function CreateTableWizard() {
  const router = useRouter();
  const add = useCreatedTables((s) => s.add);
  const wallet = useWallet();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [minBet, setMinBet] = useState(1);
  const [maxBet, setMaxBet] = useState(10);
  const [seats, setSeats] = useState(6);
  const [speed, setSpeed] = useState<TableSpeed>("standard");

  const safe = getMaximumSafeBet(demoTreasury, 35);
  const systemMax = Math.max(1, Math.floor(safe.maxStake));
  const limitsOk = minBet >= 1 && maxBet >= minBet && maxBet <= systemMax;

  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const canNext = step === 0 ? name.trim().length >= 2 : step === 2 ? limitsOk : true;

  const create = () => {
    const invite = code();
    const id = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${invite.slice(0, 4).toLowerCase()}`;
    add({ id, name: name.trim(), visibility, inviteCode: invite, minBet, maxBet, seats, speed, createdAt: Date.now(), host: wallet.address ?? "demo" });
    router.push(`/table/${invite}`);
  };

  const field = "h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] outline-none transition-colors focus:border-ink dark:bg-elevated";

  return (
    <div className="container-edge py-16 md:py-24">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <Eyebrow className="block">Create a table</Eyebrow>
          <DemoBadge />
        </div>
        <h1 className="font-display mt-4 text-display-md text-balance">Open your own wheel.</h1>

        <ol className="mt-10 flex items-center gap-2" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[12px] tnum transition-colors", i < step ? "bg-ink text-canvas" : i === step ? "bg-accent text-accent-ink" : "border border-border text-muted")} aria-current={i === step ? "step" : undefined}>
                {i + 1}
              </span>
              <span className={cn("hidden text-[12.5px] sm:inline", i === step ? "text-ink" : "text-muted")}>{s}</span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-5 bg-hairline" aria-hidden />}
            </li>
          ))}
        </ol>

        <div className="mt-10 min-h-[260px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
              {step === 0 && (
                <div>
                  <label htmlFor="table-name" className="eyebrow mb-3 block">Table name</label>
                  <input id="table-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={28} placeholder="e.g. Late shift" className={field} autoFocus />
                  <p className="mt-2 text-[12.5px] text-muted">Shown to everyone at the table and in Explore if public.</p>
                </div>
              )}
              {step === 1 && (
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Table type">
                  {(
                    [
                      ["public", "Public", "Listed in Explore. Anyone can sit."],
                      ["private", "Private", "Invite link only. Not listed anywhere."],
                    ] as const
                  ).map(([v, t, d]) => (
                    <button key={v} type="button" role="radio" aria-checked={visibility === v} onClick={() => setVisibility(v)} className={cn("rounded-2xl border p-5 text-left transition-colors", visibility === v ? "border-ink bg-surface dark:bg-elevated" : "border-border hover:border-border-strong")}>
                      <div className="font-display text-2xl">{t}</div>
                      <div className="mt-1 text-[13px] text-muted">{d}</div>
                    </button>
                  ))}
                </div>
              )}
              {step === 2 && (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="min" className="eyebrow mb-3 block">Minimum bet</label>
                    <input id="min" type="number" min={1} value={minBet} onChange={(e) => setMinBet(Number(e.target.value))} className={field} />
                  </div>
                  <div>
                    <label htmlFor="max" className="eyebrow mb-3 block">Maximum bet</label>
                    <input id="max" type="number" min={1} max={systemMax} value={maxBet} onChange={(e) => setMaxBet(Number(e.target.value))} className={cn(field, !limitsOk && "border-casino-red")} aria-invalid={!limitsOk} aria-describedby="max-help" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="seats" className="eyebrow mb-3 block">Seats · {seats}</label>
                    <input id="seats" type="range" min={2} max={12} value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                  </div>
                  <p id="max-help" className={cn("text-[12.5px] sm:col-span-2", limitsOk ? "text-muted" : "text-casino-red")}>
                    System cap right now: <span className="tnum font-medium text-ink">{systemMax} chips</span> per straight bet, derived from available treasury ({formatNumber(safe.availableBankroll, { maximumFractionDigits: 0 })}) and the per-round exposure cap. Tables can&apos;t exceed it.
                  </p>
                </div>
              )}
              {step === 3 && (
                <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Round speed">
                  {(
                    [
                      ["relaxed", "Relaxed", "35s betting"],
                      ["standard", "Standard", "20s betting"],
                      ["fast", "Fast", "12s betting"],
                    ] as const
                  ).map(([v, t, d]) => (
                    <button key={v} type="button" role="radio" aria-checked={speed === v} onClick={() => setSpeed(v)} className={cn("rounded-2xl border p-5 text-left transition-colors", speed === v ? "border-ink bg-surface dark:bg-elevated" : "border-border hover:border-border-strong")}>
                      <div className="font-display text-2xl">{t}</div>
                      <div className="mt-1 text-[13px] text-muted">{d}</div>
                    </button>
                  ))}
                </div>
              )}
              {step === 4 && (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-border p-6 text-[14px]">
                  <dt className="text-muted">Name</dt><dd className="font-display text-2xl">{name}</dd>
                  <dt className="text-muted">Type</dt><dd className="capitalize">{visibility}</dd>
                  <dt className="text-muted">Limits</dt><dd className="tnum">{minBet} – {maxBet} chips</dd>
                  <dt className="text-muted">Seats</dt><dd className="tnum">{seats}</dd>
                  <dt className="text-muted">Speed</dt><dd className="capitalize">{speed}</dd>
                  <dt className="text-muted">Host</dt><dd>{wallet.status === "connected" ? wallet.ensName ?? "you" : <span className="text-muted">connect a wallet</span>}</dd>
                </dl>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-hairline pt-6">
          <Button variant="ghost" onClick={back} disabled={step === 0}>Back</Button>
          {step < steps.length - 1 ? (
            <Button onClick={next} disabled={!canNext}>Continue</Button>
          ) : wallet.status === "connected" ? (
            <Button variant="accent" onClick={create}>Create table</Button>
          ) : (
            <WalletButton />
          )}
        </div>
      </div>
    </div>
  );
}
