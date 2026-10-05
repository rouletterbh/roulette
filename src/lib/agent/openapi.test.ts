// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { chainOpenapiDocument, demoOpenapiDocument, openapiDocument, type OpenApiDocument } from "./openapi";
import { chainDatasetCatalog, datasetCatalog, demoDatasetCatalog } from "./datasets";
import { ERROR_CODES } from "./envelope";

const API_ROOT = join(process.cwd(), "src", "app", "api", "v1");

/** Walks src/app/api/v1 and returns OpenAPI-style paths for every route.ts, e.g. "/tables/{id}". */
function routePaths(dir = API_ROOT, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routePaths(full, acc);
    else if (entry === "route.ts") {
      const rel = relative(API_ROOT, dir).split(sep).join("/");
      acc.push("/" + rel.replace(/\[([^\]]+)\]/g, "{$1}"));
    }
  }
  return acc.sort();
}

describe("openapi document", () => {
  const paths = openapiDocument.paths as Record<string, Record<string, unknown>>;

  it("is OpenAPI 3.1 with the required top-level fields", () => {
    expect(openapiDocument.openapi).toBe("3.1.0");
    expect(openapiDocument.info.title).toBeTruthy();
    expect(openapiDocument.info.version).toBeTruthy();
    expect(openapiDocument.info.description).toMatch(/Robinhood Chain/);
    expect(openapiDocument.info.description).not.toMatch(/Robinhood Agents/i);
    expect(openapiDocument.info.description).toMatch(/never holds keys and never signs/);
  });

  it("documents every route file under src/app/api/v1", () => {
    const files = routePaths();
    expect(files.length).toBeGreaterThanOrEqual(16);
    for (const p of files) expect(Object.keys(paths), `missing path ${p}`).toContain(p);
  });

  it("has no documented path without a route file", () => {
    const files = new Set(routePaths());
    for (const p of Object.keys(paths)) expect(files.has(p), `dangling path ${p}`).toBe(true);
  });

  it("every operation has an operationId, summary and a 200 response; every $ref resolves", () => {
    const schemas = openapiDocument.components.schemas as Record<string, unknown>;
    const seen = new Set<string>();
    const refs: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (k === "$ref" && typeof v === "string") refs.push(v);
          else walk(v);
        }
      }
    };
    for (const [path, ops] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const o = op as { operationId?: string; summary?: string; responses?: Record<string, unknown>; requestBody?: unknown };
        expect(o.operationId, `${method} ${path}`).toBeTruthy();
        expect(seen.has(o.operationId!), `duplicate operationId ${o.operationId}`).toBe(false);
        seen.add(o.operationId!);
        expect(o.summary, `${method} ${path}`).toBeTruthy();
        expect(o.responses?.["200"], `${method} ${path} 200`).toBeTruthy();
        if (method === "post") expect(o.requestBody, `${method} ${path} requestBody`).toBeTruthy();
      }
    }
    walk(openapiDocument);
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) {
      const name = r.replace("#/components/schemas/", "");
      expect(schemas[name], `unresolved ${r}`).toBeTruthy();
    }
  });

  it("dataset catalog endpoints are documented paths", () => {
    for (const d of datasetCatalog) {
      const p = d.endpoint.replace("/api/v1", "");
      expect(paths[p], `dataset ${d.id} → ${p}`).toBeTruthy();
      expect(d.fields.length).toBeGreaterThan(2);
      expect(d.refreshCadence).toBeTruthy();
    }
  });
});

/** The same structural checks for both documents: the one served in demo mode and the chain-backed one. */
describe.each([
  ["demo", demoOpenapiDocument as unknown as OpenApiDocument, demoDatasetCatalog],
  ["chain-backed", chainOpenapiDocument, chainDatasetCatalog],
] as const)("%s openapi document", (_name, doc, catalog) => {
  it("covers exactly the route files, with operation ids, 200 responses and resolvable refs", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual(routePaths());
    const refs: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (k === "$ref" && typeof v === "string") refs.push(v);
          else walk(v);
        }
      }
    };
    const ids = new Set<string>();
    for (const [path, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const o = op as { operationId?: string; summary?: string; responses?: Record<string, unknown>; requestBody?: unknown };
        expect(o.operationId, `${method} ${path}`).toBeTruthy();
        expect(ids.has(o.operationId!), `duplicate ${o.operationId}`).toBe(false);
        ids.add(o.operationId!);
        expect(o.summary, `${method} ${path}`).toBeTruthy();
        expect(o.responses?.["200"], `${method} ${path}`).toBeTruthy();
        if (method === "post") expect(o.requestBody, `${method} ${path}`).toBeTruthy();
      }
    }
    walk(doc);
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) expect(doc.components.schemas[r.replace("#/components/schemas/", "")], `unresolved ${r}`).toBeTruthy();
  });

  it("its dataset catalog points at documented paths", () => {
    for (const d of catalog) {
      expect(doc.paths[d.endpoint.replace("/api/v1", "")], `dataset ${d.id}`).toBeTruthy();
      expect(d.fields.length).toBeGreaterThan(2);
    }
  });
});

