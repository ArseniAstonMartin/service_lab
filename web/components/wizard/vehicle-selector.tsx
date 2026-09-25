"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getModels, getYears } from "@/lib/actions/vehicle";
import { useWizard } from "@/components/wizard/wizard-store";

export function VehicleSelector({ makes }: { makes: string[] }) {
  const router = useRouter();
  const { state, update } = useWizard();
  const [isPending, startTransition] = useTransition();

  const [models, setModels] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);

  const make = state.vehicle?.make ?? "";
  const model = state.vehicle?.model ?? "";
  const year = state.vehicle?.year ?? null;

  // Re-populate the Model/Year lists on mount (and whenever make/model
  // change from wizard state directly, e.g. after sessionStorage
  // hydration) so returning to this step with a make already chosen
  // still shows the right downstream options.
  useEffect(() => {
    if (!make) {
      setModels([]);
      return;
    }
    startTransition(() => {
      getModels(make).then(setModels);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make]);

  useEffect(() => {
    if (!make || !model) {
      setYears([]);
      return;
    }
    startTransition(() => {
      getYears(make, model).then(setYears);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make, model]);

  function handleMakeChange(nextMake: string) {
    // Selecting a parent resets its children — a model/year picked for
    // the previous make is meaningless once the make changes.
    update({ vehicle: { make: nextMake, model: "", year: 0 } });
  }

  function handleModelChange(nextModel: string) {
    update({ vehicle: { make, model: nextModel, year: 0 } });
  }

  function handleYearChange(nextYear: string) {
    update({ vehicle: { make, model, year: Number(nextYear) } });
  }

  const canContinue = Boolean(make && model && year);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Make</label>
        <Select value={make} onValueChange={handleMakeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select make" />
          </SelectTrigger>
          <SelectContent>
            {makes.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Model</label>
        <Select value={model} onValueChange={handleModelChange} disabled={!make}>
          <SelectTrigger>
            <SelectValue placeholder={make ? "Select model" : "Select a make first"} />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Year</label>
        <Select
          value={year ? String(year) : ""}
          onValueChange={handleYearChange}
          disabled={!model}
        >
          <SelectTrigger>
            <SelectValue placeholder={model ? "Select year" : "Select a model first"} />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={!canContinue || isPending}
        onClick={() => router.push("/order/module")}
      >
        Next
      </Button>
    </div>
  );
}
