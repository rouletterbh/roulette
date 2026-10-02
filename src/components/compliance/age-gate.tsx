"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { siteConfig } from "@/config/site";
import { jurisdictionNotice } from "@/config/jurisdictions";

/**
 * Age + terms gate for real-money routes. Confirmation lives in localStorage
 * under "age-gate". Bump TERMS_VERSION to re-prompt everyone after a change to
 * the Terms. Not wired into any layout yet: wrap a route's content with
 * `<AgeGate>` when real-money play is enabled for a jurisdiction.
 */
export const AGE_GATE_KEY = "age-gate";
export const TERMS_VERSION = "draft-1";

interface AgeGateRecord {
  confirmedAt: number;
  termsVersion: string;
}

type Status = "unknown" | "confirmed" | "pending";

const listeners = new Set<() => void>();
let cached: Status = "unknown";

function readRecord(): AgeGateRecord | null {
  try {
    const raw = window.localStorage.getItem(AGE_GATE_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<AgeGateRecord>;
    return typeof r.confirmedAt === "number" && typeof r.termsVersion === "string" ? (r as AgeGateRecord) : null;
  } catch {
    return null;
  }
}
function compute(): Status {
  const r = readRecord();
  return r && r.termsVersion === TERMS_VERSION ? "confirmed" : "pending";
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === AGE_GATE_KEY) {
      cached = compute();
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}
function getSnapshot(): Status {
  if (cached === "unknown") cached = compute();
  return cached;
}
function getServerSnapshot(): Status {
  return "unknown";
}
function emit() {
  for (const l of listeners) l();
}

export function confirmAgeGate() {
  try {
    const rec: AgeGateRecord = { confirmedAt: Date.now(), termsVersion: TERMS_VERSION };
    window.localStorage.setItem(AGE_GATE_KEY, JSON.stringify(rec));
  } catch {
    /* storage unavailable: still unlock for this tab */
  }
  cached = "confirmed";
  emit();
}

export function resetAgeGate() {
  try {
    window.localStorage.removeItem(AGE_GATE_KEY);
  } catch {
    /* ignore */
  }
  cached = "pending";
  emit();
}

/** `confirmed` once the viewer has affirmed 18+ and accepted the current Terms. */
export function useAgeGate(): Status {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function AgeGate({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const status = useAgeGate();
  if (status === "confirmed") return <>{children}</>;
  if (status === "unknown") return <>{fallback ?? <div className="min-h-[40vh]" aria-busy="true" />}</>;
  return <AgeGatePrompt />;
}

function AgeGatePrompt() {
  const id = useId();
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const ok = adult && terms;
  return (
    <div className="container-edge py-16 md:py-24">
      <form
        className="max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) confirmAgeGate();
        }}
      >
        <Eyebrow className="mb-4 block">Before you continue</Eyebrow>
        <h1 className="font-display text-display-md text-balance">Real-money tables are for adults only.</h1>
        <p className="mt-5 max-w-md text-base text-muted">
          {siteConfig.name} needs two confirmations before showing anything that can move money. Practice mode does not require them.
        </p>

        <fieldset className="mt-10 divide-y divide-hairline hairline-t hairline-b">
          <legend className="sr-only">Confirmations</legend>
          <label htmlFor={`${id}-age`} className="flex cursor-pointer items-start gap-4 py-5">
            <input id={`${id}-age`} type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--ink)]" />
            <span className="text-[15px] leading-relaxed">
              I am at least 18 years old, or the minimum legal age for this activity where I live, whichever is higher.
            </span>
          </label>
          <label htmlFor={`${id}-terms`} className="flex cursor-pointer items-start gap-4 py-5">
            <input id={`${id}-terms`} type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--ink)]" />
            <span className="text-[15px] leading-relaxed">
              I have read and accept the{" "}
              <Link href="/terms" className="underline underline-offset-2">
                Terms
              </Link>
              ,{" "}
              <Link href="/risk-disclosure" className="underline underline-offset-2">
                Risk Disclosure
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        </fieldset>

        <p className="mt-6 text-[13px] leading-relaxed text-muted">{jurisdictionNotice}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="lg" disabled={!ok}>
            Continue
          </Button>
          <Button href="/play/practice" variant="ghost" size="lg">
            Go to practice instead
          </Button>
        </div>
      </form>
    </div>
  );
}
