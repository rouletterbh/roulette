#!/usr/bin/env node
// Generates ORIGINAL artwork via the OpenAI Images API, server-side only.
// Usage: bun scripts/generate-assets.mjs [--only id1,id2] [--force]
// Reads OPENAI_API_KEY from .env.local or the environment. Never ship this key to the client.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { assets } from "./assets/manifest.mjs";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "public/art/generated");
mkdirSync(outDir, { recursive: true });

function loadEnv() {
  const p = resolve(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
loadEnv();

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("OPENAI_API_KEY missing. Add it to .env.local (server-side only).");
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(",") : null;

const manifestOut = resolve(outDir, "manifest.json");
const existing = existsSync(manifestOut) ? JSON.parse(readFileSync(manifestOut, "utf8")) : {};

for (const a of assets) {
  if (only && !only.includes(a.id)) continue;
  const target = resolve(outDir, a.file);
  if (existsSync(target) && !force) {
    console.log(`skip ${a.id} (exists)`);
    continue;
  }
  console.log(`generating ${a.id} ...`);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: a.prompt,
      size: a.size,
      quality: a.quality ?? "high",
      n: 1,
      output_format: "png",
    }),
  });
  if (!res.ok) {
    console.error(`failed ${a.id}: ${res.status} ${await res.text()}`);
    continue;
  }
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    console.error(`no image for ${a.id}`);
    continue;
  }
  writeFileSync(target, Buffer.from(b64, "base64"));
  existing[a.id] = {
    id: a.id,
    file: `/art/generated/${a.file}`,
    category: a.category,
    alt: a.alt,
    size: a.size,
    prompt: a.prompt,
    model: "gpt-image-1",
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(manifestOut, JSON.stringify(existing, null, 2));
  console.log(`saved ${a.file}`);
}
console.log("done");
