/**
 * The fixed list of regular (non-ECU) services offered through the
 * /book-mobile-service wizard — oil changes, tires, brakes, and the
 * like. Deliberately static code, not a DB-backed catalog like
 * ModuleCategory/Service: nothing here needs admin editing, and the
 * booking itself is just these slugs stored on MobileServiceBooking.
 *
 * `slug` is the stable identifier stored in the database and sent in
 * the booking form — never the title, so renaming a title later
 * doesn't orphan already-stored bookings.
 */
export type BookingServiceCatalogItem = {
  slug: string;
  title: string;
  description: string;
};

export const BOOKING_SERVICES: BookingServiceCatalogItem[] = [
  {
    slug: "oil-filter-change",
    title: "Oil & Filter Change",
    description: "Fresh oil and a new filter, matched to your vehicle's manufacturer interval.",
  },
  {
    slug: "tire-rotation",
    title: "Tire Rotation",
    description: "Rotates all four tires to even out tread wear and extend their life.",
  },
  {
    slug: "wheel-alignment",
    title: "Wheel Alignment",
    description:
      "Corrects steering and suspension angles so your vehicle tracks straight and tires wear evenly.",
  },
  {
    slug: "tire-replacement",
    title: "Tire Replacement",
    description: "New tires mounted and balanced, matched to your vehicle and driving needs.",
  },
  {
    slug: "complete-vehicle-inspection",
    title: "Complete Vehicle Inspection",
    description: "A full top-to-bottom check of fluids, brakes, suspension, and safety systems.",
  },
  {
    slug: "state-inspection",
    title: "State Inspection",
    description: "Official state safety inspection to keep your registration current.",
  },
  {
    slug: "brakes",
    title: "Brakes",
    description:
      "Pad, rotor, and brake system inspection and service to keep your stopping power where it should be.",
  },
  {
    slug: "wheel-balance",
    title: "Wheel Balance",
    description: "Balances each wheel and tire assembly to eliminate vibration at speed.",
  },
  {
    slug: "wiper-blades",
    title: "Wiper Blades",
    description: "Replacement wiper blades fitted and tested for clear visibility in any weather.",
  },
  {
    slug: "flat-repair",
    title: "Flat Repair",
    description: "Patches or plugs a flat tire so you're safely back on the road.",
  },
  {
    slug: "starting-charging-battery",
    title: "Starting & Charging/Battery",
    description: "Tests and services your battery, starter, and charging system.",
  },
  {
    slug: "lighting-bulbs",
    title: "Lighting & Bulbs",
    description:
      "Replaces headlight, taillight, and signal bulbs so every light works as it should.",
  },
  {
    slug: "engine-tune-up",
    title: "Engine Tune-Up",
    description: "Spark plugs, filters, and a general engine check to keep performance sharp.",
  },
  {
    slug: "air-filter-cabin-air-filter",
    title: "Air Filter & Cabin Air Filter",
    description: "Fresh engine and cabin air filters for better airflow and cleaner cabin air.",
  },
  {
    slug: "brake-fluid-exchange",
    title: "Brake Fluid Exchange",
    description: "Flushes old brake fluid and replaces it to keep your brakes responsive.",
  },
  {
    slug: "air-conditioning-service",
    title: "Air Conditioning Service",
    description: "Checks refrigerant levels and A/C components to restore reliable cold air.",
  },
  {
    slug: "manufacturer-scheduled-maintenance",
    title: "Manufacturer Scheduled Maintenance",
    description: "Service performed to your manufacturer's recommended maintenance schedule.",
  },
  {
    slug: "vehicle-diagnostics",
    title: "Vehicle diagnostics",
    description: "Scans and diagnoses warning lights or drivability issues with professional tools.",
  },
];

export function bookingServiceTitle(slug: string): string | null {
  return BOOKING_SERVICES.find((service) => service.slug === slug)?.title ?? null;
}
