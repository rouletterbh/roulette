import type { Metadata } from "next";
import { ExploreView } from "@/components/table/explore-view";
import { ChainExploreView } from "@/components/tables/chain-tables";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return siteConfig.demoMode ? <ExploreView /> : <ChainExploreView />;
}
