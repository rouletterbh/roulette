// Prepares the Roblette mark: knock out the near-white background, trim, export sizes + app icons.
import sharp from "sharp";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const src = resolve(root, process.argv[2] ?? "public/brand/roblette-mark-source.png");
const img = sharp(src).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const out = Buffer.from(data);
const { width, height, channels } = info;
// Any pixel close to the paper color becomes transparent; soft edge via luminance.
for (let i = 0; i < width * height; i++) {
  const r = out[i * channels], g = out[i * channels + 1], b = out[i * channels + 2];
  const lum = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (lum > 238 && sat < 22) out[i * channels + 3] = 0;
  else if (lum > 215 && sat < 22) out[i * channels + 3] = Math.round(((238 - lum) / 23) * 255);
}
const base = sharp(out, { raw: { width, height, channels } }).png().trim();
const buf = await base.toBuffer();
await sharp(buf).resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(resolve(root, "public/brand/roblette-mark.png"));
await sharp(buf).resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(resolve(root, "public/brand/roblette-mark-256.png"));
await sharp(buf).resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(resolve(root, "src/app/icon.png"));
// Apple touch icon wants an opaque background.
await sharp(buf).resize(150, 150, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).extend({ top: 15, bottom: 15, left: 15, right: 15, background: { r: 247, g: 247, b: 242, alpha: 1 } }).flatten({ background: "#F7F7F2" }).png().toFile(resolve(root, "src/app/apple-icon.png"));
console.log("mark ready", width, height);
