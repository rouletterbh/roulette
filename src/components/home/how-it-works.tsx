import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Chip } from "@/components/ui/chip";

const steps = [
  { n: "01", title: "Deposit", body: "Send ETH or a supported asset on Robinhood Chain.", art: <DepositArt /> },
  { n: "02", title: "Get chips", body: "Chips are minted to your wallet as ERC-1155 gaming assets.", art: <ChipsArt /> },
  { n: "03", title: "Play", body: "Sit at a public table, open a private one, or practice free.", art: <PlayArt /> },
];
const after = [
  { n: "04", title: "Win", body: "Results are committed before bets open and verifiable after." },
  { n: "05", title: "Claim", body: "Choose how your win settles: crypto or supported Stock Tokens." },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <div className="mb-14 max-w-2xl">
        <Eyebrow className="mb-4 block">How it works</Eyebrow>
        <h2 className="font-display text-display-md text-balance">Three steps to the table. Two to the bank.</h2>
      </div>

      <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="flex flex-col justify-between bg-surface p-7 dark:bg-elevated md:min-h-[360px]">
            <div className="flex items-center justify-between">
              <span className="font-display text-5xl text-faint">{s.n}</span>
              <span className="h-20 w-20">{s.art}</span>
            </div>
            <div className="mt-10">
              <h3 className="font-display text-3xl">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
        {after.map((s) => (
          <div key={s.n} className="flex items-start gap-6 bg-surface p-7 dark:bg-elevated">
            <span className="font-display text-5xl text-faint">{s.n}</span>
            <div>
              <h3 className="font-display text-3xl">{s.title}</h3>
              <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function DepositArt() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-full w-full text-ink" aria-hidden>
      <rect x="10" y="22" width="60" height="40" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 34h60" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="56" cy="48" r="5" fill="var(--accent)" />
      <path d="M40 8v10m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ChipsArt() {
  return (
    <span className="relative block h-full w-full">
      <Chip value={1} size={34} className="absolute left-0 top-9" />
      <Chip value={5} size={34} className="absolute left-5 top-6" />
      <Chip value={25} size={34} className="absolute left-10 top-3" />
      <Chip value={100} size={34} className="absolute left-[60px] top-0" />
    </span>
  );
}
function PlayArt() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-full w-full text-ink" aria-hidden>
      <circle cx="40" cy="40" r="30" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="40" cy="40" r="18" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="40" cy="40" r="4" fill="currentColor" />
      <circle cx="58" cy="26" r="3" fill="var(--accent)" />
      <path d="M40 10v8M40 62v8M10 40h8M62 40h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
