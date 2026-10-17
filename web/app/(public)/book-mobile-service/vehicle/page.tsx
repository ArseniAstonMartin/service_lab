import { BookingVehicleForm } from "@/components/booking/vehicle-form";
import { getMakes } from "@/lib/actions/vehicle";

export const dynamic = "force-dynamic";

export default async function BookingVehiclePage() {
  const makes = await getMakes();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Tell us about your vehicle.</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll use this to prepare the right parts and tools for your visit.
        </p>
      </div>
      <BookingVehicleForm makes={makes} />
    </div>
  );
}
