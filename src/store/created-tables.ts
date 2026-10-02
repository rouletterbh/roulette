"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TableSpeed } from "@/lib/demo/data";

export interface CreatedTable {
  id: string;
  name: string;
  visibility: "public" | "private";
  inviteCode: string;
  minBet: number;
  maxBet: number;
  seats: number;
  speed: TableSpeed;
  createdAt: number;
  host: string;
}

interface CreatedTablesState {
  tables: CreatedTable[];
  add: (t: CreatedTable) => void;
  find: (id: string) => CreatedTable | undefined;
}

export const useCreatedTables = create<CreatedTablesState>()(
  persist(
    (set, get) => ({
      tables: [],
      add: (t) => set({ tables: [t, ...get().tables] }),
      find: (id) => get().tables.find((t) => t.id === id || t.inviteCode === id),
    }),
    { name: "created-tables" },
  ),
);
