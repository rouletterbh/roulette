import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { robinhoodChain, robinhoodChainTestnet } from "@/config/chains";
import { datasetCatalog } from "@/lib/agent/datasets";
import { API_VERSION } from "@/lib/agent/envelope";
import { FUNCTION_SIGNATURES } from "@/lib/agent/intents";

export const metadata: Metadata = {
  title: "Developers",
  description: "Agent-ready REST API, MCP server and dataset catalog for a social roulette club built on Robinhood Chain. Read, verify, quote and build unsigned intents; never sign.",
};

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 grid gap-6 py-16 md:grid-cols-[200px_minmax(0,1fr)] md:gap-16" aria-labelledby={`${id}-h`}>
      <div className="md:sticky md:top-28 md:self-start">
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <div className="min-w-0 max-w-3xl">
        <h2 id={`${id}-h`} className="font-display text-display-sm text-balance">
          {title}
        </h2>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
      </div>
    </section>
  );
}

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-surface dark:bg-elevated">
      {label && <figcaption className="hairline-b px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">{label}</figcaption>}
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-ink">{children}</pre>
    </figure>
  );
}

const endpoints = [
  ["GET", "/api/v1/health", "Chain, demo mode, deployment status"],
  ["GET", "/api/v1/tables", "Tables with effective limits"],
  ["GET", "/api/v1/tables/{id}", "One table"],
  ["GET", "/api/v1/treasury", "Solvency snapshot and per-round cap"],
  ["GET", "/api/v1/limits?multiplier=35", "Max safe stake for a payout multiplier"],
  ["GET", "/api/v1/rewards", "Reward inventory and statuses"],
  ["GET", "/api/v1/rounds", "Settled rounds with fairness proofs"],
  ["GET", "/api/v1/rounds/{id}", "One round, with a ready verify body"],
  ["GET", "/api/v1/stats", "Outcome counts over a window"],
  ["POST", "/api/v1/verify", "Recompute a commit–reveal proof"],
  ["POST", "/api/v1/quote", "Validate bets against the treasury limit"],
  ["POST", "/api/v1/intents/enter-table", `Unsigned ${FUNCTION_SIGNATURES.enterTable.split("(")[0]}`],
  ["POST", "/api/v1/intents/place-bets", `Unsigned ${FUNCTION_SIGNATURES.placeBets.split("(")[0]}`],
  ["POST", "/api/v1/intents/leave-table", `Unsigned ${FUNCTION_SIGNATURES.leaveTable.split("(")[0]}`],
  ["POST", "/api/v1/intents/claim", `Unsigned RewardVault.${FUNCTION_SIGNATURES.claimAs.split("(")[0]}`],
  ["GET", "/api/v1/openapi.json", "OpenAPI 3.1 document"],
  ["GET", "/api/v1/datasets", "Dataset catalog"],
] as const;

const mcpTools = [
  "get_health",
  "list_tables",
  "get_table",
  "get_treasury",
  "get_limits",
  "list_rewards",
  "list_rounds",
  "get_round",
  "get_stats",
  "verify_round",
  "quote_bets",
  "build_enter_table_intent",
  "build_place_bets_intent",
  "build_leave_table_intent",
  "build_claim_intent",
];

