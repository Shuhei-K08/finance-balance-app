"use client";

import { initialState } from "./sample-data";
import { LedgerState } from "./types";

const key = "mirai-ledger-state";

export function loadState(): LedgerState {
  if (typeof window === "undefined") return initialState;
  const raw = window.localStorage.getItem(key);
  if (!raw) return initialState;
  try {
    return JSON.parse(raw) as LedgerState;
  } catch {
    return initialState;
  }
}

export function saveState(state: LedgerState) {
  window.localStorage.setItem(key, JSON.stringify(state));
}
