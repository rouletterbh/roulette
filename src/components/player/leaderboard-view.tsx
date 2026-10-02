"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { DemoBadge } from "@/components/ui/badge";
import { LeaderboardTable, categoryMeta } from "./leaderboard-table";
import { getLeaderboard, type LeaderboardCategory, type LeaderboardPeriod } from "@/lib/demo/players";
import { useWallet } from "@/store/wallet";
import { cn } from "@/lib/utils";

const periods: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "all", label: "All time" },
];
const categories = (Object.keys(categoryMeta) as LeaderboardCategory[]).map((id) => ({ id, label: categoryMeta[id].label }));

const isPeriod = (v: string | null): v is LeaderboardPeriod => v === "today" || v === "week" || v === "all";
const isCategory = (v: string | null): v is LeaderboardCategory => v === "biggest-win" || v === "most-games" || v === "longest-streak";

export function LeaderboardView() {
  const params = useSearchParams();
  const router = useRouter();
  const address = useWallet((s) => s.address);

  const period: LeaderboardPeriod = isPeriod(params.get("period")) ? (params.get("period") as LeaderboardPeriod) : "today";
  const category: LeaderboardCategory = isCategory(params.get("category")) ? (params.get("category") as LeaderboardCategory) : "biggest-win";

  const setParam = useCallback(
    (key: "period" | "category", value: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(key, value);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const rows = useMemo(() => getLeaderboard(period, category), [period, category]);

  return (
    <div>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <Tabs tabs={periods} value={period} onChange={(v) => setParam("period", v)} label="Period" layoutKey="lb-period" className="md:min-w-[320px]" />
        <div className="flex items-center gap-3">
          <span className="eyebrow hidden md:inline">Category</span>
          <div role="group" aria-label="Category" className="no-scrollbar flex snap-x gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 dark:bg-elevated">
            {categories.map((c) => {
              const active = c.id === category;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setParam("category", c.id)}
                  className={cn(
                    "shrink-0 snap-start rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                    active ? "bg-ink text-canvas" : "text-muted hover:text-ink",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl text-ink md:text-3xl">
          {categoryMeta[category].label}
          <span className="text-muted"> · {periods.find((p) => p.id === period)?.label}</span>
        </h2>
        <DemoBadge />
      </div>

      {periods.map((p) => (
        <TabPanel key={p.id} id={p.id} value={period} layoutKey="lb-period" className="mt-4">
          <LeaderboardTable rows={rows} category={category} highlightWallet={address} />
        </TabPanel>
      ))}

      <div className="mt-8 flex flex-col gap-3 text-[12.5px] text-muted md:flex-row md:items-center md:justify-between">
        <p>
          Rankings never reward losses. There is no category for volume staked, and no position improves by losing more.
          {period === "today" && " Today means the last 24 hours."}
        </p>
        <Link href="/responsible-play" className="underline underline-offset-4 hover:text-ink">
          Play within limits
        </Link>
      </div>
    </div>
  );
}
