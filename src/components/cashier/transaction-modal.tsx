"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { explorerTx } from "@/config/chains";
import { cn } from "@/lib/utils";

/**
 * Transaction modal state machine:
 * review → approve → confirm-wallet → submitted → confirming → complete | failed
 * Pass `step` from the caller; the modal is purely presentational.
 */
export type TxStep = "review" | "approve" | "confirm-wallet" | "submitted" | "confirming" | "complete" | "failed";

const ORDER: TxStep[] = ["review", "approve", "confirm-wallet", "submitted", "confirming", "complete"];
const LABELS: Record<TxStep, string> = {
  review: "Review",
  approve: "Approve",
  "confirm-wallet": "Confirm in wallet",
  submitted: "Submitted",
  confirming: "Confirming",
  complete: "Complete",
  failed: "Failed",
};

export function TransactionModal({
  open,
  step,
  title,
  summary,
  hash,
  error,
  onClose,
  onConfirm,
  needsApproval = false,
  gasEstimate,
}: {
  open: boolean;
  step: TxStep;
  title: string;
  summary: Array<[string, React.ReactNode]>;
  hash?: string | null;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  needsApproval?: boolean;
  gasEstimate?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (step === "review" || step === "complete" || step === "failed") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, onClose]);

  const steps = needsApproval ? ORDER : ORDER.filter((s) => s !== "approve");
  const idx = step === "failed" ? -1 : steps.indexOf(step);
  const busy = step === "confirm-wallet" || step === "submitted" || step === "confirming";

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="tx-title">
          <motion.div initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, scale: 0.98 }} transition={{ type: "spring", stiffness: 420, damping: 34 }} className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg dark:bg-elevated">
            <div className="flex items-start justify-between gap-4">
              <h2 id="tx-title" className="font-display text-2xl">{title}</h2>
              {!busy && <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">×</button>}
            </div>

            <ol className="mt-5 flex items-center gap-1.5" aria-label="Transaction progress">
              {steps.map((s, i) => (
                <li key={s} className="flex flex-1 flex-col gap-1.5">
                  <span className={cn("h-1 rounded-full transition-colors", step === "failed" ? "bg-casino-red/50" : i < idx ? "bg-ink" : i === idx ? "bg-accent" : "bg-hairline")} />
                  <span className={cn("hidden text-[10px] uppercase tracking-[0.1em] sm:block", i === idx ? "text-ink" : "text-faint")}>{LABELS[s]}</span>
                </li>
              ))}
            </ol>

            <dl className="mt-6 divide-y divide-hairline text-[13.5px]">
              {summary.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-2.5"><dt className="text-muted">{k}</dt><dd className="tnum text-right">{v}</dd></div>
              ))}
              {gasEstimate && <div className="flex items-center justify-between py-2.5"><dt className="text-muted">Estimated gas</dt><dd className="tnum">{gasEstimate}</dd></div>}
            </dl>

            <div className="mt-6 min-h-[44px] text-[13.5px]" aria-live="polite">
              {step === "review" && <p className="text-muted">You&apos;ll be asked to confirm in your wallet. Nothing moves until you sign.</p>}
              {step === "approve" && <p className="text-muted">Approve the token allowance first, then confirm the transaction.</p>}
              {step === "confirm-wallet" && <p className="flex items-center gap-2"><Spinner />Waiting for your signature…</p>}
              {step === "submitted" && <p className="flex items-center gap-2"><Spinner />Submitted to Robinhood Chain.</p>}
              {step === "confirming" && <p className="flex items-center gap-2"><Spinner />Confirming…</p>}
              {step === "complete" && <p className="font-medium">Complete.</p>}
              {step === "failed" && <p className="text-casino-red">{error ?? "Transaction failed."}</p>}
              {hash && (
                <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12.5px] text-muted underline underline-offset-2 hover:text-ink">View on explorer ↗</a>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              {step === "review" && <Button variant="accent" className="w-full" onClick={onConfirm}>Confirm</Button>}
              {step === "approve" && <Button className="w-full" onClick={onConfirm}>Approve</Button>}
              {(step === "complete" || step === "failed") && <Button variant="outline" className="w-full" onClick={onClose}>{step === "failed" ? "Close" : "Done"}</Button>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-border border-t-ink" aria-hidden />;
}

/** Simulated transaction lifecycle for demo mode. Resolves with a fake hash. */
export async function simulateTx(setStep: (s: TxStep) => void, opts: { approval?: boolean; fail?: boolean } = {}): Promise<string> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  if (opts.approval) {
    setStep("approve");
    await wait(600);
  }
  setStep("confirm-wallet");
  await wait(1200);
  if (opts.fail) {
    setStep("failed");
    throw new Error("Transaction rejected");
  }
  setStep("submitted");
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const hash = `0x${Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  await wait(900);
  setStep("confirming");
  await wait(1400);
  setStep("complete");
  return hash;
}
