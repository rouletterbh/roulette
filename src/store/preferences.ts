"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Preferences {
  soundEnabled: boolean;
  reducedMotion: boolean;
  sessionReminderMinutes: number | null;
  setSound: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  setSessionReminder: (m: number | null) => void;
}

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      soundEnabled: false,
      reducedMotion: false,
      sessionReminderMinutes: null,
      setSound: (soundEnabled) => set({ soundEnabled }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setSessionReminder: (sessionReminderMinutes) => set({ sessionReminderMinutes }),
    }),
    { name: "preferences" },
  ),
);