export default function DevelopersPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Eyebrow className="mb-4 block">Developers</Eyebrow>
          <h1 className="font-display text-display-lg text-balance">Agent-ready by design.</h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
            Everything a player can see, an agent can read. Everything a player can do, an agent can prepare. Nothing is signed here: your wallet
            signs, the treasury enforces the limits, and the same gates apply to everyone.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DemoBadge />
          <Badge tone="amber">API beta · {API_VERSION}</Badge>
        </div>
      </div>

      <nav aria-label="Sections" className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted hairline-b pb-6">
        {[
          ["capabilities", "What an agent can do"],
          ["safety", "Safety model"],
          ["quickstart", "Quickstart"],
          ["mcp", "MCP server"],
          ["endpoints", "Endpoints"],
          ["datasets", "Datasets"],
          ["status", "Status"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="transition-colors hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <div className="divide-y divide-hairline">
        <Section id="capabilities" eyebrow="Capabilities" title="Read, verify, quote, build intents. Never sign.">
          <p>
            {siteConfig.name} exposes one machine interface in two shapes: a JSON REST API under <code className="font-mono text-[13px] text-ink">/api/v1</code>{" "}
            and an MCP server that wraps it. Any agent framework that can make an HTTP request or speak the Model Context Protocol can use it.
          </p>
          <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border text-[14px] sm:grid-cols-2">
            {[
              ["Read", "Tables, limits, treasury snapshot, reward inventory, settled rounds and outcome counts. Public, cacheable, CORS-open."],
              ["Verify", "Recompute keccak256(serverSeed) against the commitment and derive the pocket for any round. Pure math over your input."],
              ["Quote", "Run the exact pre-acceptance check the table runs: payout per bet, worst-case liability and whether it fits under the per-round cap."],
              ["Build intents", "Get unsigned calldata for enterTable, placeBets, leaveTable and claimAs. The intent names the contract, chain id, ABI and args. You sign it, or you do not."],
            ].map(([k, v]) => (
              <li key={k} className="bg-surface p-5 dark:bg-elevated">
                <div className="font-display text-xl text-ink">{k}</div>
                <p className="mt-2 text-[13.5px] leading-relaxed">{v}</p>
              </li>
            ))}
          </ol>
          <p>
            Responses share one envelope: <code className="font-mono text-[13px] text-ink">{`{ ok, demo, data }`}</code> or{" "}
            <code className="font-mono text-[13px] text-ink">{`{ ok: false, error: { code, message } }`}</code>. While the protocol runs on simulated data,{" "}
            <strong>every response says so</strong> with <code className="font-mono text-[13px] text-ink">demo: true</code>.
          </p>
        </Section>

        <Section id="safety" eyebrow="Safety model" title="The wallet signs. The treasury decides. The gates apply to everyone.">
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <strong>No custody, no signing.</strong> Write routes return unsigned transaction intents with <code className="font-mono text-[13px] text-ink">to</code>,{" "}
              <code className="font-mono text-[13px] text-ink">chainId</code>, <code className="font-mono text-[13px] text-ink">data</code> and a human-readable description. The API never sees a
              private key. An agent that cannot sign cannot move anything.
            </li>
            <li>
              <strong>Limits are enforced before acceptance, on chain.</strong> The quote shows you the result of the solvency check in advance, but the contract re-runs{" "}
              <code className="font-mono text-[13px] text-ink">RiskEngine.checkWager</code> over the whole round and reverts if the worst-case payout exceeds the per-round exposure cap. There is
              no API path around it.
            </li>
            <li>
              <strong>Same rules as humans.</strong> Agents are bound by the same age, jurisdiction and responsible-play gates as human players. Stock Token settlement is jurisdiction-gated
              regardless of who prepares the transaction. See <Link href="/responsible-play" className="text-ink underline underline-offset-2">Responsible Play</Link> and{" "}
              <Link href="/restricted-jurisdictions" className="text-ink underline underline-offset-2">Restricted Jurisdictions</Link>.
            </li>
            <li>
              <strong>Verifiable outcomes.</strong> Every round carries its commitment, revealed seeds and block reference. Agents should re-verify what they observe; the derivation is public and
              identical to the one on the <Link href="/fairness" className="text-ink underline underline-offset-2">Fairness</Link> page.
            </li>
            <li>
              <strong>Neutral data.</strong> The stats endpoint describes the past. It is not a signal; every spin is independent and the documentation says so wherever counts appear.
            </li>
          </ul>
          <Code label="Intent shape">{`{
  "to": "0x…" | null,          // null until contracts deploy (CONTRACTS_NOT_DEPLOYED preview)
  "contract": "RouletteGame",
  "chainId": ${robinhoodChainTestnet.id},             // Robinhood Chain Testnet · mainnet ${robinhoodChain.id}
  "value": "0",
  "data": "0x…",               // ABI-encoded calldata your wallet signs
  "abi": { "name": "placeBets", "signature": "${FUNCTION_SIGNATURES.placeBets}", "args": [...] },
  "description": "Place 1 bet(s) on round 120500: Red 10.",
  "warnings": ["Unsigned intent. Review calldata and sign with your own wallet; this API never holds keys.", ...],
  "signedBy": "agent-wallet"
}`}</Code>
        </Section>

        <Section id="quickstart" eyebrow="Quickstart" title="Three calls to understand the protocol.">
          <Code label="1 · Health">{`curl -s https://<host>/api/v1/health | jq .data.chain`}</Code>
          <Code label="2 · Quote a bet set">{`curl -s -X POST https://<host>/api/v1/quote \\
  -H 'content-type: application/json' \\
  -d '{"bets":[{"betId":"red","stake":10},{"betId":"straight:17","stake":1}],"table":"neon-01"}' \\
  | jq '{accepted: .data.accepted, maxNetPayout: .data.maximumLiability.maxNetPayout, cap: .data.limit.maxRoundExposure}'`}</Code>
          <Code label="3 · Verify a round">{`ROUND=$(curl -s 'https://<host>/api/v1/rounds?limit=1' | jq '.data.rounds[0]')
curl -s -X POST https://<host>/api/v1/verify \\
  -H 'content-type: application/json' \\
  -d "$(echo "$ROUND" | jq '{roundId, commitment, serverSeed, playerSeed, blockRef, result}')" \\
  | jq .data`}</Code>
          <p>
            Bet ids are stable strings: <code className="font-mono text-[13px] text-ink">red</code>, <code className="font-mono text-[13px] text-ink">dozen:2</code>,{" "}
            <code className="font-mono text-[13px] text-ink">straight:17</code>, <code className="font-mono text-[13px] text-ink">split:17-20</code>,{" "}
            <code className="font-mono text-[13px] text-ink">corner:25</code>. Stakes are chip units. On chain, a bet is{" "}
            <code className="font-mono text-[13px] text-ink">{`{ uint64 numbersMask, uint16 multiplier, uint128 stake }`}</code> where bit <em>i</em> of the mask is pocket <em>i</em>; the
            intent builder does the conversion.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button href="/api/v1/openapi.json" variant="primary">
              OpenAPI 3.1 document
            </Button>
            <Button href="/api/v1/datasets" variant="outline">
              Dataset catalog JSON
            </Button>
          </div>
        </Section>

        <Section id="mcp" eyebrow="MCP server" title="Fifteen tools, stdio transport, zero keys.">
          <p>
            The MCP server lives in <code className="font-mono text-[13px] text-ink">agent/mcp</code> of the repository. It is a thin client over the REST API: every tool calls an endpoint and
            returns the structured result, so there is exactly one place where limits and encodings are defined.
          </p>
          <Code label="Claude Desktop · claude_desktop_config.json (or any MCP client)">{`{
  "mcpServers": {
    "roulette": {
      "command": "bun",
      "args": ["run", "/path/to/repo/agent/mcp/src/index.ts"],
      "env": { "ROULETTE_API_URL": "https://<host>" }
    }
  }
}`}</Code>
          <ul className="flex flex-wrap gap-2 pt-1">
            {mcpTools.map((t) => (
              <li key={t} className="rounded-full border border-border px-3 py-1 font-mono text-[12px] text-ink">
                {t}
              </li>
            ))}
          </ul>
          <p>
            The four <code className="font-mono text-[13px] text-ink">build_*</code> tools return intents, not receipts. Hand them to the wallet integration your agent already trusts.
          </p>
        </Section>

        <Section id="endpoints" eyebrow="Endpoints" title="Seventeen routes under /api/v1.">
          <ul className="divide-y divide-hairline hairline-t hairline-b">
            {endpoints.map(([method, path, desc]) => (
              <li key={path} className="grid gap-1 py-3 md:grid-cols-[64px_300px_1fr] md:gap-6">
                <span className={`font-mono text-[12px] ${method === "POST" ? "text-amber-700 dark:text-amber" : "text-muted"}`}>{method}</span>
                <span className="font-mono text-[13px] text-ink">{path}</span>
                <span className="text-[14px]">{desc}</span>
              </li>
            ))}
          </ul>
          <p>
            Reads are cached briefly and allow any origin. POST routes are lightly rate limited per client. Errors use stable codes:{" "}
            <code className="font-mono text-[13px] text-ink">VALIDATION_ERROR</code>, <code className="font-mono text-[13px] text-ink">NOT_FOUND</code>,{" "}
            <code className="font-mono text-[13px] text-ink">RATE_LIMITED</code>, <code className="font-mono text-[13px] text-ink">TABLE_LIMIT</code>,{" "}
            <code className="font-mono text-[13px] text-ink">CONTRACTS_NOT_DEPLOYED</code>.
          </p>
        </Section>

        <Section id="datasets" eyebrow="Datasets" title="What you can pull, how often it changes.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-border py-2 font-medium">Dataset</th>
                  <th className="border-b border-border py-2 font-medium">Endpoint</th>
                  <th className="border-b border-border py-2 font-medium">Refresh</th>
                  <th className="border-b border-border py-2 text-right font-medium">Fields</th>
                  <th className="border-b border-border py-2 text-right font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {datasetCatalog.map((d) => (
                  <tr key={d.id}>
                    <td className="border-b border-hairline py-2.5 pr-4 align-top">
                      <div className="font-medium text-ink">{d.title}</div>
                      <div className="mt-0.5 max-w-sm text-[12.5px] text-muted">{d.summary}</div>
                    </td>
                    <td className="border-b border-hairline py-2.5 pr-4 align-top font-mono text-[12px] text-ink">
                      {d.method} {d.endpoint}
                    </td>
                    <td className="border-b border-hairline py-2.5 pr-4 align-top text-muted">{d.refreshCadence}</td>
                    <td className="border-b border-hairline py-2.5 text-right align-top tnum">{d.fields.length}</td>
                    <td className="border-b border-hairline py-2.5 text-right align-top">
                      <Badge tone={d.demo ? "demo" : "outline"}>{d.demo ? "Demo" : "Live"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Field dictionaries, provenance and licensing notes for each dataset are in{" "}
            <a href="/api/v1/datasets" className="text-ink underline underline-offset-2">/api/v1/datasets</a>. The fairness-proof route is the only one that is not demo-backed: it is math
            over your input.
          </p>
        </Section>

        <Section id="status" eyebrow="Status" title="Beta, demo-backed, independent.">
          <div className="flex items-center gap-3">
            <Badge tone="amber">Beta</Badge>
            <span className="text-[13px]">Schema may change before v1.1. Pin to <code className="font-mono text-[12.5px] text-ink">X-API-Version</code>.</span>
          </div>
          <p>
            {siteConfig.name} is an <strong>independent product built on Robinhood Chain</strong>. It is not affiliated with, endorsed by or operated by Robinhood. The API is in beta
            and served from demo data until the contracts deploy; intents return <code className="font-mono text-[13px] text-ink">CONTRACTS_NOT_DEPLOYED</code> with a full preview until
            then. Nothing on this page is an invitation to wager where that is not lawful, and no availability, licence or audit is claimed. Contracts are{" "}
            <strong>NOT YET AUDITED</strong>.
          </p>
          <p>
            Explorer: <a href={robinhoodChain.blockExplorers.default.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">{robinhoodChain.blockExplorers.default.url.replace("https://", "")}</a>.
            Architecture and contract roles are on the <Link href="/technology" className="text-ink underline underline-offset-2">Technology</Link> page.
          </p>
        </Section>
      </div>
    </div>
  );
}
