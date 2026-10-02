# Design system & conventions

Read this before adding any page or component.

## Identity
- Product name is configurable: use `siteConfig.name` from `@/config/site`. Never hardcode a name.
- Always write **Robinhood Chain** (never Hood Chain, RH Chain, Robinhood L2, Robinhood blockchain).
- Robinhood-issued assets are **Stock Tokens** (never tokenized stocks/equities, never "actual shares").
- Never imply partnership, endorsement or operation by Robinhood. We are an independent product.
- Never claim licenses, audits, or legal availability. Use `[LEGAL COUNSEL REVIEW REQUIRED]` placeholders and `NOT YET AUDITED`.
- No gambler's-fallacy copy ("red is due"). Every spin is independent.
- Demo data must be labeled with `<DemoBadge />` or a `Demo` badge when monetary values are simulated.

## Stack
Next.js 16 (App Router, `src/app`), React 19, Tailwind v4 (tokens in `src/app/globals.css`), `motion/react` (Framer Motion), zustand stores in `src/store`, viem/wagmi, zod. Bun is the package manager (`bun run dev`, `bunx tsc --noEmit`, `bun run test`).

Server components by default. Add `"use client"` only for interaction.

## Tokens (Tailwind classes)
Colors: `bg-canvas`, `bg-surface`, `bg-elevated`, `bg-sunken`, `text-ink`, `text-ink-2`, `text-muted`, `text-faint`, `border-border`, `border-border-strong`, `border-hairline`, `bg-accent` (+ `text-accent-ink`), `bg-accent-soft`, `bg-casino-red`, `bg-roulette-green`, `bg-roulette-black`, `bg-purple`, `bg-cobalt`, `bg-amber`.
Dark mode is automatic via `[data-theme="dark"]` tokens; use the `dark:` variant only for exceptions.

Type: `font-display` (editorial serif, Instrument Serif) for headings/large numbers; body is Geist. Sizes: `text-display-xl|lg|md|sm` (fluid). `eyebrow` utility for small uppercase labels. `tnum` for tabular numbers. Don't make everything bold.

Layout: `container-edge` for page gutters (max 1600px). Use `<Section>` and `<SectionHeader>` from `@/components/ui/section`. Significant whitespace; not every element needs a container. Use typography as architecture. Avoid huge rounded rectangles everywhere, purple gradients, glass panels, neon, cartoon icons.

Radii: cards `rounded-2xl`, pills `rounded-full`. Borders are 1px hairlines. Shadows only on hover/elevated overlays.

## Components (import from `@/components/...`)
- `ui/button` `<Button variant="primary|accent|outline|ghost|danger" size="sm|md|lg|xl" href?>` — accent is for the single primary action, not every button.
- `ui/eyebrow` `<Eyebrow live?>`; `ui/badge` `<Badge tone="neutral|accent|red|muted|outline|demo|amber">`, `<DemoBadge />`
- `ui/section` `<Section>`, `<SectionHeader eyebrow title description action align>`
- `ui/number-pill` `<NumberPill n size highlight>` (roulette number with color + accessible label)
- `ui/chip` `<Chip value size practice>`, `<ChipStack>`; `ui/skeleton`
- `layout/*`: AppShell, Navbar, Footer, ThemeToggle, NetworkStatus, WalletButton, SoundToggle, Logo
- `player/player-avatar` `<PlayerAvatar address size name>`; `player/player-stack`
- `roulette/*`: RouletteWheel, RouletteBoard, ChipSelector, BetSlip, RecentNumbers, TableStats, FairnessProof, RoundResult, TableCard
- Libraries: `@/lib/roulette` (wheel order, bets, settle), `@/lib/risk/engine` (getMaximumSafeBet, checkWager, splitDeposit), `@/lib/fairness/commit-reveal`, `@/lib/demo/data` (simulated tables/players/treasury), `@/config/tokens` (reward registry, chip ids), `@/config/economics`, `@/config/chains`.

## Page skeleton
```tsx
import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/eyebrow";
export const metadata: Metadata = { title: "Page title" };
export default function Page() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Eyebrow</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Headline.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Lede.</p>
      </div>
      {/* content */}
    </div>
  );
}
```
Long-form legal pages use `src/components/ui/prose.tsx` `<Prose>` + `<LegalPage>` helpers (see there) for consistent typography and a table of contents.

## Accessibility
Keyboard reachable, visible focus (global `:focus-visible` ring), never color-only (numbers carry R/B letters), `aria-label`s on icon buttons, respect reduced motion.

## Agent system (redesign, Oct 2026)
Creative direction: "AI dealing room" — autonomous agents operating a live onchain casino. Light stays primary. Hairlines, serif display type, edge-to-edge sections, corner metadata, `microlabel` (mono uppercase tiny), `font-mono tnum` numerals, `blueprint` / `blueprint-radial` faint backgrounds. Operator vocabulary from `src/lib/agent/states.ts` (Observing table, Thesis matched, Leash check, Executing, Round locked, Settling, Collected, Stop loss hit, Round cap reached, Sleeping, Paused). Tiny state indicators, never oversized badges.

Semantic tokens: `--agent-observing/thinking/executing/settling/paused/stopped/warn` (mostly monochrome; acid green = executing/active; amber only near limits).

Primitives in `src/components/agent/`: `AgentGlyph` (unique per seed, motion encodes state), `AgentStatus`, `AgentActivityFeed` (execution telemetry, not chat), `AgentLeash` (four arcs: chips · loss · rounds · time), `AgentDecisionTrace` (input → rule → condition → leash → action → outcome; never an inner monologue), `DecisionMap`, `AgentStrategy` (IF/THEN/SIZE), `AgentExecutionPath`, `AgentMiniCard`, `AgentRunSummary`, `AgentCollectionEvent`, `RoundTelemetry`, `SystemTicker`, `ProtocolHealth`, `AgentDock` (global), `AgentRail` (tables), `AgentBuilder` (`/agents/new`).

Demo telemetry: `src/store/agent-network.ts` (scripted per-agent loops; `summary()` is cached and selector-safe). Never return a freshly built array/object from a zustand selector.

Copy rules: agents execute user-defined rules; they never predict, earn, or improve returns. Use collected / settled / claimed.
