import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Play" };

const modes = [
  { href: "/play/quick", title: "Quick play", body: "You against the protocol. The fastest way to the wheel.", tag: "Solo", accent: true },
  { href: "/tables", title: "Live table", body: "Join a public table. One wheel, one result, everyone watching.", tag: "Social" },
  { href: "/create", title: "Private table", body: "Open a room, set limits inside the system cap, share a link.", tag: "Host" },
  { href: "/play/practice", title: "Practice", body: "Free practice chips. No money, no rewards, same wheel.", tag: "Free" },
];

export default function PlayPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block" live>Choose a table</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Play the table, not the interface.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Four ways to the wheel. Every mode shares the same fairness proof and the same treasury-backed limits.</p>
      </div>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
        {modes.map((m) => (
          <li key={m.href}>
            <Link href={m.href} className={cn("group flex min-h-[220px] flex-col justify-between bg-surface p-7 transition-colors hover:bg-sunken dark:bg-elevated dark:hover:bg-surface")}>
              <div className="flex items-start justify-between">
                <Badge tone={m.accent ? "accent" : "outline"}>{m.tag}</Badge>
                <span className="text-muted transition-transform group-hover:translate-x-1" aria-hidden>→</span>
              </div>
              <div>
                <h2 className="font-display text-4xl">{m.title}</h2>
                <p className="mt-2 max-w-sm text-[14.5px] text-muted">{m.body}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
