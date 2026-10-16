import { ShippingForm } from "@/components/wizard/shipping-form";

export default function OrderShippingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Review &amp; submit</h1>
        <p className="text-sm text-muted-foreground">
          Your contact info, plus a final look before you submit.
        </p>
      </div>
      <ShippingForm />
    </div>
  );
}
