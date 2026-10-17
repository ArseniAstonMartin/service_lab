"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readBookingResult, type BookingResult } from "@/lib/booking/booking-result";

/**
 * /book-mobile-service/confirmation: the screen shown right after the
 * services step's submit handler has already called bookMobileService
 * and reset the booking state. Mirrors components/wizard/confirmation.tsx
 * exactly -- reads the short-lived handoff record written just before
 * that reset, since there's no booking state of its own left to read.
 */
export function BookingConfirmation() {
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
    <Card className="space-y-3 p-6 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
      <h1 className="text-lg font-semibold">Booking submitted</h1>
      <p className="text-sm text-muted-foreground">
        Booking number <span className="font-medium text-foreground">#{result.bookingId}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Requested: {result.serviceTitles.join(", ")}
      </p>
      <p className="text-sm">We&apos;ll be in touch shortly to confirm your appointment.</p>
    </Card>
  );
}
