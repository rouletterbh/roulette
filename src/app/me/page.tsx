import type { Metadata } from "next";
import { AccountOverview } from "@/components/account/account-overview";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function MePage() {
  return <AccountOverview />;
}
