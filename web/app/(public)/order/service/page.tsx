import { ServiceSelector } from "@/components/wizard/service-selector";

export default function OrderServicePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Choose a service</h1>
        <p className="text-sm text-muted-foreground">
          These are the services confirmed for your part number.
        </p>
      </div>
      <ServiceSelector />
    </div>
  );
}
