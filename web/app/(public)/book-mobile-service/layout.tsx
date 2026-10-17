import type { ReactNode } from "react";
import { BookingStepIndicator } from "@/components/booking/step-indicator";
import { BookingProvider } from "@/components/booking/wizard-store";

/**
 * Shared shell for every /book-mobile-service step -- mirrors
 * app/(public)/order/layout.tsx's pattern for the separate ECU wizard,
 * with its own BookingProvider and step indicator.
 */
export default function BookMobileServiceLayout({ children }: { children: ReactNode }) {
  return (
    <BookingProvider>
      <div className="mx-auto min-h-screen max-w-2xl">
        <header className="border-b">
          <BookingStepIndicator />
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </BookingProvider>
  );
}
