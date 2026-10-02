"use client";

import { useEffect } from "react";
import { usePreferences } from "@/store/preferences";
import { setSoundEnabled } from "@/lib/sound/engine";
import { cn } from "@/lib/utils";

export function SoundToggle({ className }: { className?: string }) {
  const { soundEnabled, setSound } = usePreferences();
  useEffect(() => setSoundEnabled(soundEnabled), [soundEnabled]);
  return (
    <button
      type="button"
      onClick={() => setSound(!soundEnabled)}
      aria-pressed={soundEnabled}
      aria-label={soundEnabled ? "Mute sounds" : "Enable sounds"}
      className={cn("inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-[12px] font-medium transition-colors hover:border-ink", className)}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {soundEnabled ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /> : <path d="m22 9-6 6M16 9l6 6" />}
      </svg>
      <span className="hidden sm:inline">{soundEnabled ? "Sound on" : "Sound off"}</span>
    </button>
  );
}
