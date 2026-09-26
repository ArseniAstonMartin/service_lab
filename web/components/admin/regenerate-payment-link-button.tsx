"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { regeneratePaymentLink } from "@/lib/actions/payment";

/**
 * "Regenerate payment link" button for an awaiting_payment order that has
 * no stripePaymentLinkId yet -- typically because the automatic
 * awaiting_payment side effect (lib/services/payment.ts, TASK-026) failed
 * against the live Stripe API and only logged the error rather than
 * blocking the status change. This is the manual retry path for that.
 *
 * Only rendered by the order detail page when status === "awaiting_payment"
 * && !paymentLinkUrl (see app/admin/(dashboard)/orders/[id]/page.tsx) --
 * this component itself doesn't re-check eligibility, it trusts its caller,
 * exactly like every other admin action button in this codebase.
 */
export function RegeneratePaymentLinkButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await regeneratePaymentLink(orderId);
        toast.success("Payment link created.");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create a payment link.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? "Creating…" : "Regenerate payment link"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
