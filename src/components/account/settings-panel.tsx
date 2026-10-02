"use client";

import Link from "next/link";
import { useId } from "react";
import { usePreferences } from "@/store/preferences";
import { useProfile } from "@/store/profile";
import { setSoundEnabled } from "@/lib/sound/engine";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const reminderOptions = [
  { value: "", label: "Off" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "120", label: "Every 2 hours" },
];

/** Display name, avatar seed and play preferences. Everything is local to this browser. */
export function SettingsPanel({ address, className }: { address: string; className?: string }) {
  const { soundEnabled, reducedMotion, sessionReminderMinutes, setSound, setReducedMotion, setSessionReminder } = usePreferences();
  const { displayName, avatarSeed, setDisplayName, setAvatarSeed } = useProfile();
  const nameId = useId();
  const reminderId = useId();
  const seed = avatarSeed || address;

  return (
    <div className={cn("grid gap-12 md:grid-cols-2", className)}>
      <div className="space-y-8">
        <div>
          <label htmlFor={nameId} className="block text-[14.5px] font-medium text-ink">
            Display name
          </label>
          <p className="mt-0.5 text-[13px] text-muted">Shown instead of your address on tables and rankings. Stored only in this browser.</p>
          <input
            id={nameId}
            type="text"
            value={displayName}
            maxLength={24}
            placeholder="Up to 24 characters"
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-3 h-11 w-full rounded-xl border border-border bg-surface px-4 text-[14.5px] text-ink placeholder:text-faint focus:border-border-strong focus:outline-none dark:bg-elevated"
          />
        </div>

        <div>
          <p className="text-[14.5px] font-medium text-ink">Avatar</p>
          <p className="mt-0.5 text-[13px] text-muted">Generated from a seed. Your address is the default; reshuffle for a new pattern.</p>
          <div className="mt-3 flex items-center gap-4">
            <PlayerAvatar address={seed} size={56} name={displayName || "your"} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAvatarSeed(`${address}:${Date.now().toString(36)}`)}>
                Reshuffle
              </Button>
              {avatarSeed && (
                <Button variant="ghost" size="sm" onClick={() => setAvatarSeed("")}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <Switch
          label="Sound"
          description="Chip clicks, wheel spin and settlement cues. Synthesized, no audio files."
          checked={soundEnabled}
          onChange={(v) => {
            setSound(v);
            setSoundEnabled(v);
          }}
        />
        <Switch label="Reduce motion" description="Shorter wheel animation and no decorative movement." checked={reducedMotion} onChange={setReducedMotion} />
        <div className="hairline-t pt-6">
          <label htmlFor={reminderId} className="block text-[14.5px] font-medium text-ink">
            Session reminder
          </label>
          <p className="mt-0.5 text-[13px] text-muted">A quiet note of how long you have been at the table.</p>
          <select
            id={reminderId}
            value={sessionReminderMinutes?.toString() ?? ""}
            onChange={(e) => setSessionReminder(e.target.value ? Number(e.target.value) : null)}
            className="mt-3 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[14.5px] text-ink focus:border-border-strong focus:outline-none dark:bg-elevated"
          >
            {reminderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-3 text-[12.5px] text-muted">
            Limits, time-outs and self-exclusion live on{" "}
            <Link href="/responsible-play" className="underline underline-offset-4 hover:text-ink">
              Responsible play
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
