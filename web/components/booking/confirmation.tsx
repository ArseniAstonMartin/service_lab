"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readBookingResult, type BookingResult } from "@/lib/booking/booking-result";

/** The animated green checkmark (see the success-check-* classes and
 * their keyframes in app/globals.css): a glow burst behind a circle
 * that draws itself in, then a checkmark that draws in after. */
function SuccessCheck() {
  return (
    <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
      <span className="success-check-glow" aria-hidden />
      <svg className="success-check-svg h-20 w-20" viewBox="0 0 52 52" aria-hidden>
        <circle className="success-check-circle" cx="26" cy="26" r="24" fill="none" />
        <path className="success-check-mark" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
      </svg>
    </div>
  );
}

/**
 * /book-mobile-service/confirmation: the screen shown right after the
 * services step's submit handler has already called bookMobileService
 * and reset the booking state. Mirrors components/wizard/confirmation.tsx
 * exactly -- reads the short-lived handoff record written just before
 * that reset, since there's no booking state of its own left to read.
 */
export function BookingConfirmation({ marketingUrl }: { marketingUrl: string }) {
  const [result, setResult] = useState<BookingResult | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setResult(readBookingResult());
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return null;
  }

  if (!result) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find a booking to confirm. If you just submitted one, check your email
          — otherwise you can start a new booking.
        </p>
        <Button asChild>
          <Link href="/book-mobile-service/contact">Start a new booking</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-6 text-center">
      <SuccessCheck />
      <h1 className="text-lg font-semibold">Booking submitted</h1>
      <p className="text-sm text-muted-foreground">
        Booking number <span className="font-medium text-foreground">#{result.bookingId}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Requested: {result.serviceTitles.join(", ")}
      </p>
      <p className="text-sm">We&apos;ll be in touch shortly to confirm your appointment.</p>
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <Button asChild variant="outline" className="flex-1">
          <a href={marketingUrl}>Return to home</a>
        </Button>
        <Button asChild className="flex-1">
          <Link href="/book-mobile-service/contact">Book another service</Link>
        </Button>
      </div>
    </Card>
  );
}
