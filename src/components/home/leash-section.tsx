import { Eyebrow } from "@/components/ui/eyebrow";
import { AgentLeash } from "@/components/agent/agent-leash";

/** "Autonomous. Not unlimited." Industrial control, four limits the agent cannot override. */
export function LeashSection() {
  return (
    <section className="section-wash container-edge py-20 md:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
        <div className="relative">
          <div className="vignette overflow-hidden">
            <picture>
              <source srcSet="/art/generated/leash-light.webp" type="image/webp" />
              <img src="/art/generated/leash-light.png" alt="An industrial precision control instrument with four concentric mechanical rings in polished metal, black ceramic and glass with acid-green indicators." className="aspect-square w-full object-cover" loading="lazy" width={1024} height={1024} />
            </picture>
          </div>
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between md:bottom-6 md:left-6 md:right-6">
            <AgentLeash usage={{ chips: 38, chipsMax: 100, loss: 7, lossMax: 20, rounds: 31, roundsMax: 80, minutes: 18, minutesMax: 45 }} size={88} compact className="rounded-full bg-canvas/85 p-2 backdrop-blur-[2px]" />
            <span className="microlabel bg-canvas/85 px-2 py-1 backdrop-blur-[2px]">leash · 4 limits</span>
          </div>
        </div>
        <div>
          <Eyebrow className="mb-4 block">The leash</Eyebrow>
          <h2 className="font-display text-display-md text-balance">Autonomous.<br />Not unlimited.</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">Every agent carries four limits set by its author. It checks them before every decision and cannot override them. When one is reached, the agent stops itself.</p>
          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-ink pt-6">
            {([["Chip allowance", "What it may stake, in total."], ["Stop loss", "Net loss that ends the run."], ["Round cap", "Maximum rounds per approval."], ["Time limit", "Minutes before it sleeps."]] as const).map(([k, v]) => (
              <div key={k}><dt className="font-mono text-[13px] uppercase tracking-[0.06em]">{k}</dt><dd className="mt-1 text-[13.5px] text-muted">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-8 border-t border-hairline pt-4 font-mono text-[12px] text-ink-2">LEASH TRIGGERED · STOP LOSS REACHED · Agent ARC-7 stopped itself.</p>
        </div>
      </div>
    </section>
  );
}
