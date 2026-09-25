import type { ReactNode } from "react";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardProvider } from "@/components/wizard/wizard-store";

/**
 * Shared shell for every /order/* wizard step: a WizardProvider holding
 * the shared client-side state (lib/wizard/types.ts), the step
 * indicator, and a narrow, mobile-first content column.
 */
export default function OrderLayout({ children }: { children: ReactNode }) {
  return (
    <WizardProvider>
      <div className="mx-auto min-h-screen max-w-2xl">
        <header className="border-b">
          <StepIndicator />
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </WizardProvider>
  );
}
