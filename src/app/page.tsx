import { Hero } from "@/components/home/hero";
import { SolvencyStrip } from "@/components/home/solvency-strip";
import { LiveTables } from "@/components/home/live-tables";
import { HowItWorks } from "@/components/home/how-it-works";
import { NftChips } from "@/components/home/nft-chips";
import { RewardsSection } from "@/components/home/rewards";
import { ClosingCta } from "@/components/home/closing-cta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <SolvencyStrip />
      <LiveTables />
      <HowItWorks />
      <NftChips />
      <RewardsSection />
      <ClosingCta />
    </>
  );
}
