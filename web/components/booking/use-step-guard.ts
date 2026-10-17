"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBooking } from "@/components/booking/wizard-store";
import { redirectTargetFor, type BookingStep } from "@/lib/booking/guards";

/**
 * Redirects away from a /book-mobile-service step whose prerequisites
 * aren't met by the current booking state -- mirrors
 * components/wizard/use-step-guard.ts exactly, just wired to the
 * booking wizard's own store/guards.
 */
export function useBookingStepGuard(step: BookingStep): boolean {
  const router = useRouter();
  const { state, isHydrated } = useBooking();

  const target = isHydrated ? redirectTargetFor(step, state) : null;

  useEffect(() => {
    if (!isHydrated || !target) return;
    router.replace(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, target, router]);

  return isHydrated && !target;
}
