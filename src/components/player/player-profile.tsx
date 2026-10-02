"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PlayerAvatar } from "./player-avatar";
import { AchievementBadge } from "./achievement-badge";
import { RoundHistory, NetValue } from "./round-history";
import { RecentNumbers } from "@/components/roulette/recent-numbers";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { StatList } from "@/components/ui/stat";
import { achievements, rarityLabel } from "@/config/achievements";
import { formatDemoDate, type DemoRound, type PlayerProfile } from "@/lib/demo/players";
import { shortAddress } from "@/lib/utils";

type Tab = "overview" | "history" | "achievements";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
  { id: "achievements", label: "Achievements" },
];
const isTab = (v: string | null): v is Tab => v === "overview" || v === "history" || v === "achievements";

export function PlayerProfileView({ profile, history }: { profile: PlayerProfile; history: DemoRound[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "overview";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", t);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const [following, setFollowing] = useState(false);
  const [invited, setInvited] = useState(false);

  const earned = new Map(profile.achievements.map((a) => [a.id, a.earnedAt]));
  const earnedList = achievements.filter((a) => earned.has(a.id));
  const winRate = profile.games > 0 ? Math.round((profile.wins / profile.games) * 100) : 0;

  return (
    <div className="container-edge py-16 md:py-24">
      {/* Header */}
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-5 md:gap-7">
          <PlayerAvatar address={profile.wallet} size={96} name={profile.displayName} className="h-20 w-20 md:h-24 md:w-24" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Player</span>
              <DemoBadge />
            </div>
            <h1 className="mt-2 truncate font-display text-display-sm text-balance md:text-display-md">{profile.displayName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              <span className="font-mono tnum" title={profile.wallet}>
                {shortAddress(profile.wallet, 6)}
              </span>
              <span aria-hidden>·</span>
              <span>Joined {formatDemoDate(profile.joinedAt)}</span>
              {profile.hostedTables > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>Hosts tables</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={following ? "outline" : "primary"} size="md" aria-pressed={following} onClick={() => setFollowing((v) => !v)}>
            {following ? "Following" : "Follow"}
          </Button>
          <Button variant="outline" size="md" aria-pressed={invited} onClick={() => setInvited((v) => !v)}>
            {invited ? "Invite sent" : "Invite to table"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <StatList
        className="mt-12 md:mt-16"
        columns={3}
        items={[
          { label: "Games played", value: profile.games.toLocaleString("en-US") },
          { label: "Wins", value: profile.wins.toLocaleString("en-US"), hint: `${winRate}% of rounds` },
          { label: "Largest win", value: `+${profile.largestWin.toLocaleString("en-US")}`, hint: "chips, single round" },
          { label: "Favorite bet", value: <span className="text-2xl md:text-3xl">{profile.favoriteBet}</span> },
          { label: "Chips wagered", value: profile.totalWagered.toLocaleString("en-US"), hint: "lifetime" },
          {
            label: "Current streak",
            value: (
              <span className="inline-flex items-center gap-2">
                {profile.currentStreak}
                {profile.currentStreak > 0 && <span className="live-dot" aria-hidden />}
              </span>
            ),
            hint: `best ${profile.bestStreak}`,
          },
        ]}
      />

      {/* Tabs */}
      <div className="mt-14 md:mt-20">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label="Profile sections" layoutKey="profile" />

        <TabPanel id="overview" value={tab} layoutKey="profile" className="mt-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
            <section aria-labelledby="recent-rounds">
              <div className="flex items-baseline justify-between">
                <h2 id="recent-rounds" className="font-display text-2xl">
                  Recent rounds
                </h2>
                <button type="button" onClick={() => setTab("history")} className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
                  Full history
                </button>
              </div>
              <ol className="mt-4">
                {history.slice(0, 8).map((r) => (
                  <li key={r.roundId} className="hairline-b flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <RecentNumbers numbers={[r.result]} max={1} />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] text-ink-2">{r.betsSummary}</p>
                        <p className="text-[12px] text-muted">{r.tableName}</p>
                      </div>
                    </div>
                    <NetValue net={r.net} className="shrink-0 text-[14px]" />
                  </li>
                ))}
              </ol>
            </section>
            <aside className="space-y-10">
              <section aria-labelledby="recent-results">
                <h2 id="recent-results" className="eyebrow">
                  Last results
                </h2>
                <RecentNumbers numbers={history.slice(0, 12).map((r) => r.result)} className="mt-3" />
              </section>
              <section aria-labelledby="earned-badges">
                <div className="flex items-baseline justify-between">
                  <h2 id="earned-badges" className="eyebrow">
                    Badges · {earnedList.length}/{achievements.length}
                  </h2>
                  <button type="button" onClick={() => setTab("achievements")} className="text-[12.5px] text-muted underline-offset-4 hover:text-ink hover:underline">
                    All
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {earnedList.map((a) => (
                    <AchievementBadge key={a.id} achievement={a} earned size="sm" />
                  ))}
                  {earnedList.length === 0 && <p className="text-[13px] text-muted">No badges yet.</p>}
                </div>
              </section>
            </aside>
          </div>
        </TabPanel>

        <TabPanel id="history" value={tab} layoutKey="profile" className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] text-muted">
              {history.length} most recent rounds. Every round links to its commit–reveal proof.
            </p>
            <DemoBadge />
          </div>
          <RoundHistory rounds={history} />
        </TabPanel>

        <TabPanel id="achievements" value={tab} layoutKey="profile" className="mt-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13.5px] text-muted">
              {earnedList.length} of {achievements.length} earned. Badges are collectible records of play; none are mintable yet.
            </p>
            <Badge tone="outline">NFT minting later</Badge>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {achievements.map((a) => {
              const at = earned.get(a.id);
              return (
                <li key={a.id} className="flex flex-col items-center text-center">
                  <AchievementBadge achievement={a} earned={at !== undefined} size="lg" />
                  <h3 className={at !== undefined ? "mt-4 text-[14px] font-medium text-ink" : "mt-4 text-[14px] font-medium text-muted"}>{a.name}</h3>
                  <p className="mt-1 max-w-[18ch] text-[12.5px] leading-snug text-muted">{a.description}</p>
                  <p className="mt-2 text-[10.5px] uppercase tracking-[0.14em] text-faint">{at !== undefined ? `Earned ${formatDemoDate(at)}` : `${rarityLabel[a.rarity]} · Locked`}</p>
                </li>
              );
            })}
          </ul>
        </TabPanel>
      </div>
    </div>
  );
}
