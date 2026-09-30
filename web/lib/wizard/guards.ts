import type { WizardState } from "@/lib/wizard/types";

/**
 * The wizard steps that have their own guarded page (everything except
 * /order/confirmation, which no longer has wizard state to check by the
 * time it renders — TASK-023 clears it before navigating there — and
 * already has its own "no order found" fallback for a direct link).
 *
 * "vehicle" covers vehicle, module, and part number/photo — those three
 * used to be separate steps (module, compatibility) but were combined
 * into a single /order/vehicle step; /order/module and
 * /order/compatibility now just redirect there.
 */
export type WizardStep = "vehicle" | "service" | "details" | "shipping";

const STEP_PATHS: Record<WizardStep, string> = {
  vehicle: "/order/vehicle",
  service: "/order/service",
  details: "/order/details",
  shipping: "/order/shipping",
};

/** True once the wizard has gone through /order/vehicle: a vehicle,
 * module category, part number, and photo were all submitted and
 * checkCompatibility actually ran (a result was stored, matched either
 * way). Deliberately checks matchResult's presence, not its outcome:
 * that's /order/service's job below. */
function hasCompatibilityChecked(state: WizardState): boolean {
  return (
    Boolean(state.vehicle) &&
    Boolean(state.categoryId) &&
    Boolean(state.partNumber) &&
    Boolean(state.stickerPhotoUrl) &&
    state.matchResult !== null
  );
}

/** True only when the compatibility check came back matched with at
 * least one confirmed service — the one condition /order/service is
 * allowed to render under (PRD 4.3: nothing to pick from otherwise). */
function hasSuccessfulMatch(state: WizardState): boolean {
  return (
    hasCompatibilityChecked(state) &&
    Boolean(state.matchResult?.matched) &&
    (state.matchResult?.services.length ?? 0) > 0
  );
}

/** True once whatever /order/service requires (a matched order) or
 * skips (a pending-review order) has actually happened. */
function hasServiceDecision(state: WizardState): boolean {
  if (!hasCompatibilityChecked(state)) return false;
  if (state.matchResult?.matched) return Boolean(state.serviceId);
  return true;
}

/** True once /order/details' always-required description has been
 * saved (only written to wizard state when that step's Next is
 * clicked — see details-form.tsx). */
function hasDetails(state: WizardState): boolean {
  return hasServiceDecision(state) && Boolean(state.description.trim());
}

/**
 * Where a customer landing on `step` should be redirected instead, or
 * `null` if `step`'s own prerequisites are met and it's fine to render.
 *
 * Each check only looks at what a PRIOR step should already have
 * collected — a step is always allowed to render before the customer
 * has filled in its own fields for the first time.
 */
export function redirectTargetFor(step: WizardStep, state: WizardState): string | null {
  switch (step) {
    case "vehicle":
      return null;
    case "service":
      // Redirects to /order/vehicle unless the store holds a successful
      // match — deliberately not a deeper chain, since a missing
      // vehicle, category, or part number also means no successful
      // match and lands here anyway.
      return hasSuccessfulMatch(state) ? null : STEP_PATHS.vehicle;
    case "details":
      if (!hasCompatibilityChecked(state)) return STEP_PATHS.vehicle;
      return hasServiceDecision(state) ? null : STEP_PATHS.service;
    case "shipping":
      if (!hasCompatibilityChecked(state)) return STEP_PATHS.vehicle;
      if (!hasServiceDecision(state)) return STEP_PATHS.service;
      return hasDetails(state) ? null : STEP_PATHS.details;
    default:
      return null;
  }
}
