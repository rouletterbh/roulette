"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useWallet } from "@/store/wallet";
import { useAdmin, type PauseKey, type SuspiciousItem } from "@/store/admin";
import { rewardRegistry } from "@/config/tokens";
import { economicsBounds, validateEconomics, type EconomicsConfig } from "@/config/economics";
import { jurisdictions } from "@/config/jurisdictions";
import { demoTables, demoTreasury } from "@/lib/demo/data";
import { availableBankroll, getMaximumSafeBet } from "@/lib/risk/engine";
import { demoRelativeTime, formatDemoDateTime } from "@/lib/demo/players";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { StatList, KeyRow } from "@/components/ui/stat";
import { cn, formatUsd, shortAddress } from "@/lib/utils";

const sections = [
  { id: "pause", label: "Pause switches" },
  { id: "tokens", label: "Supported tokens" },
  { id: "inventory", label: "Reward inventory" },
  { id: "limits", label: "Table limits" },
  { id: "treasury", label: "Treasury buffers" },
  { id: "oracle", label: "Oracle" },
  { id: "liabilities", label: "Liabilities" },
  { id: "unsettled", label: "Unsettled rounds" },
  { id: "suspicious", label: "Suspicious activity" },
  { id: "jurisdictions", label: "Jurisdictions" },
] as const;

