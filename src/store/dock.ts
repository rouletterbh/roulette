"use client";

import { create } from "zustand";

interface DockState {
  open: boolean;
  activityOpen: boolean;
  setOpen: (v: boolean) => void;
  setActivityOpen: (v: boolean) => void;
}

export const useDock = create<DockState>()((set) => ({
  open: false,
  activityOpen: false,
  setOpen: (open) => set({ open, activityOpen: open ? false : undefined }),
  setActivityOpen: (activityOpen) => set({ activityOpen, open: activityOpen ? false : undefined }),
}));
