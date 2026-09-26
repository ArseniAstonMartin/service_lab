import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Generic 404 for /track/[token]. Same copy for a missing token and a
 * malformed one — the page must not reveal whether a given token exists.
 */
export default function TrackNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Order not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            We couldn&apos;t find an order for that link. Check the tracking URL from your
            confirmation, or start a new order if you haven&apos;t placed one yet.
          </p>
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
