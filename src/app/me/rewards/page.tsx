import type { Metadata } from "next";
import { MeRewards } from "@/components/account/me-subpages";

export const metadata: Metadata = { title: "My rewards", robots: { index: false } };

export default function MeRewardsPage() {
  return <MeRewards />;
}
