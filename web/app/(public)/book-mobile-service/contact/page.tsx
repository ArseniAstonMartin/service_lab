import { BookingContactForm } from "@/components/booking/contact-form";

export default function BookingContactPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Let&apos;s get started.</h1>
        <p className="text-sm text-muted-foreground">
          Tell us how to reach you about your mobile service booking.
        </p>
      </div>
      <BookingContactForm />
    </div>
  );
}
