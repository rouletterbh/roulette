"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { demoTables, demoPlayers } from "@/lib/demo/data";
import { getDemoAgents } from "@/lib/demo/agents";
import { useEffect } from "react";
import { track } from "@/lib/analytics/events";
import { AgentNetworkHero } from "./agent-network-hero";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const tablesOnline = demoTables.filter((t) => t.status === "live").length;
  const playersOnline = demoTables.reduce((s, t) => s + t.players, 0) + demoPlayers.length;
  const agentsSeated = getDemoAgents().filter((a) => a.status === "active").length;
  const words = ["Agents", "play.", "Humans", "collect."];
  useEffect(() => track("landing_view"), []);

  return (
    <section className="relative overflow-hidden hero-glow blueprint">
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

      {/* Live agent environment: the table is alive */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.35, ease }}
        className="container-edge relative mt-12 md:mt-16"
      >
        <AgentNetworkHero />
      </motion.div>
    </section>
  );
}
