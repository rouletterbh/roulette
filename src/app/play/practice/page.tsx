import type { Metadata } from "next";
import { GameTable } from "@/components/roulette/game-table";

export const metadata: Metadata = { title: "Practice roulette", description: "Free practice roulette. No money, no rewards, same wheel." };

export default function PracticePage() {
  return <GameTable config={{ mode: "practice", name: "Practice table" }} />;
}
