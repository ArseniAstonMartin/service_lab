"use client";

import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWizard } from "@/components/wizard/wizard-store";
import { useStepGuard } from "@/components/wizard/use-step-guard";

/**
 * /order/service: radio cards for the services confirmed on the match
 * result from TASK-018's checkCompatibility (state.matchResult.services)
 * — never a fresh server query, since the whole point of this step is
 * "only what was just confirmed for this exact part number" (PRD 4.3).
 * Exactly one can be picked; Next stays disabled until then.
 */
export function ServiceSelector() {
  const router = useRouter();
  const { state, update } = useWizard();
  // Redirects to /order/compatibility unless the store holds a
  // successful match (TASK-024's acceptance criteria for this step
  // specifically) — replaces the temporary "go back" fallback this
  // page rendered before the guard existed.
  const ready = useStepGuard("service");

  const services = state.matchResult?.services ?? [];
  const serviceId = state.serviceId;
  const canContinue = Boolean(serviceId);

  function handleSelect(id: string) {
    update({ serviceId: id });
  }

  if (!ready) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="Confirmed services" className="space-y-3">
        {services.map((service) => {
          const isSelected = service.id === serviceId;

          return (
            <Card
              key={service.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => handleSelect(service.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelect(service.id);
                }
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    isSelected ? "border-primary" : "border-muted-foreground/40",
                  )}
                >
                  {isSelected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                </span>
                <span className="text-sm font-medium">{service.name}</span>
              </div>
              <span className="shrink-0 text-sm font-semibold">
                {formatCents(service.priceCents)}
              </span>
            </Card>
          );
        })}
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={!canContinue}
        onClick={() => router.push("/order/details")}
      >
        Next
      </Button>
    </div>
  );
}
