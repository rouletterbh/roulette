// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { openapiDocument } from "./openapi";
import { datasetCatalog } from "./datasets";

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
