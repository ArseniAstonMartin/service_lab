import { VehicleSelector } from "@/components/wizard/vehicle-selector";
import { getMakes } from "@/lib/actions/vehicle";

export const dynamic = "force-dynamic";

export default async function OrderVehiclePage() {
  const makes = await getMakes();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">What&apos;s your vehicle?</h1>
        <p className="text-sm text-muted-foreground">
          Select your vehicle. We confirm service support separately using the
          exact module part number and requested operation.
        </p>
      </div>
      <VehicleSelector makes={makes} />
    </div>
  );
}
