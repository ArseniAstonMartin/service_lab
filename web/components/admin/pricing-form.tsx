"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/format";
import { setReturnShippingFee, setServiceTier, updateTierAmount } from "@/lib/actions/pricing";

export type PricingTier = {
  tierCode: string;
  amountCents: number;
};

export type PricingService = {
  id: string;
  name: string;
  categoryName: string;
  tierCode: string;
};

/**
 * Turns stored integer cents into the dollar string the admin edits
 * (10000 → "100", 2550 → "25.50"). Display-only — the Server Actions
 * convert back to cents on save.
 */
function centsToDollarInput(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

function parseDollarInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * /admin/pricing editor (TASK-044). Each section saves independently
 * through its own Server Action; a toast confirms the write. Values
 * are edited in dollars here and stored as cents on the server.
 */
export function PricingForm({
  tiers,
  services,
  returnShippingFeeCents,
}: {
  tiers: PricingTier[];
  services: PricingService[];
  returnShippingFeeCents: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tierAmounts, setTierAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(tiers.map((tier) => [tier.tierCode, centsToDollarInput(tier.amountCents)])),
  );
  const [serviceTiers, setServiceTiers] = useState<Record<string, string>>(() =>
    Object.fromEntries(services.map((service) => [service.id, service.tierCode])),
  );
  const [feeDollars, setFeeDollars] = useState(centsToDollarInput(returnShippingFeeCents));

  function handleSaveTier(tierCode: string) {
    const amountDollars = parseDollarInput(tierAmounts[tierCode] ?? "");
    if (amountDollars == null) {
      toast.error("Enter a dollar amount greater than 0.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateTierAmount({ tierCode, amountDollars });
        setTierAmounts((current) => ({
          ...current,
          [tierCode]: centsToDollarInput(result.amountCents),
        }));
        toast.success(`Tier ${tierCode} saved at ${formatCents(result.amountCents)}.`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save tier amount.");
      }
    });
  }

  function handleSaveService(serviceId: string, serviceName: string, tierCode: string) {
    startTransition(async () => {
      try {
        const result = await setServiceTier({ serviceId, tierCode });
        setServiceTiers((current) => ({ ...current, [serviceId]: result.tierCode }));
        toast.success(`${serviceName} mapped to tier ${result.tierCode}.`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save service tier.");
      }
    });
  }

  function handleSaveFee() {
    const dollars = parseDollarInput(feeDollars);
    if (dollars == null) {
      toast.error("Enter a return shipping fee between $20 and $30.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await setReturnShippingFee({ feeDollars: dollars });
        setFeeDollars(centsToDollarInput(result.feeCents));
        toast.success(`Return shipping fee saved at ${formatCents(result.feeCents)}.`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save return shipping fee.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Return shipping fee</CardTitle>
          <CardDescription>
            A single flat fee added to every new quote. Must be between $20 and $30.
            Already-quoted orders keep the fee they were given.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="return-shipping-fee">Fee (USD)</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                id="return-shipping-fee"
                inputMode="decimal"
                value={feeDollars}
                onChange={(event) => setFeeDollars(event.target.value)}
                className="w-28"
              />
            </div>
          </div>
          <Button type="button" onClick={handleSaveFee} disabled={isPending}>
            Save fee
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price tiers</CardTitle>
          <CardDescription>
            Dollar amounts stored as cents. Changing a tier updates future quotes
            only — existing order snapshots are left alone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead>Amount (USD)</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier) => (
                <TableRow key={tier.tierCode}>
                  <TableCell className="font-medium">{tier.tierCode}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">$</span>
                      <Input
                        inputMode="decimal"
                        value={tierAmounts[tier.tierCode] ?? ""}
                        onChange={(event) =>
                          setTierAmounts((current) => ({
                            ...current,
                            [tier.tierCode]: event.target.value,
                          }))
                        }
                        className="w-28"
                        aria-label={`Amount for tier ${tier.tierCode}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveTier(tier.tierCode)}
                      disabled={isPending}
                    >
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service-to-tier mapping</CardTitle>
          <CardDescription>
            Which price tier each service uses. New quotes pick up the mapped
            tier&apos;s current amount; already-quoted orders do not change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Current price</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => {
                const selectedTier = serviceTiers[service.id] ?? service.tierCode;
                const selectedAmount = tiers.find((tier) => tier.tierCode === selectedTier)?.amountCents;
                return (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell>{service.categoryName}</TableCell>
                    <TableCell>
                      <Select
                        value={selectedTier}
                        onValueChange={(value) =>
                          setServiceTiers((current) => ({ ...current, [service.id]: value }))
                        }
                      >
                        <SelectTrigger className="w-28" aria-label={`Tier for ${service.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tiers.map((tier) => (
                            <SelectItem key={tier.tierCode} value={tier.tierCode}>
                              {tier.tierCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {selectedAmount != null ? formatCents(selectedAmount) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSaveService(service.id, service.name, selectedTier)}
                        disabled={isPending}
                      >
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
