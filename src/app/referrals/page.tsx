import type { Metadata } from "next";
import { ReferralsView } from "@/components/account/referrals-view";

export const metadata: Metadata = {
  title: "Referrals",
  description: "Invite players. Rewards vest only after verified real-money play and are never funded from wager collateral.",
};

export default function ReferralsPage() {
  return <ReferralsView />;
}
