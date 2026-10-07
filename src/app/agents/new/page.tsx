import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentBuilder } from "@/components/agent/agent-builder";

export const metadata: Metadata = { title: "Start an agent", description: "Start an agent in three steps: pick a style, pick a budget, press Start. Or customise every rule." };

export default function NewAgentPage() {
  return <Suspense fallback={null}><AgentBuilder /></Suspense>;
}
