"use client";

import { MeShell } from "./me-shell";
import { ReferralsPanel } from "./referrals-panel";

export function ReferralsView() {
  return (
    <MeShell eyebrow="Referrals" title="Bring a friend to the table." lede="Share your link. When they play for real, you both earn from the reward inventory, never from the bankroll.">
      {({ address }) => <ReferralsPanel address={address} />}
    </MeShell>
  );
}
