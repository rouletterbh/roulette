/**
 * Jurisdiction gate configuration.
 *
 * This file is the single source of truth for where real-money play may be
 * offered. Nothing here is a legal determination: every entry is
 * `pending-review` until counsel confirms availability for that region and an
 * engineer flips it, together with a `reviewedAt` date and a reference.
 *
 * `practice` only describes the free practice table (no money, no rewards).
 */
export type JurisdictionStatus = "enabled" | "restricted" | "pending-review";

export interface Jurisdiction {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  name: string;
  status: JurisdictionStatus;
  /** True only when counsel has confirmed real-money play may be offered. */
  realMoney: boolean;
  /** Free practice mode (no money, no rewards). */
  practice: boolean;
  note?: string;
}

const PENDING = "Not yet reviewed by counsel. Real-money play is not offered.";

export const jurisdictions: Jurisdiction[] = [
  { code: "US", name: "United States", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "CA", name: "Canada", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "GB", name: "United Kingdom", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "DE", name: "Germany", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "FR", name: "France", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "NL", name: "Netherlands", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "AU", name: "Australia", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "SG", name: "Singapore", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "JP", name: "Japan", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "BR", name: "Brazil", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "IN", name: "India", status: "pending-review", realMoney: false, practice: true, note: PENDING },
  { code: "AE", name: "United Arab Emirates", status: "pending-review", realMoney: false, practice: true, note: PENDING },
];

/**
 * Shown wherever the table is rendered. Kept in config so the product copy
 * and the gate can never disagree.
 */
export const jurisdictionNotice =
  "No jurisdiction has been enabled for real-money play. Every region is pending legal review; the free practice table carries no money and no rewards.";

export function getJurisdiction(code: string | null | undefined): Jurisdiction | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  return jurisdictions.find((j) => j.code === c);
}

/**
 * The only function the real-money gate should consult. Unknown regions are
 * treated exactly like restricted ones.
 */
export function isRealMoneyAllowed(code: string | null | undefined): boolean {
  const j = getJurisdiction(code);
  return j?.status === "enabled" && j.realMoney === true;
}

export function isPracticeAllowed(code: string | null | undefined): boolean {
  const j = getJurisdiction(code);
  // Practice mode is free and carries no money; unknown regions default to practice-only.
  return j ? j.practice : true;
}

export const jurisdictionSummary = {
  total: jurisdictions.length,
  enabled: jurisdictions.filter((j) => j.status === "enabled").length,
  restricted: jurisdictions.filter((j) => j.status === "restricted").length,
  pendingReview: jurisdictions.filter((j) => j.status === "pending-review").length,
};
