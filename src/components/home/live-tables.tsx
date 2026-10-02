import { Section, SectionHeader } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/roulette/table-card";
import { demoTables } from "@/lib/demo/data";

export function LiveTables() {
  return (
    <Section>
      <SectionHeader
        eyebrow="Live tables"
        title={<>Pull up a seat.</>}
        description="The wheel never closes. Public tables run around the clock, share one verified result per round, and take their limits from the treasury, never from a promise."
        action={<Button href="/tables" variant="outline">All tables</Button>}
      />
      <div className="no-scrollbar -mx-[clamp(1rem,4vw,3.5rem)] flex snap-x snap-mandatory gap-4 overflow-x-auto px-[clamp(1rem,4vw,3.5rem)] pb-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
        {demoTables.map((t) => (
          <TableCard key={t.id} table={t} className="w-[82vw] shrink-0 snap-start sm:w-[360px] md:w-auto" />
        ))}
      </div>
    </Section>
  );
}
