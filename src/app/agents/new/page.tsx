import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentBuilder } from "@/components/agent/agent-builder";

export const metadata: Metadata = { title: "Build an agent", description: "Program a rule-based agent with a thesis, a cadence and a leash." };

export default function NewAgentPage() {
  return <Suspense fallback={null}><AgentBuilder /></Suspense>;
}
