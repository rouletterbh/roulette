"use client";

import Link from "next/link";
import { MeShell, MeSection } from "./me-shell";
import { ChipsPanel } from "./chips-panel";
import { RewardsPanel, ClaimsList } from "./rewards-panel";
import { DemoTransactions } from "./demo-transactions";
import { SettingsPanel } from "./settings-panel";
import { RoundHistory } from "@/components/player/round-history";
import { Button } from "@/components/ui/button";
import { StatList } from "@/components/ui/stat";
import { getAccountDemo, getHistory, getPlayer } from "@/lib/demo/players";
import { formatUsd } from "@/lib/utils";

const sections = [
  { id: "balance", label: "Balance" },
  { id: "chips", label: "Chips" },
  { id: "rewards", label: "Rewards" },
  { id: "claims", label: "Claims" },
  { id: "history", label: "Game history" },
  { id: "transactions", label: "Transactions" },
  { id: "referrals", label: "Referrals" },
  { id: "settings", label: "Settings" },
] as const;

export function AccountOverview() {
  return (
    <MeShell title="Everything you hold, in one place." lede="Chips, win balance, claims and history for the connected wallet." sections={sections}>
      {({ address }) => {
        const demo = getAccountDemo(address);
        const profile = getPlayer(address);
        const history = getHistory(address).slice(0, 6);
        return (
          <>
            <MeSection id="balance" title="Balance" description="Chips are the only thing you wager. Win balance is what you can claim.">
              <StatList
                columns={3}
                size="lg"
                items={[
                  { label: "Chips", value: demo.chipTotal.toLocaleString("en-US"), hint: "ERC-1155, in your wallet" },
                  { label: "Win balance", value: formatUsd(demo.winBalance), hint: "claimable now" },
                  { label: "In escrow", value: "0", hint: "no open rounds" },
                ]}
              />
            </MeSection>

            <MeSection id="chips" title="Chips" action={<Link href="/me/chips" className="text-[13px] underline underline-offset-4 hover:text-ink">Details</Link>}>
              <ChipsPanel chips={demo.chips} total={demo.chipTotal} />
            </MeSection>

            <MeSection id="rewards" title="Rewards" action={<Link href="/me/rewards" className="text-[13px] underline underline-offset-4 hover:text-ink">All rewards</Link>}>
              <RewardsPanel winBalance={demo.winBalance} compact />
              <p className="mt-6 text-[13px] text-muted">
                Claims settle through the <Link href="/cashier" className="underline underline-offset-4 hover:text-ink">cashier</Link> in supported crypto and Stock Tokens.
              </p>
            </MeSection>

            <MeSection id="claims" title="Claims" description="Each claim is a treasury payout you initiated.">
              <ClaimsList claims={demo.claims} />
            </MeSection>

            <MeSection
              id="history"
              title="Game history"
              description={profile ? `${profile.games.toLocaleString("en-US")} rounds settled · ${profile.wins.toLocaleString("en-US")} won` : undefined}
              action={<Link href="/me/history" className="text-[13px] underline underline-offset-4 hover:text-ink">Full history</Link>}
            >
              <RoundHistory rounds={history} emptyLabel="No settled rounds for this wallet yet." />
            </MeSection>

            <MeSection id="transactions" title="Transactions" description="Onchain movements touching this wallet.">
              <DemoTransactions transactions={demo.transactions} />
            </MeSection>

            <MeSection id="referrals" title="Referrals" description="Invite players. Rewards vest only after verified real-money play.">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border px-5 py-4">
                <p className="text-[14px]">
                  Code <span className="font-mono tnum text-ink">{demo.referrals.code}</span> · {demo.referrals.referred.length} referred
                </p>
                <Button href="/referrals" variant="outline" size="sm">
                  Open referrals
                </Button>
              </div>
            </MeSection>

            <MeSection id="settings" title="Settings" description="Preferences are stored in this browser only.">
              <SettingsPanel address={address} />
            </MeSection>
          </>
        );
      }}
    </MeShell>
  );
}
