"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readOrderResult, type OrderResult } from "@/lib/wizard/order-result";

/**
 * /order/confirmation (TASK-023): the screen shown right after
 * /order/shipping's submit handler has already called placeOrder and
 * reset the wizard. This page has no wizard state of its own left to
 * read — it reads the short-lived handoff record written just before
 * that reset instead (lib/wizard/order-result.ts).
 */
export function Confirmation() {
  const [result, setResult] = useState<OrderResult | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setResult(readOrderResult());
    setHydrated(true);
    // Deliberately not clearing ecu-order-result here: reloading this
    // same tab right after ordering should keep showing the same
    // order. The wizard's own state — what this task's acceptance
    // criteria require cleared — was already reset by the shipping
    // form before it navigated here.
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
            Your part number wasn&apos;t in our database, so it&apos;s going to manual review.
            We&apos;ll email you as soon as it&apos;s confirmed, with pricing and a payment link.
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

      {result.isCloning ? (
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
