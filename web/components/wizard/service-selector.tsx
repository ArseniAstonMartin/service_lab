"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWizard } from "@/components/wizard/wizard-store";

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

  const services = state.matchResult?.services ?? [];
  const serviceId = state.serviceId;
  const canContinue = Boolean(serviceId);

  function handleSelect(id: string) {
    update({ serviceId: id });
  }

  if (services.length === 0) {
    // No confirmed services in wizard state — either this is a
    // not-matched order (which the compatibility step already routes to
    // /order/details, skipping this page) or the customer deep-linked
    // here directly. TASK-024 adds a proper step-guard redirect; for now
    // this is a safe fallback rather than rendering an empty radiogroup.
    return (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>We don&apos;t have a confirmed service to show yet.</p>
        <Link href="/order/compatibility" className="text-primary underline">
          Go back to the part number step
        </Link>
      </div>
    );
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
