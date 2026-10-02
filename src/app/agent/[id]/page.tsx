import type { Metadata } from "next";
import { AgentProfile } from "@/components/agent/agent-profile";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentPage({ params }: PageProps<"/agent/[id]">) {
  const { id } = await params;
  return <AgentProfile id={id} />;
}
