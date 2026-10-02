import type { Metadata } from "next";
import { MeHistory } from "@/components/account/me-subpages";

export const metadata: Metadata = { title: "Game history", robots: { index: false } };

export default function MeHistoryPage() {
  return <MeHistory />;
}
