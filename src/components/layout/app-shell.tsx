import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { DemoBanner } from "./demo-banner";
import { AgentDock } from "@/components/agent/agent-dock";
import { ActivityDrawer } from "./activity-drawer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-canvas">
        Skip to content
      </a>
      <DemoBanner />
      <Navbar />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <ActivityDrawer />
      <AgentDock />
    </>
  );
}
