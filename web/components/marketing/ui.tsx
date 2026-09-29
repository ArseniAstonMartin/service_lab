import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Cpu,
  KeyRound,
  Leaf,
  Microchip,
  MonitorCog,
  Package,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

const SERVICE_ICONS: Record<string, LucideIcon> = {
  wrench: Wrench,
  monitor: MonitorCog,
  shield: ShieldCheck,
  cpu: Cpu,
  chip: Microchip,
  leaf: Leaf,
  key: KeyRound,
};
export function ServiceIcon({ name, size = 25 }: { name: string; size?: number }) {
  const Icon = SERVICE_ICONS[name] ?? Cpu;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}

export function ActionLink({
  href,
  children,
  secondary = false,
  icon = "calendar",
  className = "",
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  icon?: "calendar" | "package" | "none";
  className?: string;
}) {
  return (
    <a className={`m-button ${secondary ? "m-button-secondary" : ""} ${className}`} href={href}>
      {icon === "calendar" ? (
        <CalendarDays size={19} aria-hidden="true" />
      ) : icon === "package" ? (
        <Package size={19} aria-hidden="true" />
      ) : null}
      {children}
      <ArrowRight size={17} aria-hidden="true" />
    </a>
  );
}

export function PhotoTile({
  index,
  label,
  className = "",
}: {
  index: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`m-photo-tile ${className}`}
      style={{ backgroundPosition: `${((index % 4) * 100) / 3}% ${index < 4 ? 15 : 85}%` }}
    />
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="m-page-intro">
      <div className="m-container">
        <Link href="/" className="m-breadcrumb">
          Home <span>/</span> {eyebrow}
        </Link>
        <p className="m-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="m-lead">{description}</p>
      </div>
    </section>
  );
}

export function NationwideMap() {
  return (
    <svg
      className="m-nation-map"
      viewBox="0 0 360 230"
      role="img"
      aria-label="Mail-in service connecting Hawaii and the continental United States"
    >
      <path
        d="M49 37 75 43 107 48 143 51 173 48 184 57 206 50 228 65 241 63 254 77 270 76 287 57 302 52 315 38 322 48 314 65 307 75 321 78 311 91 290 105 284 122 267 139 264 160 278 189 270 192 251 168 238 163 216 166 194 151 177 157 163 176 148 172 138 151 122 146 99 134 72 130 62 113 50 109 38 82Z"
        fill="#d9eaff"
      />
      <path d="m28 183 9 2 6 8-9-2Zm22 14 11 4 3 10-10-3Z" fill="#b9d5ff" />
      {[
        "M58 202Q51 85 109 88",
        "M58 202Q123 107 184 106",
        "M58 202Q160 150 253 158",
        "M58 202Q172 28 297 82",
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke="#1261ff" strokeWidth="1.5" strokeDasharray="5 5" />
      ))}
      {[
        [109, 88],
        [184, 106],
        [253, 158],
        [297, 82],
        [58, 202],
      ].map(([cx, cy]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="4"
          fill="#1261ff"
          stroke="white"
          strokeWidth="2"
        />
      ))}
      <text x="17" y="226" fill="#365070" fontSize="9" letterSpacing="2">
        HAWAII
      </text>
    </svg>
  );
}
