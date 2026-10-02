// Converts generated PNGs to optimized WebP (keeps PNG originals as fallback).
import sharp from "sharp";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve(import.meta.dirname, "../public/art/generated");
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".png")) continue;
  const out = resolve(dir, f.replace(/\.png$/, ".webp"));
  await sharp(resolve(dir, f)).webp({ quality: 84, effort: 5 }).toFile(out);
  console.log("webp", f);
}
