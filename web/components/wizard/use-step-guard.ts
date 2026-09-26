"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "@/components/wizard/wizard-store";
import { redirectTargetFor, type WizardStep } from "@/lib/wizard/guards";

/**
 * Redirects away from a wizard step whose prerequisites aren't met by
 * the current wizard state (TASK-024) — the case of deep-linking or
 * using browser back/forward to land on a step ahead of where the
 * customer actually is (e.g. /order/service with no confirmed match,
 * or /order/shipping with no description saved yet).
 *
 * Returns whether the step is clear to render: false while the wizard
 * store is still hydrating from sessionStorage (checking too early
 * would see `initialWizardState` and misread every step as
 * incomplete) and false for the one render where a redirect has just
 * been kicked off, so the caller can render nothing instead of a
 * flash of a step it's about to navigate away from.
 */
export function useStepGuard(step: WizardStep): boolean {
  const router = useRouter();
  const { state, isHydrated } = useWizard();

  const target = isHydrated ? redirectTargetFor(step, state) : null;

  useEffect(() => {
    if (!isHydrated || !target) return;
    router.replace(target);
    // state is intentionally not a dependency beyond what `target`
    // already derives from it — re-running this effect only needs to
    // happen when the redirect target itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, target, router]);

  return isHydrated && !target;
}
