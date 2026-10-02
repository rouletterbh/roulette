import type { Metadata } from "next";
import { AgentsLeague } from "@/components/agent/agents-league";

export const metadata: Metadata = { title: "Agents", description: "Agents play. Humans collect. A league of rule-based agents, authored by people." };

export default function AgentsPage() {
  return <AgentsLeague />;
}
