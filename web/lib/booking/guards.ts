import type { BookingState } from "@/lib/booking/types";

/**
 * The /book-mobile-service steps that have their own guarded page.
 * "confirmation" isn't included: by the time it renders, submitService
 * has already reset the booking state (mirroring how /order/confirmation
 * works for the ECU wizard), so there's nothing left in BookingState to
 * check against.
 */
export type BookingStep = "contact" | "vehicle" | "services";

const STEP_PATHS: Record<BookingStep, string> = {
  contact: "/book-mobile-service/contact",
  vehicle: "/book-mobile-service/vehicle",
  services: "/book-mobile-service/services",
};

function hasContact(state: BookingState): boolean {
  return state.contact !== null;
}

function hasVehicle(state: BookingState): boolean {
  return hasContact(state) && state.vehicle !== null;
}

/**
 * Where a customer landing on `step` should be redirected instead, or
 * `null` if `step`'s own prerequisites are met and it's fine to render.
 * Each check only looks at what a prior step should already have
 * collected, same convention as lib/wizard/guards.ts.
 */
export function redirectTargetFor(step: BookingStep, state: BookingState): string | null {
  switch (step) {
    case "contact":
      return null;
    case "vehicle":
      return hasContact(state) ? null : STEP_PATHS.contact;
    case "services":
      if (!hasContact(state)) return STEP_PATHS.contact;
      return hasVehicle(state) ? null : STEP_PATHS.vehicle;
    default:
      return null;
  }
}
