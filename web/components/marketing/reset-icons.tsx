/**
 * Custom pictogram icons for the Airbag & System Reset card's icon row
 * (components/marketing/sections.tsx), matching a supplied reference
 * image (seat/airbag, battery, ECM chip, SAS rotation) rather than the
 * closest generic Lucide icons. Same stroke-based style as the rest of
 * the site's icons (currentColor, round caps/joins) so they inherit the
 * card's red color the same way.
 */

type IconProps = { size?: number };

export function AirbagResetIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* occupant: head + seat back */}
      <circle cx="5.3" cy="6" r="2.2" />
      <path d="M3 9.6c0-1 1-1.9 2.3-1.9s2.3.9 2.3 1.9v9.6a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 19.2V9.6Z" />
      {/* airbag deploying toward the occupant, motion lines trailing right */}
      <circle cx="16.5" cy="9" r="4" />
      <path d="M12.9 6.6l-1.6-1M12.3 9h-1.8M12.9 11.4l-1.6 1" />
    </svg>
  );
}

export function BatteryResetIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="7.5" width="17.5" height="9" rx="1.6" />
      <path d="M21.5 10.3v3.4" />
      <path d="M5.8 12.2h3.2" />
      <path d="M13.8 10.4v3.6M12 12.2h3.6" />
    </svg>
  );
}

export function EcmResetIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="14" height="14" rx="1.4" />
      <path d="M8.3 2.2v2.8M12 2.2v2.8M15.7 2.2v2.8M8.3 19v2.8M12 19v2.8M15.7 19v2.8M2.2 8.3H5M2.2 12H5M2.2 15.7H5M19 8.3h2.8M19 12h2.8M19 15.7h2.8" />
      <text
        x="12"
        y="14.2"
        textAnchor="middle"
        fontSize="6.2"
        fontWeight="800"
        stroke="none"
        fill="currentColor"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        ECM
      </text>
    </svg>
  );
}

export function SasResetIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5.3" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      {/* two rotation arrows, opposite sides */}
      <path d="M4.3 8.4A9 9 0 0 1 9.2 3.8" />
      <path d="M4.6 5.1 4.3 8.4l3.2.6" />
      <path d="M19.7 15.6a9 9 0 0 1-4.9 4.6" />
      <path d="M19.4 18.9 19.7 15.6l-3.2-.6" />
    </svg>
  );
}
