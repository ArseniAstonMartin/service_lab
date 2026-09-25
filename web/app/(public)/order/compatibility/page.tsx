import { CompatibilityForm } from "@/components/wizard/compatibility-form";

export default function OrderCompatibilityPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Part number & photo</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll check this against our compatibility database before you pick a
          service.
        </p>
      </div>
      <CompatibilityForm />
    </div>
  );
}
