import type { Metadata } from "next";
import { MeChips } from "@/components/account/me-subpages";

export const metadata: Metadata = { title: "My chips", robots: { index: false } };

export default function MeChipsPage() {
  return <MeChips />;
}
