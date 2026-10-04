import { siteConfig } from "@/config/site";

/**
 * Which data source /api/v1 serves.
 *
 *   NEXT_PUBLIC_DEMO_MODE=false  → chain-backed: every route reads the deployed contracts
 *                                  (or returns an honest error); responses carry `demo: false`.
 *   anything else                → the simulated read models in src/lib/demo, `demo: true`.
 *
 * This is the same condition as the envelope's `DEMO` flag, so the machine-readable
 * `demo` field and the data source can never disagree. Production sets the variable to
 * "false" explicitly; an unset variable keeps the API on labelled simulated data rather
 * than pointing it at contracts that may not be configured.
 */
export const CHAIN_BACKED = !siteConfig.demoMode && process.env.NEXT_PUBLIC_DEMO_MODE === "false";
