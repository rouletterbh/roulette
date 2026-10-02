# Original artwork via the OpenAI Images API

All artwork is generated once, stored under `public/art/generated/`, and never regenerated at page load. The key lives only in `.env.local` as `OPENAI_API_KEY` (server/dev scripts only).

```bash
bun run assets:generate                 # generates anything missing from the manifest
bun run assets:generate -- --only hero-light,hero-dark
bun run assets:generate -- --force      # regenerate everything (costs money)
bun run assets:optimize                 # PNG → WebP (sharp)
```

Manifest: `scripts/assets/manifest.mjs`. Each entry has an id, filename, category, size, quality, alt text and prompt. Generation metadata (prompt, model, timestamp) is written to `public/art/generated/manifest.json`.

Art direction (light): premium surreal editorial 3D, sculptural roulette objects, translucent chips, polished black ceramic, brushed metal, acid-green details, off-white studio, grain, no logos, no text. Dark variant: near-black sculptural environment, acid-green illumination, controlled red/cobalt accents.

Rules: never generate, redraw or stylize the Robinhood Chain logo; no copyrighted mascots; no text or brand marks in images. Add categories (chip art, reward illustrations, table backgrounds, empty states, achievement icons, editorial art) by appending manifest entries.
