"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initialBookingState, type BookingState } from "@/lib/booking/types";

// Deliberately different from the ECU wizard's "ecu-wizard-state" key
// (components/wizard/wizard-store.tsx) -- the two flows must never
// collide in the same browser tab.
const STORAGE_KEY = "mobile-service-booking-state";

type BookingContextValue = {
  state: BookingState;
  /** Shallow-merges `patch` into the current state. */
  update: (patch: Partial<BookingState>) => void;
  /** Clears booking state both in memory and in sessionStorage (used on
   * /book-mobile-service/confirmation once a booking has been submitted). */
  reset: () => void;
  /** True once the initial sessionStorage read has completed. Before
   * this, `state` is always `initialBookingState` even when real data
   * is sitting in sessionStorage -- step guards must wait for it before
   * concluding a step's prerequisites aren't met. */
  isHydrated: boolean;
};

const BookingContext = createContext<BookingContextValue | null>(null);

function readStoredState(): BookingState {
  if (typeof window === "undefined") {
    return initialBookingState;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initialBookingState;
    return { ...initialBookingState, ...JSON.parse(raw) };
  } catch {
    return initialBookingState;
  }
}

/**
 * Provides the /book-mobile-service wizard's shared state to every step
 * — mirrors components/wizard/wizard-store.tsx's pattern exactly (own
 * provider, own hook, own storage key) rather than reusing it, since
 * this is a genuinely separate flow with its own state shape.
 */
export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookingState>(initialBookingState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readStoredState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage can throw (private browsing, quota exceeded) --
      // the wizard keeps working in memory for the current page load.
    }
  }, [state, hydrated]);

  const value = useMemo<BookingContextValue>(
    () => ({
      state,
      update: (patch) => setState((prev) => ({ ...prev, ...patch })),
      reset: () => {
        setState(initialBookingState);
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      },
      isHydrated: hydrated,
    }),
    [state, hydrated],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);

  if (!ctx) {
    throw new Error("useBooking() must be called within a BookingProvider");
  }

  return ctx;
}
