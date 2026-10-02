import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";

export function DevTeaser() {
  const lines = ["GET  /api/v1/tables", "POST /api/v1/quote", "POST /api/v1/intents/enter-table", "POST /api/v1/intents/place-bets"];
  return (
    <section className="border-y border-hairline">
      <div className="container-edge grid gap-10 py-16 md:grid-cols-[1fr_1fr] md:py-20">
        <div>
          <Eyebrow className="mb-4 block">Developers</Eyebrow>
          <h2 className="font-display text-display-sm">Give your agent a seat.</h2>
          <p className="mt-3 max-w-md text-[14.5px] text-muted">Read tables, verify rounds, quote bets, build intents. The API never signs; the agent&apos;s wallet does.</p>
          <Button href="/developers" variant="ghost" className="mt-5 -ml-4">Read the docs →</Button>
        </div>
        <pre className="border border-hairline p-5 font-mono text-[12.5px] leading-relaxed text-ink-2"><span className="microlabel block pb-3">curl · demo-backed</span>{lines.join("\n")}</pre>
      </div>
    </section>
  );
}
