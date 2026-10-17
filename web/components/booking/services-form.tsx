"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BOOKING_SERVICES } from "@/lib/booking/catalog";
import { bookingServiceIcon } from "@/components/booking/service-icons";
import { useBooking } from "@/components/booking/wizard-store";
import { useBookingStepGuard } from "@/components/booking/use-step-guard";
import { bookMobileService } from "@/lib/actions/book-mobile-service";
import { writeBookingResult } from "@/lib/booking/booking-result";

/**
 * Step 3: pick any number of services from an accordion-style catalog,
 * leave an optional note, then submit. Selected services surface at the
 * top of the page (each removable with its own cross icon) rather than
 * only inside the catalog list below, so the customer always sees the
 * full set they're about to book without scrolling back down.
 */
export function BookingServicesForm() {
  const router = useRouter();
  const { state, update } = useBooking();
  const ready = useBookingStepGuard("services");

  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [note, setNote] = useState(state.note);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const selectedListRef = useRef<HTMLDivElement>(null);

  const selected = state.selectedServices;

  function toggleAccordion(slug: string) {
    setExpandedSlug((prev) => (prev === slug ? null : slug));
  }

  function addService(slug: string) {
    if (selected.includes(slug)) return;
    update({ selectedServices: [...selected, slug] });
    selectedListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function removeService(slug: string) {
    update({ selectedServices: selected.filter((s) => s !== slug) });
  }

  async function handleSubmit() {
    if (selected.length === 0 || !state.contact || !state.vehicle) return;

    setSubmitError(null);
    setIsSubmitting(true);
    update({ note });

    try {
      const result = await bookMobileService({
        firstName: state.contact.firstName,
        lastName: state.contact.lastName,
        email: state.contact.email,
        phone: state.contact.phone,
        vehicle: state.vehicle,
        services: selected,
        note: note.trim() || undefined,
      });

      // Captured here so /book-mobile-service/confirmation has
      // something of its own to read (mirrors the ECU wizard's
      // writeOrderResult handoff). Deliberately NOT calling reset()
      // here: this page is still mounted during the navigation below,
      // and clearing state.contact/state.vehicle while it's still
      // mounted makes this step's own useBookingStepGuard see an
      // incomplete wizard and redirect back to /contact -- a redirect
      // that can win the race against this push to /confirmation,
      // since /contact is far more likely to already be prefetched.
      // The confirmation page resets the booking state itself instead,
      // once it has actually mounted.
      writeBookingResult(result);
      router.push("/book-mobile-service/confirmation");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong submitting your booking. Please try again.",
      );
      setIsSubmitting(false);
    }
  }

  if (!ready) {
    return null;
  }

  return (
    <div className="space-y-6">
      {selected.length > 0 ? (
        <div ref={selectedListRef} className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Selected services</h2>
          <ul className="space-y-2">
            {selected.map((slug) => {
              const service = BOOKING_SERVICES.find((candidate) => candidate.slug === slug);
              if (!service) return null;
              return (
                <li
                  key={slug}
                  className="flex items-center justify-between gap-2 rounded-md border bg-primary/5 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{service.title}</span>
                  <button
                    type="button"
                    onClick={() => removeService(slug)}
                    aria-label={`Remove ${service.title}`}
                    className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="space-y-2">
            <Label htmlFor="booking-note">Anything we should know? (optional)</Label>
            <Textarea
              id="booking-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Let us know anything that'll help us prepare for your visit."
              rows={3}
            />
          </div>

          {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

          <Button type="button" className="w-full" disabled={isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Available services</h2>
        <div className="space-y-2">
          {BOOKING_SERVICES.map((service) => {
            const Icon = bookingServiceIcon(service.slug);
            const isExpanded = expandedSlug === service.slug;
            const isSelected = selected.includes(service.slug);

            return (
              <Card key={service.slug} className="overflow-hidden p-0">
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => toggleAccordion(service.slug)}
                    aria-expanded={isExpanded}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="flex-1 text-sm font-medium">{service.title}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isExpanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => addService(service.slug)}
                    disabled={isSelected}
                    aria-label={isSelected ? `${service.title} added` : `Add ${service.title}`}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                      isSelected
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-input text-foreground hover:border-primary/60 hover:text-primary",
                    )}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {isExpanded ? (
                  <p className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                    {service.description}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
