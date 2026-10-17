"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWizard } from "@/components/wizard/wizard-store";
import { readOrderResult, type OrderResult } from "@/lib/wizard/order-result";

/**
 * /order/confirmation (TASK-023): the screen shown right after
 * /order/shipping's submit handler has already called placeOrder. This
 * page has no wizard state of its own left to read by design — it
 * reads the short-lived handoff record written just before navigating
 * here instead (lib/wizard/order-result.ts).
 *
 * The wizard's own state — what this task's acceptance criteria
 * require cleared — is reset here, once this page has actually
 * mounted, rather than in the shipping step right before it navigates
 * away. Doing it there raced with the navigation: WizardProvider is
 * shared across every /order/* page (app/(public)/order/layout.tsx),
 * so clearing it while the shipping page was still mounted made that
 * page's own useStepGuard see an incomplete wizard and fire its own
 * router.replace("/order/vehicle") — a redirect that could win the
 * race against the push to this page, since /order/vehicle is far
 * more likely to already be prefetched than a route only ever reached
 * via a programmatic push.
 */
export function Confirmation() {
  const { reset } = useWizard();
  const [result, setResult] = useState<OrderResult | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = readOrderResult();
    setResult(stored);
    setHydrated(true);
    // Only once an order was actually just placed -- not on a
    // stray/direct visit to this page with nothing to confirm.
    if (stored) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avoids a flash of the "no order" fallback before sessionStorage has
  // been read on the client.
  if (!hydrated) {
    return null;
  }

  if (!result) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find an order to confirm. If you just placed one, check your email for
          the confirmation — otherwise you can start a new order.
        </p>
        <Button asChild>
          <Link href="/order/vehicle">Start a new order</Link>
        </Button>
      </Card>
    );
  }

  const trackingUrl = `/track/${result.trackingToken}`;

  function copyTrackingLink() {
    const fullUrl = `${window.location.origin}${trackingUrl}`;
    navigator.clipboard
      .writeText(fullUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard access can be denied (permissions, insecure
        // context); the link is still shown and selectable by hand.
      });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
        <h1 className="text-lg font-semibold">Order submitted</h1>
        <p className="text-sm text-muted-foreground">
          Order number <span className="font-medium text-foreground">#{result.orderNumber}</span>
          {result.categoryName ? ` — ${result.categoryName}` : null}
        </p>

        {result.matched ? (
          <p className="text-sm">
            Check your email for a secure payment link — nothing is charged until you pay it.
          </p>
        ) : (
          <p className="flex items-center justify-center gap-1.5 text-sm">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            Your request needs review before we confirm the service and price.
            We&apos;ll email you the next steps once the review is complete.
          </p>
        )}
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Track your order</h2>
        <p className="text-xs text-muted-foreground">
          Save this link — it&apos;s the only way to check your order&apos;s status without
          signing in.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded border bg-muted px-2 py-1.5 text-xs">
            {trackingUrl}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copyTrackingLink}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Card>

      {!result.matched ? (
        <Card className="space-y-1 p-4 text-sm">
          <h2 className="text-sm font-semibold">Before shipping</h2>
          <p className="text-muted-foreground">Wait for our confirmation and packing instructions before sending a module.</p>
        </Card>
      ) : result.isCloning ? (
        <Card className="space-y-2 p-4 text-sm">
          <h2 className="text-sm font-semibold">What to ship us</h2>
          <p className="text-muted-foreground">Cloning needs both modules in the same box:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Your original module
              {result.originalPartNumber ? ` (part number ${result.originalPartNumber})` : null}
            </li>
            <li>
              The donor module
              {result.donorPartNumber ? ` (part number ${result.donorPartNumber})` : null}
            </li>
          </ul>
        </Card>
      ) : (
        <Card className="space-y-1 p-4 text-sm">
          <h2 className="text-sm font-semibold">What to ship us</h2>
          <p className="text-muted-foreground">
            Just the module you&apos;re having serviced — no need to include anything else.
          </p>
        </Card>
      )}
    </div>
  );
}
