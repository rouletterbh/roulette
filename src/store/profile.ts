"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Local-only cosmetic profile settings (display name, avatar seed). Never sent anywhere. */
interface ProfileState {
  displayName: string;
  avatarSeed: string;
  setDisplayName: (v: string) => void;
  setAvatarSeed: (v: string) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      displayName: "",
      avatarSeed: "",
      setDisplayName: (displayName) => set({ displayName: displayName.slice(0, 24) }),
      setAvatarSeed: (avatarSeed) => set({ avatarSeed }),
    }),
    { name: "profile-local" },
  ),
);
