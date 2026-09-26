import Link from "next/link";
import { CompatibilityImport } from "@/components/admin/compatibility-import";

/**
 * /admin/compatibility/import (TASK-040) — the UI on top of TASK-039's
 * previewImport/applyImport Server Actions. Auth is already enforced by
 * the (dashboard) layout plus middleware.ts; previewImport/applyImport
 * additionally call requireAdmin() themselves since Server Actions are
 * independently reachable endpoints.
 */
export default function CompatibilityImportPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/compatibility" className="text-sm text-muted-foreground hover:underline">
          ← Back to Compatibility
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Import compatibility data</h1>
        <p className="text-muted-foreground">
          Upload a .csv or .xlsx file, review the preview, then apply the valid rows.
        </p>
      </div>

      <CompatibilityImport />
    </div>
  );
}
