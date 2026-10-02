import { z } from "zod";
import { siteConfig } from "@/config/site";

/**
 * Shared response envelope for /api/v1.
 *   { ok: true,  demo: boolean, data }
 *   { ok: false, demo: boolean, error: { code, message, details? }, preview? }
 * Everything served from demo data carries `demo: true`.
 */
export const API_VERSION = "1.0.0-beta";

/** True until contracts are deployed or the app is explicitly taken out of demo mode. */
export const DEMO = siteConfig.demoMode || process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONTRACTS_NOT_DEPLOYED"
  | "TABLE_LIMIT"
  | "INTERNAL";

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

function headers(extra: Record<string, string> = {}) {
  return { "Content-Type": "application/json; charset=utf-8", "X-API-Version": API_VERSION, ...CORS, ...extra };
}

/** JSON.stringify that tolerates bigints (as decimal strings). */
export function toJson(value: unknown) {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

export interface OkOptions {
  demo?: boolean;
  /** Seconds for Cache-Control max-age (reads). Omit or 0 for no-store. */
  maxAge?: number;
  status?: number;
}

export function ok<T>(data: T, opts: OkOptions = {}) {
  const demo = opts.demo ?? DEMO;
  const cache = opts.maxAge && opts.maxAge > 0 ? `public, max-age=${opts.maxAge}, s-maxage=${opts.maxAge}, stale-while-revalidate=${opts.maxAge * 2}` : "no-store";
  return new Response(toJson({ ok: true, demo, data }), { status: opts.status ?? 200, headers: headers({ "Cache-Control": cache }) });
}

export function err(code: ErrorCode, message: string, opts: { status?: number; details?: unknown; demo?: boolean; preview?: unknown } = {}) {
  const status = opts.status ?? defaultStatus(code);
  const body: Record<string, unknown> = { ok: false, demo: opts.demo ?? DEMO, error: { code, message, ...(opts.details !== undefined ? { details: opts.details } : {}) } };
  if (opts.preview !== undefined) body.preview = opts.preview;
  return new Response(toJson(body), { status, headers: headers({ "Cache-Control": "no-store" }) });
}

function defaultStatus(code: ErrorCode) {
  switch (code) {
    case "BAD_REQUEST":
    case "VALIDATION_ERROR":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "RATE_LIMITED":
      return 429;
    case "CONTRACTS_NOT_DEPLOYED":
    case "TABLE_LIMIT":
      return 409;
    default:
      return 500;
  }
}

/** Shared CORS preflight handler: `export { OPTIONS } from "@/lib/agent/envelope"`. */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Parses a JSON body against a zod schema. Returns a Response on failure. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ data: z.infer<S> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: err("BAD_REQUEST", "Body must be valid JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { response: err("VALIDATION_ERROR", "Request body failed validation", { details: z.treeifyError(parsed.error) }) };
  return { data: parsed.data };
}

/** Parses URL search params against a zod schema. */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): { data: z.infer<S> } | { response: Response } {
  const url = new URL(req.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return { response: err("VALIDATION_ERROR", "Query parameters failed validation", { details: z.treeifyError(parsed.error) }) };
  return { data: parsed.data };
}

export const hex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 0x-prefixed 32-byte hex string")
  .transform((s) => s.toLowerCase() as `0x${string}`);

export const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 0x-prefixed 20-byte address")
  .transform((s) => s as `0x${string}`);
