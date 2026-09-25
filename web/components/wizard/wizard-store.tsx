"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initialWizardState, type WizardState } from "@/lib/wizard/types";

const STORAGE_KEY = "ecu-wizard-state";

type WizardContextValue = {
  state: WizardState;
  /** Shallow-merges `patch` into the current state. */
  update: (patch: Partial<WizardState>) => void;
  /** Clears wizard state both in memory and in sessionStorage (used on
   * /order/confirmation once an order has been placed). */
  reset: () => void;
};

const WizardContext = createContext<WizardContextValue | null>(null);

function readStoredState(): WizardState {
  if (typeof window === "undefined") {
    return initialWizardState;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initialWizardState;
    // Merge over the defaults so a state shape added in a later release
    // doesn't crash on an older stored blob from the same tab.
    return { ...initialWizardState, ...JSON.parse(raw) };
  } catch {
    return initialWizardState;
  }
}

/**
 * Provides the wizard's shared state to every /order/* step.
 *
 * The wizard is entirely client-side state persisted to sessionStorage,
 * not a server session: it survives a reload or a back/forward
 * navigation within the same tab, but never leaks between tabs or
 * persists past the browser session, and none of it is trusted
 * server-side (see the doc comment in lib/wizard/types.ts).
 *
 * State starts as `initialWizardState` on every render (so server and
 * first client render match — this component has no children rendered
 * on the server anyway, since app/(public)/order/layout.tsx is itself a
 * plain Server Component wrapping this Client Component) and hydrates
 * from sessionStorage in an effect after mount.
 */
export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialWizardState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readStoredState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Skip the write that would happen before hydration reads the
    // stored value — otherwise a real stored state gets immediately
    // clobbered with initialWizardState on mount.
    if (!hydrated) return;

    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage can throw (private browsing, quota exceeded).
      // The wizard keeps working in memory for the current page load;
      // it just won't survive a reload in that case.
    }
  }, [state, hydrated]);

  const value = useMemo<WizardContextValue>(
    () => ({
      state,
      update: (patch) => setState((prev) => ({ ...prev, ...patch })),
      reset: () => {
        setState(initialWizardState);
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      },
    }),
    [state],
  );

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);

  if (!ctx) {
    throw new Error("useWizard() must be called within a WizardProvider");
  }

  return ctx;
}
