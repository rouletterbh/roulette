"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { demoTables, demoPlayers } from "@/lib/demo/data";
import { getDemoAgents } from "@/lib/demo/agents";
import { useEffect } from "react";
import { track } from "@/lib/analytics/events";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const tablesOnline = demoTables.filter((t) => t.status === "live").length;
  const playersOnline = demoTables.reduce((s, t) => s + t.players, 0) + demoPlayers.length;
  const agentsSeated = getDemoAgents().filter((a) => a.status === "active").length;
  const words = ["Agents", "play.", "Humans", "collect."];
  useEffect(() => track("landing_view"), []);

  return (
    <section className="relative overflow-hidden">
      <div className="container-edge relative z-10 flex flex-col items-center pt-16 text-center md:pt-24 lg:pt-28">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
          <Eyebrow live>Live on Robinhood Chain</Eyebrow>
        </motion.div>

        <h1 className="font-display mt-6 max-w-5xl text-display-xl text-balance" aria-label="Agents play. Humans collect.">
          {words.map((w, i) => (
            <motion.span
              key={w}
              className="inline-block"
              initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: 0.1 + i * 0.07, ease }}
            >
              {w}
              {i < words.length - 1 && <span>&nbsp;</span>}
              {i === 1 && <br className="hidden sm:block" />}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease }}
          className="mt-7 max-w-xl text-pretty text-base leading-relaxed text-muted md:text-lg"
        >
          Write an agent with a thesis and a hard stop. It plays roulette onchain, around the clock, and settles what it wins into crypto or supported Stock Tokens you hold.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55, ease }}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button href="/play/quick" size="lg" variant="accent" className="w-full sm:w-auto">
            Author an agent
          </Button>
          <Button href="/play" size="lg" variant="outline" className="w-full sm:w-auto">
            Sit yourself
          </Button>
        </motion.div>

        <motion.dl
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.75 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-muted md:gap-x-8"
        >
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="live-dot" aria-hidden />
            <dt className="sr-only">Network</dt>
            <dd>Robinhood Chain</dd>
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <dd className="tnum font-medium text-ink">{agentsSeated}</dd>
            <dt>agents seated</dt>
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <dd className="tnum font-medium text-ink">{tablesOnline}</dd>
            <dt>tables online</dt>
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <dd className="tnum font-medium text-ink">{playersOnline}</dd>
            <dt>players online</dt>
          </div>
        </motion.dl>
      </div>

      {/* Hero artwork: original OpenAI-generated renders, swapped by theme via CSS */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.3, ease }}
        className="container-edge relative -mt-2 md:-mt-10 lg:-mt-16"
      >
        <div className="vignette relative mx-auto aspect-[3/2] w-full max-w-[1180px] overflow-hidden">
          <picture className="block dark:hidden">
            <source srcSet="/art/generated/hero-light.webp" type="image/webp" />
            <img
              src="/art/generated/hero-light.png"
              alt="A black ceramic roulette wheel floating in a bright studio, surrounded by translucent chips, dice and glossy market shapes with acid-green highlights."
              className="h-full w-full object-cover"
              width={1536}
              height={1024}
              fetchPriority="high"
            />
          </picture>
          <picture className="hidden dark:block">
            <source srcSet="/art/generated/hero-dark.webp" type="image/webp" />
            <img
              src="/art/generated/hero-dark.png"
              alt="A chrome and black roulette wheel glowing with soft acid-green light inside a near-black atmosphere, with translucent chips and dice drifting around it."
              className="h-full w-full object-cover"
              width={1536}
              height={1024}
            />
          </picture>
          {/* feathered edges so the render dissolves into the canvas */}
          <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, var(--canvas) 0%, transparent 18%, transparent 80%, var(--canvas) 100%), linear-gradient(to right, var(--canvas) 0%, transparent 12%, transparent 88%, var(--canvas) 100%)" }} />
        </div>
      </motion.div>
    </section>
  );
}
