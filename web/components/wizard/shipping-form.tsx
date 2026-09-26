"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { useWizard } from "@/components/wizard/wizard-store";
import { useStepGuard } from "@/components/wizard/use-step-guard";
import { getCategoryName, getQuote, type ServiceQuote } from "@/lib/actions/shipping";
import { placeOrder } from "@/lib/actions/place-order";
import { writeOrderResult } from "@/lib/wizard/order-result";
import { formatCents } from "@/lib/format";
import type { WizardContact } from "@/lib/wizard/types";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Required"),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .regex(/^[0-9+()\-.\s]+$/, "Enter a valid phone number"),
  street: z.string().trim().min(1, "Required"),
  city: z.string().trim().min(1, "Required"),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a 2-letter state code"),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter a valid US ZIP code"),
});

type ContactFormValues = z.infer<typeof contactSchema>;

/** One review row: a label, its current value, and an Edit link back to
 * the wizard step that collected it. */
function ReviewRow({
  label,
  value,
  editHref,
}: {
  label: string;
  value: string;
  editHref: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <div>
        <div className="text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
      <a
        href={editHref}
        className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </a>
    </div>
  );
}

/**
 * /order/shipping (TASK-021): contact + return address, plus a review
 * of the whole order collected so far with Edit links back to each
 * step, and the price breakdown (matched path) or a manual-review
 * notice (pending-review path).
 */
export function ShippingForm() {
  const router = useRouter();
  const { state, update, reset } = useWizard();
  // Redirects back to whichever earlier step hasn't been completed yet
  // (TASK-024) — this is the last step before placeOrder is called, so
  // it has the most to check: a compatibility result, a service choice
  // on the matched path, and a saved description.
  const ready = useStepGuard("shipping");

  const isMatchedPath = Boolean(state.serviceId);

  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [serviceQuote, setServiceQuote] = useState<ServiceQuote | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSummary(true);
    setSummaryError(null);

    const lookups: Promise<unknown>[] = [];

    if (state.categoryId) {
      lookups.push(
        getCategoryName(state.categoryId).then((name) => {
          if (!cancelled) setCategoryName(name);
        }),
      );
    }

    if (state.serviceId) {
      lookups.push(
        getQuote(state.serviceId).then((q) => {
          if (!cancelled) setServiceQuote(q);
        }),
      );
    }

    Promise.all(lookups)
      .catch((err) => {
        if (!cancelled) {
          setSummaryError(err instanceof Error ? err.message : "Could not load the order summary.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSummary(false);
      });

    return () => {
      cancelled = true;
    };
    // Only re-runs if the underlying selections change, which they
    // shouldn't while a customer is on this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.categoryId, state.serviceId]);

  const defaultContact: ContactFormValues = {
    name: state.contact?.name ?? "",
    email: state.contact?.email ?? "",
    phone: state.contact?.phone ?? "",
    street: state.contact?.street ?? "",
    city: state.contact?.city ?? "",
    state: state.contact?.state ?? "HI",
    zip: state.contact?.zip ?? "",
  };

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: defaultContact,
  });

  async function onSubmit(values: ContactFormValues) {
    const contact: WizardContact = { ...values };
    // Generated once per wizard session (placeOrder uses this to make a
    // repeat submit idempotent); never overwritten once set.
    const idempotencyKey = state.idempotencyKey ?? crypto.randomUUID();
    update({ contact, idempotencyKey });

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (!state.vehicle || !state.categoryId || !state.stickerPhotoUrl) {
        throw new Error(
          "Your order is missing some required information — please go back and check each step.",
        );
      }

      const result = await placeOrder({
        vehicle: state.vehicle,
        categoryId: state.categoryId,
        partNumber: state.partNumber,
        stickerPhotoUrl: state.stickerPhotoUrl,
        serviceId: state.serviceId,
        description: state.description,
        answers: state.answers,
        photoAnswers: state.photoAnswers,
        contact,
        idempotencyKey,
      });

      // Captured here, before reset() clears the wizard state below —
      // /order/confirmation has nothing of its own left to read.
      writeOrderResult({
        orderNumber: result.orderNumber,
        trackingToken: result.trackingToken,
        status: result.status,
        matched: Boolean(state.serviceId),
        categoryName,
        isCloning: Boolean(state.photoAnswers.original_photo || state.photoAnswers.donor_photo),
        originalPartNumber: state.answers.original_part_number ?? null,
        donorPartNumber: state.answers.donor_part_number ?? null,
      });

      reset();
      router.push("/order/confirmation");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong placing your order. Please try again.",
      );
      setIsSubmitting(false);
    }
  }

  const matchedServiceName = serviceQuote?.service.name ?? null;

  if (!ready) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-1 p-4">
        <h2 className="mb-1 text-sm font-semibold">Your order so far</h2>

        {state.vehicle ? (
          <ReviewRow
            label="Vehicle"
            value={`${state.vehicle.make} ${state.vehicle.model} (${state.vehicle.year})`}
            editHref="/order/vehicle"
          />
        ) : null}

        <ReviewRow
          label="Module"
          value={categoryName ?? (isLoadingSummary ? "Loading…" : "—")}
          editHref="/order/module"
        />

        <ReviewRow label="Part number" value={state.partNumber || "—"} editHref="/order/compatibility" />

        {isMatchedPath ? (
          <ReviewRow
            label="Service"
            value={matchedServiceName ?? (isLoadingSummary ? "Loading…" : "—")}
            editHref="/order/service"
          />
        ) : null}

        <ReviewRow label="Description" value={state.description || "—"} editHref="/order/details" />
      </Card>

      <Card className="space-y-2 p-4 text-sm">
        <h2 className="text-sm font-semibold">Price</h2>
        {isLoadingSummary ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading price…
          </div>
        ) : summaryError ? (
          <p className="text-destructive">{summaryError}</p>
        ) : isMatchedPath && serviceQuote ? (
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service</span>
              <span>{formatCents(serviceQuote.servicePriceCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Return shipping</span>
              <span>{formatCents(serviceQuote.returnShippingFeeCents)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Total</span>
              <span>{formatCents(serviceQuote.totalCents)}</span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Your part is going to manual review — we'll confirm the price once that's done, before
            anything is charged.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Shipping your module to us on Oahu is free. No payment is taken now — once your service
          is confirmed, you'll get a secure payment link by email.
        </p>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <h2 className="text-sm font-semibold">Contact &amp; return address</h2>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="street"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Return address — street</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input maxLength={2} className="uppercase" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="zip"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ZIP code</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

          <Button
            type="submit"
            className="w-full"
            disabled={(isLoadingSummary && isMatchedPath) || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Placing order…
              </>
            ) : (
              "Place order"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