export function AdminDashboard({ allowlist }: { allowlist: string[] }) {
  const { status, address } = useWallet();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="container-edge py-16 md:py-24">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-8 h-[40vh] w-full rounded-2xl" />
      </div>
    );
  }

  const allowed = status === "connected" && !!address && allowlist.some((a) => a.toLowerCase() === address.toLowerCase());
  if (!allowed) return <NotFound />;

  return (
    <div className="container-edge py-12 md:py-20">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <Eyebrow>Operator</Eyebrow>
            <DemoBadge />
          </div>
          <h1 className="mt-4 font-display text-display-md text-balance">Controls, within the engine&rsquo;s limits.</h1>
          <p className="mt-4 max-w-lg text-[15px] text-muted">Pause, tune and review. Every value is simulated and nothing here signs a transaction.</p>
        </div>
        <p className="font-mono text-[12.5px] tnum text-muted">Signed in as {shortAddress(address!, 6)}</p>
      </div>

      <NeverNote />

      <nav aria-label="Dashboard sections" className="mt-10 lg:hidden">
        <ul className="no-scrollbar -mx-4 flex snap-x gap-1 overflow-x-auto px-4">
          {sections.map((s) => (
            <li key={s.id} className="shrink-0 snap-start">
              <a href={`#${s.id}`} className="inline-flex rounded-full border border-border px-3.5 py-1.5 text-[12.5px] text-muted hover:border-border-strong hover:text-ink">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 grid gap-12 lg:mt-14 lg:grid-cols-[200px_1fr] lg:gap-20">
        <nav aria-label="Dashboard sections" className="hidden lg:block">
          <ol className="sticky top-28 space-y-2 text-[13.5px]">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted transition-colors hover:text-ink">
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0">
          <PauseSection />
          <TokensSection />
          <InventorySection />
          <LimitsSection />
          <TreasurySection />
          <OracleSection />
          <LiabilitiesSection />
          <UnsettledSection />
          <SuspiciousSection />
          <JurisdictionsSection />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NotFound() {
  return (
    <div className="container-edge py-24 md:py-40">
      <div className="mx-auto max-w-md text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-4 font-display text-display-md">Not found.</h1>
        <p className="mt-4 text-[15px] text-muted">This page could not be found.</p>
        <Button href="/" variant="outline" className="mt-8">
          Back home
        </Button>
      </div>
    </div>
  );
}

function NeverNote() {
  const items = ["alter a completed outcome", "rewrite round history", "take or move player escrow", "change a submitted wager"];
  return (
    <aside className="mt-10 rounded-2xl border border-border-strong p-6 md:p-8" aria-labelledby="never-title">
      <h2 id="never-title" className="font-display text-3xl">
        What an operator can never do
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-[14.5px] text-ink">
            <span className="mt-[7px] h-px w-4 shrink-0 bg-ink" aria-hidden />
            {it}
          </li>
        ))}
      </ul>
      <p className="mt-5 max-w-2xl text-[13px] text-muted">
        These are contract invariants, not policies. Results derive from a committed seed before betting closes; escrow is released only by settlement. There is no interface for any of the above because none exists.
      </p>
    </aside>
  );
}

function Section({ id, title, description, children, action }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 py-12 first:pt-0 hairline-b last:border-b-0">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id={`${id}-title`} className="font-display text-3xl">
            {title}
          </h2>
          {description && <p className="mt-2 max-w-xl text-[13.5px] text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  error,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  error?: string | null;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[12px] text-muted">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
          className={cn(
            "h-10 w-full rounded-lg border bg-surface px-3 text-[14px] tnum text-ink focus:outline-none dark:bg-elevated",
            error ? "border-casino-red" : "border-border focus:border-border-strong",
          )}
        />
        {suffix && <span className="shrink-0 text-[12px] text-muted">{suffix}</span>}
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-[12px] text-casino-red">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const pauseMeta: Record<PauseKey, { label: string; description: string }> = {
  protocol: { label: "Protocol", description: "Halts everything below. Open rounds still settle from their committed seed." },
  deposits: { label: "Deposits", description: "Stops new deposits and chip mints. Existing chips remain playable." },
  gameplay: { label: "Gameplay", description: "No new wagers accepted. In-flight rounds reveal and settle normally." },
  claims: { label: "Claims", description: "Pauses win-balance claims. Balances are untouched and keep accruing." },
};

function PauseSection() {
  const { pauses, setPause } = useAdmin();
  const anyPaused = Object.values(pauses).some(Boolean);
  return (
    <Section id="pause" title="Pause switches" description="Each switch is independent. Pausing never changes an outcome or a balance." action={anyPaused ? <Badge tone="red">Paused</Badge> : <Badge tone="outline">All running</Badge>}>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
        {(Object.keys(pauseMeta) as PauseKey[]).map((k) => (
          <div key={k} className="bg-surface p-5 dark:bg-elevated">
            <Switch
              tone="red"
              label={`Pause ${pauseMeta[k].label.toLowerCase()}`}
              description={pauseMeta[k].description}
              checked={pauses[k] || (k !== "protocol" && pauses.protocol)}
              disabled={k !== "protocol" && pauses.protocol}
              onChange={(v) => setPause(k, v)}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

function TokensSection() {
  const { tokens, setTokenEnabled, setTokenMinPayout } = useAdmin();
  return (
    <Section id="tokens" title="Supported tokens" description="A token can be enabled only once its contract address is verified. None is set yet, so enabling is a dry run.">
      <ul className="divide-y divide-hairline">
        {rewardRegistry.map((t) => {
          const o = tokens[t.id];
          return (
            <li key={t.id} className="grid gap-4 py-4 md:grid-cols-[1fr_160px_150px_auto] md:items-center">
              <div className="min-w-0">
                <p className="text-[14.5px] font-medium text-ink">
                  {t.symbol} <span className="ml-1 text-[11px] uppercase tracking-[0.12em] text-faint">{t.category}</span>
                </p>
                <p className="truncate text-[12.5px] text-muted">{t.name}</p>
              </div>
              <dl className="text-[12.5px]">
                <dt className="text-muted">Contract</dt>
                <dd className="font-mono tnum text-ink">{t.contractAddress ?? "not set"}</dd>
              </dl>
              <NumberField label="Min payout" value={o.minimumPayout} min={0} step={0.5} suffix="USD" onChange={(v) => setTokenMinPayout(t.id, Number.isFinite(v) ? v : 0)} />
              <Switch tone="accent" label={o.enabled ? "Enabled" : "Disabled"} checked={o.enabled} onChange={(v) => setTokenEnabled(t.id, v)} className="md:flex-row-reverse md:gap-3" />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function InventorySection() {
  const inventory = useAdmin((s) => s.inventory);
  const total = inventory.reduce((s, l) => s + l.usdValue, 0);
  return (
    <Section id="inventory" title="Reward inventory" description={`${formatUsd(total)} USD-equivalent held for payouts in kind. Registry value: ${formatUsd(demoTreasury.rewardInventory)}.`}>
      <ul className="divide-y divide-hairline">
        {inventory.map((l) => (
          <li key={l.tokenId} className="flex items-center justify-between gap-4 py-3.5">
            <div>
              <p className="text-[14px] font-medium text-ink">{l.symbol}</p>
              <p className="text-[12px] tnum text-muted">{l.units} units</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[14px] tnum text-ink">{formatUsd(l.usdValue)}</span>
              <Badge tone={l.status === "stocked" ? "outline" : l.status === "low" ? "amber" : "muted"}>{l.status}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function LimitsSection() {
  const { tableLimits, setTableLimit } = useAdmin();
  const evenMoney = getMaximumSafeBet(demoTreasury, 1);
  const straight = getMaximumSafeBet(demoTreasury, 35);
  const cap = Math.floor(evenMoney.maxStake);
  const [drafts, setDrafts] = useState<Record<string, { minBet: number; maxBet: number }>>(() => ({ ...tableLimits }));

  const validate = (d: { minBet: number; maxBet: number }) => {
    if (!Number.isFinite(d.minBet) || !Number.isFinite(d.maxBet)) return "Enter both limits.";
    if (d.minBet < 1) return "Minimum bet must be at least 1 chip.";
    if (d.maxBet > cap) return `Exceeds the risk-engine cap of ${cap} chips (max round exposure ${evenMoney.maxRoundExposure.toFixed(2)}).`;
    if (d.minBet > d.maxBet) return "Minimum cannot exceed maximum.";
    return null;
  };

  return (
    <Section
      id="limits"
      title="Table limits"
      description={
        <>
          The engine caps any single-round exposure at {evenMoney.maxRoundExposure.toFixed(2)} chips, so the highest even-money stake is {cap} and the highest straight-up stake is {straight.maxStake.toFixed(2)}. Values above the cap are refused here and would be refused onchain.
        </>
      }
    >
      <ul className="divide-y divide-hairline">
        {demoTables.map((t) => {
          const d = drafts[t.id] ?? tableLimits[t.id];
          const err = validate(d);
          const dirty = d.minBet !== tableLimits[t.id].minBet || d.maxBet !== tableLimits[t.id].maxBet;
          return (
            <li key={t.id} className="grid gap-4 py-5 md:grid-cols-[1fr_140px_140px_auto] md:items-start">
              <div>
                <p className="text-[14.5px] font-medium text-ink">{t.name}</p>
                <p className="text-[12.5px] text-muted">
                  {t.status === "locked" ? t.lockedReason : `${t.players} players · ${t.speed}`}
                </p>
              </div>
              <NumberField label="Min bet" value={d.minBet} min={1} suffix="chips" onChange={(v) => setDrafts((s) => ({ ...s, [t.id]: { ...d, minBet: v } }))} />
              <NumberField label="Max bet" value={d.maxBet} min={1} max={cap} suffix="chips" error={err} onChange={(v) => setDrafts((s) => ({ ...s, [t.id]: { ...d, maxBet: v } }))} />
              <div className="md:pt-5">
                <Button size="sm" variant="outline" disabled={!!err || !dirty} onClick={() => setTableLimit(t.id, d)}>
                  Apply
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

const econLabels: Record<keyof EconomicsConfig, string> = {
  payoutLiquidityBps: "Payout liquidity",
  rewardInventoryBps: "Reward inventory",
  protocolReserveBps: "Protocol reserve",
  platformFeeBps: "Platform fee",
  safetyReserveBps: "Safety reserve",
  maxRoundExposureBps: "Max round exposure",
  minBankrollToOpen: "Min bankroll to open",
};

function TreasurySection() {
  const { economics, setEconomics, resetEconomics } = useAdmin();
  const [draft, setDraft] = useState<EconomicsConfig>(() => ({ ...economics }));
  const errors = useMemo(() => validateEconomics(draft), [draft]);
  const dirty = (Object.keys(draft) as Array<keyof EconomicsConfig>).some((k) => draft[k] !== economics[k]);
  const fieldError = (k: keyof EconomicsConfig) => errors.find((e) => e.startsWith(k)) ?? null;
  const splitTotal = draft.payoutLiquidityBps + draft.rewardInventoryBps + draft.protocolReserveBps + draft.platformFeeBps;

  return (
    <Section
      id="treasury"
      title="Treasury buffers"
      description="Deposit split and risk buffers, in basis points, validated against the declared bounds before anything is applied."
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => { resetEconomics(); setDraft({ ...economics }); }}>
            Reset
          </Button>
          <Button size="sm" variant="primary" disabled={errors.length > 0 || !dirty} onClick={() => setEconomics(draft)}>
            Apply
          </Button>
        </div>
      }
    >
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(econLabels) as Array<keyof EconomicsConfig>).map((k) => {
          const bounds = k in economicsBounds ? economicsBounds[k as keyof typeof economicsBounds] : null;
          return (
            <NumberField
              key={k}
              label={`${econLabels[k]}${bounds ? ` (${bounds[0]}–${bounds[1]})` : ""}`}
              value={draft[k]}
              min={bounds?.[0]}
              max={bounds?.[1]}
              suffix={k === "minBankrollToOpen" ? "USD" : "bps"}
              error={fieldError(k)}
              onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))}
            />
          );
        })}
      </div>
      <p className={cn("mt-5 text-[13px] tnum", splitTotal === 10_000 ? "text-muted" : "text-casino-red")} role={splitTotal === 10_000 ? undefined : "alert"}>
        Deposit split totals {splitTotal.toLocaleString("en-US")} / 10,000 bps.
      </p>
    </Section>
  );
}

function OracleSection() {
  const { oracle, setOracleStaleness } = useAdmin();
  return (
    <Section id="oracle" title="Oracle" description="Price feeds for reward conversion. A payout is refused when its feed is older than the staleness limit.">
      <div className="grid gap-10 md:grid-cols-[1fr_220px]">
        <dl className="divide-y divide-hairline">
          {oracle.feeds.map((f) => (
            <div key={f.asset} className="flex items-center justify-between gap-4 py-3 text-[14px]">
              <dt className="text-ink">{f.asset}</dt>
              <dd className="text-right">
                <span className="font-mono tnum text-muted">{f.address ?? "not set"}</span>
                <span className="ml-3 text-[11px] uppercase tracking-[0.12em] text-faint">{f.lastUpdate ? demoRelativeTime(f.lastUpdate) : "no data"}</span>
              </dd>
            </div>
          ))}
        </dl>
        <NumberField label="Max staleness" value={oracle.maxStalenessSeconds} min={60} max={86_400} step={60} suffix="s" onChange={(v) => Number.isFinite(v) && setOracleStaleness(v)} />
      </div>
    </Section>
  );
}

function LiabilitiesSection() {
  const { available, safety } = availableBankroll(demoTreasury);
  const t = demoTreasury;
  return (
    <Section id="liabilities" title="Liabilities" description="What the treasury owes or must hold back, against what it can still collateralize.">
      <StatList
        columns={4}
        items={[
          { label: "Bankroll", value: formatUsd(t.bankroll) },
          { label: "Reserved", value: formatUsd(t.reservedLiability), hint: "open rounds" },
          { label: "Claimable", value: formatUsd(t.claimableRewards), hint: "player win balances" },
          { label: "Available", value: formatUsd(available), hint: "for new wagers" },
        ]}
      />
      <dl className="mt-8 max-w-md">
        <KeyRow label="Protocol reserve">{formatUsd(t.protocolReserve)}</KeyRow>
        <KeyRow label="Safety reserve">{formatUsd(safety)}</KeyRow>
        <KeyRow label="Reward inventory">{formatUsd(t.rewardInventory)}</KeyRow>
        <KeyRow label="Revenue to date">{formatUsd(t.revenue)}</KeyRow>
      </dl>
    </Section>
  );
}

function UnsettledSection() {
  const unsettled = useAdmin((s) => s.unsettled);
  return (
    <Section id="unsettled" title="Unsettled rounds" description="Rounds with reserved liability. They settle on reveal; an operator can watch, not intervene.">
      <ul className="divide-y divide-hairline">
        {unsettled.map((r) => (
          <li key={r.roundId} className="flex items-center justify-between gap-4 py-3.5">
            <div>
              <p className="text-[14px] text-ink">
                <Link href={`/fairness?round=${r.roundId}`} className="tnum underline-offset-4 hover:underline">
                  #{r.roundId}
                </Link>
                <span className="ml-2 text-muted">{r.table}</span>
              </p>
              <p className="text-[12px] text-muted">
                Opened <time dateTime={new Date(r.openedAt).toISOString()} title={formatDemoDateTime(r.openedAt)}>{demoRelativeTime(r.openedAt)}</time>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[14px] tnum text-ink">{formatUsd(r.reservedLiability)}</span>
              <Badge tone="outline">{r.stage.replace("-", " ")}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const severityTone: Record<SuspiciousItem["severity"], "red" | "amber" | "muted"> = { high: "red", medium: "amber", low: "muted" };

function SuspiciousSection() {
  const { suspicious, setSuspiciousStatus } = useAdmin();
  return (
    <Section id="suspicious" title="Suspicious activity" description="Patterns flagged for review. A review can pause rewards for a wallet; it cannot touch escrow or history.">
      <ul className="divide-y divide-hairline">
        {suspicious.map((s) => (
          <li key={s.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={severityTone[s.severity]}>{s.severity}</Badge>
                <span className="font-mono text-[13px] tnum text-ink">{shortAddress(s.wallet, 6)}</span>
                <span className="text-[12px] text-muted">{demoRelativeTime(s.firstSeen)}</span>
              </div>
              <p className="mt-1 text-[13.5px] text-ink-2">{s.pattern}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`${s.id}-status`}>
                Status for {shortAddress(s.wallet)}
              </label>
              <select
                id={`${s.id}-status`}
                value={s.status}
                onChange={(e) => setSuspiciousStatus(s.id, e.target.value as SuspiciousItem["status"])}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink dark:bg-elevated"
              >
                <option value="open">Open</option>
                <option value="reviewing">Reviewing</option>
                <option value="cleared">Cleared</option>
              </select>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function JurisdictionsSection() {
  const counts = jurisdictions.reduce(
    (acc, j) => ({ ...acc, [j.status]: (acc[j.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  return (
    <Section
      id="jurisdictions"
      title="Jurisdictions"
      description={`${counts["enabled"] ?? 0} enabled · ${counts["restricted"] ?? 0} restricted · ${counts["pending-review"] ?? 0} pending review. Status changes require counsel sign-off and a code change; there is no switch here.`}
    >
      <ul className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {jurisdictions.map((j) => (
          <li key={j.code} className="flex items-center justify-between gap-3 bg-surface px-4 py-3 dark:bg-elevated">
            <div className="min-w-0">
              <p className="truncate text-[14px] text-ink">
                <span className="mr-2 font-mono text-[12px] text-muted">{j.code}</span>
                {j.name}
              </p>
              <p className="text-[11.5px] text-muted">{j.practice ? "Practice allowed" : "No practice"} · {j.realMoney ? "Real money" : "No real money"}</p>
            </div>
            <Badge tone={j.status === "enabled" ? "accent" : j.status === "restricted" ? "red" : "outline"}>{j.status.replace("-", " ")}</Badge>
          </li>
        ))}
      </ul>
    </Section>
  );
}
