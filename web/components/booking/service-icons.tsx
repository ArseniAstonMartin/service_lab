import {
  BatteryCharging,
  CalendarCheck,
  CircleDot,
  ClipboardCheck,
  CloudDrizzle,
  Compass,
  Disc3,
  FileCheck2,
  FlaskConical,
  Lightbulb,
  LifeBuoy,
  RotateCw,
  Scale,
  Settings2,
  Snowflake,
  Stethoscope,
  Droplet,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Keyed by lib/booking/catalog.ts's slugs, same convention as
// components/wizard/vehicle-module-part-form.tsx's CATEGORY_ICONS:
// Wrench is the fallback for anything unmapped.
const BOOKING_SERVICE_ICONS: Record<string, LucideIcon> = {
  "oil-filter-change": Droplet,
  "tire-rotation": RotateCw,
  "wheel-alignment": Compass,
  "tire-replacement": CircleDot,
  "complete-vehicle-inspection": ClipboardCheck,
  "state-inspection": FileCheck2,
  brakes: Disc3,
  "wheel-balance": Scale,
  "wiper-blades": CloudDrizzle,
  "flat-repair": LifeBuoy,
  "starting-charging-battery": BatteryCharging,
  "lighting-bulbs": Lightbulb,
  "engine-tune-up": Settings2,
  "air-filter-cabin-air-filter": Wind,
  "brake-fluid-exchange": FlaskConical,
  "air-conditioning-service": Snowflake,
  "manufacturer-scheduled-maintenance": CalendarCheck,
  "vehicle-diagnostics": Stethoscope,
};

export function bookingServiceIcon(slug: string): LucideIcon {
  return BOOKING_SERVICE_ICONS[slug] ?? Wrench;
}
