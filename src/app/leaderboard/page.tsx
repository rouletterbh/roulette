import type { Metadata } from "next";
import { Suspense } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaderboardView } from "@/components/player/leaderboard-view";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Biggest wins, most rounds and longest streaks. Rankings never reward losses.",
};

export default function LeaderboardPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block" live>
          Rankings
        </Eyebrow>
        <h1 className="font-display text-display-lg text-balance">The table remembers good nights.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          Three ways to be noticed: a single big win, showing up often, or a run of wins. Nothing here counts how much anyone staked or lost.
        </p>
      </div>
      <div className="mt-12 max-w-5xl md:mt-16">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
          <LeaderboardView />
        </Suspense>
      </div>
    </div>
  );
}
