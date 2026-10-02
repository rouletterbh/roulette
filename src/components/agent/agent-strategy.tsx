import { cn } from "@/lib/utils";

export interface StrategyView {
  when: string; // IF clause
  then: string; // THEN clause
  size: string; // SIZE clause
  cadence: string;
}

/** Natural-language thesis rendered as IF / THEN / SIZE, like reading a program. */
export function AgentStrategy({ s, className, sentence }: { s: StrategyView; className?: string; sentence?: string }) {
  return (
    <div className={cn("border-t border-ink", className)}>
      {sentence && <p className="py-3 text-[15px] leading-relaxed text-ink-2">{sentence}</p>}
      <dl className="grid grid-cols-[64px_1fr] divide-y divide-hairline border-t border-hairline font-mono text-[12.5px]">
        {([["IF", s.when], ["THEN", s.then], ["SIZE", s.size], ["EVERY", s.cadence]] as const).map(([k, v]) => (
          <div key={k} className="col-span-2 grid grid-cols-subgrid py-2"><dt className="microlabel !text-ink">{k}</dt><dd className="text-ink-2">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
