"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getModels, getYears } from "@/lib/actions/vehicle";
import { useBooking } from "@/components/booking/wizard-store";
import { useBookingStepGuard } from "@/components/booking/use-step-guard";

/**
 * Dependent make/model/year dropdowns -- same generic Vehicle table and
 * getMakes/getModels/getYears actions the ECU wizard uses
 * (components/wizard/vehicle-module-part-form.tsx); that data isn't
 * specific to module compatibility, so there's no reason to duplicate
 * it for this flow.
 */
export function BookingVehicleForm({ makes }: { makes: string[] }) {
  const router = useRouter();
  const { state, update } = useBooking();
  const [isPending, startTransition] = useTransition();
  const ready = useBookingStepGuard("vehicle");

  const [models, setModels] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);

  const make = state.vehicle?.make ?? "";
  const model = state.vehicle?.model ?? "";
  const year = state.vehicle?.year ?? null;

  useEffect(() => {
    let cancelled = false;
    setModels([]);
    if (!make) return;
    startTransition(async () => {
      try {
        const values = await getModels(make);
        if (!cancelled) setModels(values);
      } catch {
        if (!cancelled) toast.error("Unable to load models. Please try again.");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make]);

  useEffect(() => {
    let cancelled = false;
    setYears([]);
    if (!make || !model) return;
    startTransition(async () => {
      try {
        const values = await getYears(make, model);
        if (!cancelled) setYears(values);
      } catch {
        if (!cancelled) toast.error("Unable to load years. Please try again.");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make, model]);

  function handleMakeChange(nextMake: string) {
    update({ vehicle: { make: nextMake, model: "", year: 0 } });
  }

  function handleModelChange(nextModel: string) {
    update({ vehicle: { make, model: nextModel, year: 0 } });
  }

  function handleYearChange(nextYear: string) {
    update({ vehicle: { make, model, year: Number(nextYear) } });
  }

  const vehicleComplete = Boolean(
    make && model && year && models.includes(model) && years.includes(year),
  );

  function handleContinue() {
    if (!vehicleComplete) return;
    router.push("/book-mobile-service/services");
  }

  if (!ready) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
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
          <Select value={year ? String(year) : ""} onValueChange={handleYearChange} disabled={!model}>
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
      </div>

      <Button type="button" className="w-full" disabled={!vehicleComplete || isPending} onClick={handleContinue}>
        Continue
      </Button>
    </div>
  );
}
