import { BookingServicesForm } from "@/components/booking/services-form";

export default function BookingServicesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Choose your services.</h1>
        <p className="text-sm text-muted-foreground">
          Select everything you&apos;d like done — tap a service to read more about it.
        </p>
      </div>
      <BookingServicesForm />
    </div>
  );
}
