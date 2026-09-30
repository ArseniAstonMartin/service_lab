import { VehicleModulePartForm } from "@/components/wizard/vehicle-module-part-form";
import { getMakes } from "@/lib/actions/vehicle";
import { getModuleCategories } from "@/lib/actions/module";

export const dynamic = "force-dynamic";

export default async function OrderVehiclePage() {
  const [makes, categories] = await Promise.all([getMakes(), getModuleCategories()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Tell us about your module.</h1>
        <p className="text-sm text-muted-foreground">
          Select your vehicle and module, then check the part number on the label. We confirm
          service support against the exact part number and requested operation.
        </p>
      </div>
      <VehicleModulePartForm makes={makes} categories={categories} />
    </div>
  );
}
