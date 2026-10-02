import { AGENT_STATE_SHORT, AGENT_STATE_LABEL, stateColorVar, type AgentState } from "@/lib/agent/states";
import { cn } from "@/lib/utils";

/** Tiny state indicator: dot + micro label. Never an oversized badge. */
export function AgentStatus({ state, long, className, pulse }: { state: AgentState; long?: boolean; className?: string; pulse?: boolean }) {
  const color = stateColorVar(state);
  const live = state === "executing" || state === "locked" || state === "observing";
  return (
    <span className={cn("inline-flex items-center gap-1.5 microlabel", className)} style={{ color: state === "paused" || state === "sleeping" || state === "skipped" ? "var(--agent-paused)" : undefined }}>
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full" style={{ background: color }} />
        {(pulse ?? live) && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: color, animationDuration: state === "executing" ? "0.9s" : "2.4s" }} />}
      </span>
      <span>{long ? AGENT_STATE_LABEL[state] : AGENT_STATE_SHORT[state]}</span>
    </span>
  );
}
