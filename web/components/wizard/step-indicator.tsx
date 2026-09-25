"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/order/vehicle", label: "Vehicle" },
  { href: "/order/module", label: "Module" },
  { href: "/order/compatibility", label: "Part" },
  { href: "/order/service", label: "Service" },
  { href: "/order/details", label: "Details" },
  { href: "/order/shipping", label: "Shipping" },
  { href: "/order/confirmation", label: "Done" },
] as const;

/**
 * Shows every wizard step and highlights the current one, driven purely
 * by the current pathname (no dependency on wizard state, so it renders
 * correctly even before WizardProvider has hydrated).
 */
export function StepIndicator() {
  const pathname = usePathname();
  const currentIndex = STEPS.findIndex((step) => pathname.startsWith(step.href));

  return (
    <ol className="flex items-center gap-1 overflow-x-auto px-4 py-3 text-xs sm:gap-2 sm:text-sm">
      {STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = currentIndex >= 0 && index < currentIndex;

        return (
          <li key={step.href} className="flex shrink-0 items-center gap-1 whitespace-nowrap sm:gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                isCurrent && "border-primary bg-primary text-primary-foreground",
                isDone && !isCurrent && "border-primary/50 bg-primary/10 text-primary",
                !isCurrent && !isDone && "border-muted-foreground/30 text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "hidden sm:inline",
                isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span aria-hidden className="mx-1 h-px w-3 shrink-0 bg-border sm:w-4" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
