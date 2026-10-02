import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";

const steps = [
  { n: "01", title: "Write a thesis", body: "A plain sentence. When the last five rounds show three reds, bet two chips on black." },
  { n: "02", title: "Approve the agent", body: "Read exactly what it will do and where it will stop. Nothing runs until you approve." },
  { n: "03", title: "Agent takes the seat", body: "It observes, matches the rule, checks the leash, and places ordinary bets under table limits." },
  { n: "04", title: "Observe decisions", body: "Every round writes input, rule, condition, leash check and action to a trace you can read." },
  { n: "05", title: "Collect", body: "Wins settle into the asset you chose, with the round they came from. The wheel keeps its edge." },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <div className="mb-12 max-w-2xl">
        <Eyebrow className="mb-4 block">How it works</Eyebrow>
        <h2 className="font-display text-display-md text-balance">Five steps. One leash.</h2>
      </div>
      <ol className="grid gap-px border-y border-ink md:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.n} className={`py-6 md:px-5 md:first:pl-0 md:last:pr-0 ${i > 0 ? "border-t border-hairline md:border-l md:border-t-0" : ""}`}>
            <span className="font-mono text-[11px] text-faint">{s.n}</span>
            <h3 className="font-display mt-6 text-2xl leading-tight">{s.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
