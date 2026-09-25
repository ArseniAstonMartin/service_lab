import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categoryCount, serviceCount] = await Promise.all([
    prisma.moduleCategory.count(),
    prisma.service.count(),
  ]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        ECU Service Lab
      </h1>
      <p className="mt-2 text-muted-foreground">
        Automotive Module Compatibility &amp; Repair Service — Oahu, Hawaii
      </p>
      <p className="mt-6 text-sm text-muted-foreground">
        {categoryCount} module categories · {serviceCount} services configured
      </p>
      <Button asChild className="mt-8">
        <Link href="/order/vehicle">Start an order</Link>
      </Button>
    </main>
  );
}
