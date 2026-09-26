"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" className="print:hidden" onClick={() => window.print()}>
      Print
    </Button>
  );
}
