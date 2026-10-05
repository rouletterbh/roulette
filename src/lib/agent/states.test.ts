import { describe, expect, it } from "vitest";
import { AGENT_STATE_LABEL, RUNNER_PHASE_LABEL, runnerPhaseState, type ChainRunnerPhase } from "./states";

describe("on-chain runner phases in the operator vocabulary", () => {
  const phases = Object.keys(RUNNER_PHASE_LABEL) as ChainRunnerPhase[];

  it("every runner phase maps to an existing agent state", () => {
    for (const p of phases) expect(AGENT_STATE_LABEL[runnerPhaseState(p)]).toBeTruthy();
  });

  it("failures never read as active", () => {
    expect(runnerPhaseState("out-of-gas")).toBe("paused");
    expect(runnerPhaseState("rpc-error")).toBe("paused");
    expect(runnerPhaseState("swept")).toBe("stopped");
    expect(runnerPhaseState("awaiting-funds")).toBe("waiting");
  });

  it("copy never uses the word demo", () => {
    for (const p of phases) expect(RUNNER_PHASE_LABEL[p].toLowerCase()).not.toContain("demo");
  });
});
