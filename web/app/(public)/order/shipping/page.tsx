import { ShippingForm } from "@/components/wizard/shipping-form";

export default function OrderShippingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Shipping &amp; review</h1>
        <p className="text-sm text-muted-foreground">
          Where we should send your module back, and a final look before you submit.
        </p>
      </div>
      <ShippingForm />
    </div>
  );
}
