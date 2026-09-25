import { DetailsForm } from "@/components/wizard/details-form";

export default function OrderDetailsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Tell us more</h1>
        <p className="text-sm text-muted-foreground">
          A few details about the module and what you need done.
        </p>
      </div>
      <DetailsForm />
    </div>
  );
}
