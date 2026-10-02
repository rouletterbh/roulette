import type { Metadata } from "next";
import { GameTable } from "@/components/roulette/game-table";

export const metadata: Metadata = { title: "Quick play", description: "You against the protocol. The fastest way to the wheel." };

export default function QuickPlayPage() {
  return <GameTable config={{ mode: "quick", name: "Quick play", minBet: 1 }} />;
}
