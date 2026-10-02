"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during SSR and hydration, true once mounted on the client. No effect-driven setState. */
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/** window.location.origin on the client, "" on the server. */
export function useOrigin() {
  return useSyncExternalStore(subscribe, () => window.location.origin, () => "");
}
