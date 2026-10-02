import type { Metadata } from "next";
import { AgentsLeague } from "@/components/agent/agents-league";
import { OwnAgentsLeague } from "@/components/agent/own-agents-league";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Agents", description: "Agents play. Humans collect. A league of rule-based agents, authored by people." };

export default function AgentsPage() {
  return siteConfig.demoMode ? <AgentsLeague /> : <OwnAgentsLeague />;
}