describe("chain-backed openapi document", () => {
  const schemas = chainOpenapiDocument.components.schemas as Record<string, { properties?: Record<string, Record<string, unknown>>; required?: string[] }>;
  const text = JSON.stringify(chainOpenapiDocument);

  it("documents every error code the API can return", () => {
    const codes = (schemas.ErrorEnvelope!.properties!.error as { properties: { code: { enum: string[] } } }).properties.code.enum;
    expect([...codes].sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ["ROUND_NOT_OPEN", "INSUFFICIENT_ESCROW", "NO_CHIPS", "INSUFFICIENT_CHIPS", "ASSET_UNAVAILABLE", "INSUFFICIENT_WIN_BALANCE", "INSUFFICIENT_INVENTORY", "PAUSED", "CHAIN_UNAVAILABLE"]) expect(codes).toContain(code);
  });

  it("requires the caller's address on every intent and never on reads", () => {
    for (const name of ["EnterTableRequest", "PlaceBetsRequest", "LeaveTableRequest", "ConvertToRewardsRequest", "ClaimRequest"]) {
      expect(schemas[name]!.required, name).toContain("address");
      expect(schemas[name]!.properties!.address, name).toBeTruthy();
    }
  });

  it("describes chain shapes: numeric table ids, a nullable current round, no simulated fields", () => {
    const table = schemas.Table!.properties!;
    expect(table.id!.pattern).toBe("^[1-9]\\d*$");
    expect(JSON.stringify(table.currentRound)).toContain('"type":"null"');
    expect(JSON.stringify(table.operator)).toContain("waiting-for-players");
    expect(table).not.toHaveProperty("players");
    expect(table).not.toHaveProperty("spectators");
    expect(text).not.toContain("neon-01\"}");
    expect(text).not.toMatch(/coingecko/i);
    expect(chainOpenapiDocument.info.description).toMatch(/never holds keys and never signs/);
    expect(chainOpenapiDocument.info.description).toMatch(/Robinhood Chain/);
    expect(JSON.stringify(schemas.TxIntent!.properties!.to)).not.toContain("null");
  });

  it("documents the two-step reward flow: convert-to-rewards, then claim with the maximum claimable now", () => {
    const paths = chainOpenapiDocument.paths as Record<string, { post?: { operationId: string; responses: Record<string, unknown> } }>;
    expect(paths["/intents/convert-to-rewards"]!.post!.operationId).toBe("buildConvertToRewardsIntent");
    expect(JSON.stringify(paths["/intents/convert-to-rewards"]!.post!.responses["409"])).toMatch(/NO_CHIPS.*INSUFFICIENT_CHIPS.*PAUSED/);
    expect(JSON.stringify(paths["/intents/claim"]!.post!.responses["409"])).toMatch(/INSUFFICIENT_INVENTORY/);
    expect(schemas.ConvertToRewardsIntent!.properties!.oneWay).toEqual({ const: true });
    expect(schemas.ClaimIntent!.properties!.maxClaimableNow).toEqual({ $ref: "#/components/schemas/MaxClaimable" });
    expect(schemas.MaxClaimable!.properties!.blocker!.enum).toContain("no-inventory");
    expect(chainOpenapiDocument.info.description).toMatch(/one-way/);
    expect(chainOpenapiDocument.info.description).toMatch(/five `intents` routes/);
  });

  it("chain datasets are marked as not simulated and say where they come from", () => {
    for (const d of chainDatasetCatalog) {
      expect(d.demo, d.id).toBe(false);
      expect(d.tags, d.id).not.toContain("demo");
      if (d.id !== "fairness-proofs") expect(d.provenance, d.id).toMatch(/Robinhood Chain/);
    }
  });
});
