import type { Metadata } from "next";
import { ExploreView } from "@/components/table/explore-view";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return <ExploreView />;
}
