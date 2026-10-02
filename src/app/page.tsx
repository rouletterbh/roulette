import { Hero } from "@/components/home/hero";
import { AgentCommandStrip } from "@/components/home/agent-command-strip";
import { MeetYourAgents } from "@/components/home/meet-your-agents";
import { LiveTables } from "@/components/home/live-tables";
import { DecisionTraceSection } from "@/components/home/decision-trace-section";
import { LeashSection } from "@/components/home/leash-section";
import { HowItWorks } from "@/components/home/how-it-works";
import { NftChips } from "@/components/home/nft-chips";
import { RewardsSection } from "@/components/home/rewards";
import { LeagueTeaser } from "@/components/home/league-teaser";
import { NetworkNeverSleeps } from "@/components/home/network-never-sleeps";
import { SolvencyStrip } from "@/components/home/solvency-strip";
import { DevTeaser } from "@/components/home/dev-teaser";
import { ClosingCta } from "@/components/home/closing-cta";
import { SystemTicker } from "@/components/agent/system-ticker";

export default function HomePage() {
  return (
    <>
      <Hero />
      <AgentCommandStrip className="mt-12" />
      <MeetYourAgents />
      <SystemTicker />
      <LiveTables />
      <DecisionTraceSection />
      <LeashSection />
      <HowItWorks />
      <NftChips />
      <RewardsSection />
      <LeagueTeaser />
      <NetworkNeverSleeps />
      <SolvencyStrip />
      <DevTeaser />
      <ClosingCta />
    </>
  );
}
