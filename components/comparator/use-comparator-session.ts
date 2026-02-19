"use client"

import type { UseComparatorSessionArgs } from "@/components/comparator/comparator-session-types"
import { useSessionHydration } from "@/components/comparator/use-session-hydration"
import { useSessionPersistence } from "@/components/comparator/use-session-persistence"

export function useComparatorSession(args: UseComparatorSessionArgs) {
  // Keep hydration and persistence concerns separate to avoid lifecycle coupling.
  const { isSessionHydrated } = useSessionHydration(args)
  const { clearSavedSession } = useSessionPersistence(args, isSessionHydrated)

  return {
    isSessionHydrated,
    clearSavedSession,
  }
}
