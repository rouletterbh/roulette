"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import type { TxStep } from "@/components/cashier/transaction-modal";
import type { TxReporter } from "./actions";
import { toTxError } from "./errors";

/**
 * Drives the 7-state TransactionModal with a real chain action. Callers `open()` a
 * spec; the modal's Confirm button runs `spec.run(report)`, which reports steps as
 * the wallet signs and the receipt lands. Spread `modalProps` onto <TransactionModal>.
 */
export interface TxSpec {
  title: string;
  summary: Array<[string, ReactNode]>;
  needsApproval?: boolean;
  gasEstimate?: string;
  run: (report: TxReporter) => Promise<Hex>;
  onSuccess?: (hash: Hex) => void | Promise<void>;
  onClose?: () => void;
}

export function useTxFlow() {
  const [spec, setSpec] = useState<TxSpec | null>(null);
  const [step, setStep] = useState<TxStep>("review");
  const [hash, setHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = useCallback((s: TxSpec) => {
    setSpec(s);
    setStep("review");
    setHash(null);
    setError(null);
    setBusy(false);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    spec?.onClose?.();
    setSpec(null);
  }, [busy, spec]);

  const confirm = useCallback(async () => {
    if (!spec || busy) return;
    setBusy(true);
    setError(null);
    const report: TxReporter = (s, ctx) => {
      setStep(s);
      if (ctx?.hash) setHash(ctx.hash);
    };
    try {
      const h = await spec.run(report);
      setHash(h);
      await spec.onSuccess?.(h);
    } catch (e) {
      setError(toTxError(e).message);
      setStep("failed");
    } finally {
      setBusy(false);
    }
  }, [spec, busy]);

  return {
    open,
    close,
    isOpen: !!spec,
    step,
    hash,
    error,
    busy,
    modalProps: {
      open: !!spec,
      step,
      title: spec?.title ?? "",
      summary: spec?.summary ?? [],
      hash,
      error,
      needsApproval: spec?.needsApproval,
      gasEstimate: spec?.gasEstimate,
      onClose: close,
      onConfirm: () => void confirm(),
    },
  };
}
