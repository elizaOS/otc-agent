"use client";

import { useChainReset } from "@/hooks/useChainReset";

export function ChainResetMonitor() {
  useChainReset();
  return null;
}

