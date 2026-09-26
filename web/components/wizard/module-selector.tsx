"use client";

import { useRouter } from "next/navigation";
import {
  CircuitBoard,
  Cpu,
  Gauge,
  Settings2,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useWizard } from "@/components/wizard/wizard-store";
import { useStepGuard } from "@/components/wizard/use-step-guard";
import type { ModuleCategoryOption } from "@/lib/actions/module";

// Icons keyed by the exact category name from the seed data (TASK-007):
// Airbag/SRS, ECM/PCM, TCM/TCU, BCM, Instrument Cluster. Any future
// category added only in the database (not in this map) still renders,
// just with the generic fallback icon below, so this never breaks the
// page — it only makes a newly added category look less specific until
// this map is updated.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Airbag/SRS": ShieldAlert,
  "ECM/PCM": Cpu,
  "TCM/TCU": Settings2,
  BCM: CircuitBoard,
  "Instrument Cluster": Gauge,
};

function iconFor(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? Wrench;
}

/**
 * /order/module: the 5 module categories as selectable cards. Exactly
 * one can be chosen (categoryId in wizard state); Next stays disabled
 * until then.
 */
export function ModuleSelector({ categories }: { categories: ModuleCategoryOption[] }) {
  const router = useRouter();
  const { state, update } = useWizard();
  // Redirects to /order/vehicle if the wizard has no vehicle yet
  // (TASK-024) — a direct link or a back/forward navigation here
  // otherwise has nothing to scope the category to.
  const ready = useStepGuard("module");

  const categoryId = state.categoryId;
  const canContinue = Boolean(categoryId);

  function handleSelect(id: string) {
    update({ categoryId: id });
  }

  if (!ready) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {categories.map((category) => {
          const Icon = iconFor(category.name);
          const isSelected = category.id === categoryId;

          return (
            <Card
              key={category.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => handleSelect(category.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelect(category.id);
                }
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 p-4 text-center transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <Icon
                className={cn("h-8 w-8", isSelected ? "text-primary" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="text-sm font-medium">{category.name}</span>
            </Card>
          );
        })}
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={!canContinue}
        onClick={() => router.push("/order/compatibility")}
      >
        Next
      </Button>
    </div>
  );
}
