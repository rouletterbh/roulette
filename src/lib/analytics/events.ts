/**
 * Privacy-conscious analytics. Events carry no wallet addresses, amounts are
 * bucketed, and nothing is sent unless NEXT_PUBLIC_ANALYTICS_ENDPOINT is set.
 */
export type AnalyticsEvent =
  | "landing_view"
  | "wallet_connect"
  | "practice_start"
  | "deposit_start"
  | "deposit_complete"
  | "table_join"
  | "bet_submit"
  | "round_complete"
  | "claim_start"
  | "claim_complete";

type Props = Record<string, string | number | boolean>;

const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;

export function bucketAmount(n: number) {
  if (n < 1) return "<1";
  if (n < 10) return "1-10";
  if (n < 50) return "10-50";
  if (n < 250) return "50-250";
  return "250+";
}

export function track(event: AnalyticsEvent, props: Props = {}) {
  if (typeof window === "undefined") return;
  const payload = { event, props, ts: Date.now(), path: window.location.pathname };
  if (process.env.NODE_ENV !== "production") console.debug("[analytics]", payload);
  if (!endpoint) return;
  try {
    navigator.sendBeacon(endpoint, JSON.stringify(payload));
  } catch {}
}
