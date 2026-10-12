"use client";
// Package picker: choose a vehicle size and every package card re-prices in place.
// The size control is a Radix radio group (arrow keys, screen-reader semantics); the
// selection outline slides between sizes and changed prices roll to their new value.
// Visitors who prefer reduced motion get the change without the movement.
import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { RadioGroup } from "radix-ui";
import { Car, CarFront, Check, Truck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type VehicleSize = "small" | "medium" | "large";

export type PickerPackage = {
  /** Booking id, passed to the booking page as ?service= */
  id: string;
  name: string;
  note: string;
  prices: Record<VehicleSize, number>;
  features: readonly string[];
  /** Marks the recommended package and says why. */
  featuredLabel?: string;
};

export const vehicleSizes: { value: VehicleSize; label: string; detail: string; icon: LucideIcon }[] = [
  { value: "small", label: "Small", detail: "Coupe or sedan", icon: Car },
  { value: "medium", label: "Medium", detail: "Crossover or small truck", icon: CarFront },
  { value: "large", label: "Large", detail: "SUV or full-size truck", icon: Truck },
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const ease = [0.22, 1, 0.36, 1] as const;

export function VehicleSizePicker({ value, onChange, className }: { value: VehicleSize; onChange: (size: VehicleSize) => void; className?: string }) {
  const outline = useId();
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={next => onChange(next as VehicleSize)}
      aria-label="Vehicle size"
      orientation="horizontal"
      className={cn("grid grid-cols-3 gap-1.5 rounded-[18px] border border-border bg-(--surface) p-1.5", className)}
    >
      {vehicleSizes.map(({ value: size, label, detail, icon: Icon }) => {
        const selected = size === value;
        return (
          <RadioGroup.Item
            key={size}
            value={size}
            className={cn(
              "relative flex min-h-[60px] flex-col items-start justify-center gap-0.5 rounded-[13px] px-3 py-2.5 text-left transition-colors sm:px-4",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId={outline}
                aria-hidden
                className="absolute inset-0 rounded-[13px] border border-(--text) bg-(--soft) shadow-[inset_0_0_0_1px_var(--text)]"
                transition={{ type: "spring", stiffness: 430, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-2 text-[15px] font-semibold [font-stretch:108%]">
              <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
              {label}
            </span>
            <span className="relative hidden text-[13px] leading-snug text-muted-foreground sm:block">{detail}</span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}

function RollingPrice({ amount }: { amount: number }) {
  return (
    <span className="relative inline-flex overflow-hidden py-[0.06em]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={amount}
          className="tabular-nums"
          initial={{ y: "60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-60%", opacity: 0 }}
          transition={{ duration: 0.34, ease }}
        >
          {usd.format(amount)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function PackagePicker({
  packages,
  defaultSize = "small",
  bookHref = "/book",
  className,
}: {
  packages: readonly PickerPackage[];
  defaultSize?: VehicleSize;
  bookHref?: string;
  className?: string;
}) {
  const [size, setSize] = useState<VehicleSize>(defaultSize);
  const sizeInfo = vehicleSizes.find(item => item.value === size)!;

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn("flex flex-col gap-7", className)}>
        <VehicleSizePicker value={size} onChange={setSize} className="w-full max-w-[600px]" />
        <p className="sr-only" aria-live="polite">
          Showing prices for {sizeInfo.label.toLowerCase()} vehicles: {sizeInfo.detail.toLowerCase()}.
        </p>

        {/* Stacked until there is room for every package side by side; never a 2 + 1 split. */}
        <div className="grid max-w-[640px] gap-x-4 gap-y-8 lg:max-w-none lg:grid-flow-col lg:auto-cols-fr">
          {packages.map(item => {
            const featured = Boolean(item.featuredLabel);
            return (
              <Card
                key={item.id}
                className={cn(
                  "relative gap-0 rounded-[22px] border-border bg-(image:--panel) px-0 pt-[34px] pb-7 shadow-(--panel-edge)",
                  featured && "border-(--line-featured) bg-(image:--panel-featured)",
                )}
              >
                {featured && (
                  <span className="absolute -top-3.5 left-[30px] rounded-full bg-(image:--chrome) px-3 py-[5px] text-[13px] leading-none font-semibold text-(--chrome-text) shadow-(--chrome-edge)">
                    {item.featuredLabel}
                  </span>
                )}
                <CardHeader className="gap-2.5 px-[30px]">
                  <CardTitle className="text-2xl leading-tight font-[620] tracking-[-0.012em] [font-stretch:108%]">{item.name}</CardTitle>
                  {/* Two-line minimum keeps prices level across cards on wide screens. */}
                  <CardDescription className="text-[15px] leading-[1.55] md:min-h-[3.1em]">{item.note}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col px-[30px]">
                  {/* A div, not a p: the site's unlayered `p { margin: 0 }` would cancel these margins. */}
                  <div className="mt-6 mb-6 flex items-baseline gap-2 border-t border-border pt-[22px]">
                    <span className="text-[15px] text-muted-foreground">From</span>
                    <span className="text-[46px] leading-none font-[620] tracking-[-0.03em] [font-stretch:112%]">
                      <RollingPrice amount={item.prices[size]} />
                    </span>
                  </div>
                  <ul className="mb-[30px] flex flex-1 flex-col gap-[11px] text-[15px] leading-normal">
                    {item.features.map(feature => (
                      <li key={feature} className="flex gap-3">
                        <Check aria-hidden className="mt-[3px] size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="px-[30px]">
                  <Button asChild variant="chrome" className="h-[50px] w-full rounded-full text-[15px]">
                    <Link href={`${bookHref}?service=${encodeURIComponent(item.id)}&size=${size}`}>Book {item.name}</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </MotionConfig>
  );
}
