"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/book-mobile-service/contact", label: "Contact" },
  { href: "/book-mobile-service/vehicle", label: "Vehicle" },
  { href: "/book-mobile-service/services", label: "Services" },
  { href: "/book-mobile-service/confirmation", label: "Done" },
] as const;

/** Mirrors components/wizard/step-indicator.tsx for the booking flow's
 * own, shorter set of steps. */
export function BookingStepIndicator() {
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
