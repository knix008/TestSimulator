import { useId, type ReactNode } from "react";

interface IconProps {
  children: ReactNode;
}

function Glyph({ children }: IconProps) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  const d = direction === "left" ? "M14.5 5.5 8 12l6.5 6.5" : "M9.5 5.5 16 12l-6.5 6.5";
  return (
    <Glyph>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Glyph>
  );
}

export function GearIcon() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.1 2.7h3.8l.5 2.2c.6.2 1.2.5 1.7.9l2-.9 2.7 2.7-1 2c.4.5.7 1.1.9 1.7l2.2.5v3.8l-2.2.5c-.2.6-.5 1.2-.9 1.7l1 2-2.7 2.7-2-.9c-.5.4-1.1.7-1.7.9l-.5 2.2h-3.8l-.5-2.2a7 7 0 0 1-1.7-.9l-2 .9-2.7-2.7 1-2a7 7 0 0 1-.9-1.7l-2.2-.5V9.8l2.2-.5c.2-.6.5-1.2.9-1.7l-1-2 2.7-2.7 2 .9c.5-.4 1.1-.7 1.7-.9l.5-2.2Zm1.9 6.5a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"
      />
    </Glyph>
  );
}

export function InfoIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11.2V16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8.2" r="1" fill="currentColor" />
    </Glyph>
  );
}

export function ImageIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1.7" fill="currentColor" />
      <path d="m4.5 17.5 5-5 3.5 3.5 2.5-2.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </Glyph>
  );
}

export function MinimizeIcon() {
  return (
    <Glyph>
      <path d="M6 12h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Glyph>
  );
}

export function MaximizeIcon() {
  return (
    <Glyph>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </Glyph>
  );
}

export function RestoreIcon() {
  return (
    <Glyph>
      <rect x="5.5" y="9" width="9.5" height="9.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 6.5V6.4c0-.5.4-.9.9-.9h7.2c.8 0 1.4.6 1.4 1.4v7.2c0 .5-.4.9-.9.9h-.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Glyph>
  );
}

export function CloseIcon() {
  return (
    <Glyph>
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Glyph>
  );
}

export function CollapseIcon() {
  return (
    <Glyph>
      <path d="M6.5 14.5 12 9l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Glyph>
  );
}

export function ResizeGripIcon() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <path d="M13 3 3 13M13 7.5 7.5 13M13 12l-1 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <Glyph>
      <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Glyph>
  );
}

export function MinusIcon() {
  return (
    <Glyph>
      <path d="M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Glyph>
  );
}

export function ListIcon() {
  return (
    <Glyph>
      <path d="M9.5 7h9M9.5 12h9M9.5 17h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="5.5" cy="7" r="1.2" fill="currentColor" />
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="5.5" cy="17" r="1.2" fill="currentColor" />
    </Glyph>
  );
}

export function RepeatIcon() {
  return (
    <Glyph>
      <path
        d="M5 11V9.5A2.5 2.5 0 0 1 7.5 7H18m-3-3 3 3-3 3M19 13v1.5a2.5 2.5 0 0 1-2.5 2.5H6m3 3-3-3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

export function BellIcon() {
  return (
    <Glyph>
      <path
        d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5ZM10 20.5a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

const LINE = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function SlidersIcon() {
  return (
    <Glyph>
      <path d="M5 7h8M17 7h2M5 12h2M11 12h8M5 17h10" {...LINE} />
      <circle cx="15" cy="7" r="2" {...LINE} />
      <circle cx="9" cy="12" r="2" {...LINE} />
      <circle cx="17" cy="17" r="2" {...LINE} />
    </Glyph>
  );
}

export function PaletteIcon() {
  return (
    <Glyph>
      <path d="M12 4a8 8 0 0 0 0 16c1.3 0 2-.8 2-1.8 0-1.4-1.2-1.7-1.2-2.9 0-1 .8-1.8 1.8-1.8H17a3 3 0 0 0 3-3C20 7.1 16.4 4 12 4Z" {...LINE} />
      <circle cx="8.2" cy="11" r="1.1" fill="currentColor" />
      <circle cx="10.5" cy="7.6" r="1.1" fill="currentColor" />
      <circle cx="14.6" cy="7.8" r="1.1" fill="currentColor" />
    </Glyph>
  );
}

export function CalendarIcon() {
  return (
    <Glyph>
      <rect x="4.5" y="5.5" width="15" height="14" rx="2.5" {...LINE} />
      <path d="M4.5 10h15M8.5 3.8v3.4M15.5 3.8v3.4" {...LINE} />
      <path d="M8 13.5h1M11.5 13.5h1M15 13.5h1M8 16.5h1M11.5 16.5h1" {...LINE} />
    </Glyph>
  );
}

export function WeekStartIcon() {
  return (
    <Glyph>
      <rect x="4.5" y="5.5" width="15" height="14" rx="2.5" {...LINE} />
      <path d="M4.5 10h15M8.5 3.8v3.4M15.5 3.8v3.4" {...LINE} />
      <path d="M8 14.8h8m-2.5-2.5 2.5 2.5-2.5 2.5" {...LINE} />
    </Glyph>
  );
}

export function FlagIcon() {
  return (
    <Glyph>
      <path d="M6 20.5V4.5M6 5h10.5l-2 3.5 2 3.5H6" {...LINE} />
    </Glyph>
  );
}

export function EventsIcon() {
  return (
    <Glyph>
      <rect x="4.5" y="5.5" width="15" height="14" rx="2.5" {...LINE} />
      <path d="M4.5 10h15M8.5 3.8v3.4M15.5 3.8v3.4M9 14.8l2 2 4-4" {...LINE} />
    </Glyph>
  );
}

export function GlobeIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8" {...LINE} />
      <path d="M4 12h16M12 4c2.2 2.3 3.2 5 3.2 8s-1 5.7-3.2 8c-2.2-2.3-3.2-5-3.2-8s1-5.7 3.2-8Z" {...LINE} />
    </Glyph>
  );
}

export function PinIcon() {
  return (
    <Glyph>
      <path d="M9 4.5h6M10 4.5v5l-3 3.5h10l-3-3.5v-5M12 13v6.5" {...LINE} />
    </Glyph>
  );
}

export function PowerIcon() {
  return (
    <Glyph>
      <path d="M12 4v7.5M7.5 7.2a6.5 6.5 0 1 0 9 0" {...LINE} />
    </Glyph>
  );
}

export function SunIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3.6" {...LINE} />
      <path d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M6 18l1.3-1.3M16.7 7.3 18 6" {...LINE} />
    </Glyph>
  );
}

export function TransparencyIcon() {
  return (
    <Glyph>
      <path d="M12 3.8s-6 6.3-6 10.4a6 6 0 0 0 12 0c0-4.1-6-10.4-6-10.4Z" {...LINE} />
      <path d="M12 3.8v16.4a6 6 0 0 0 6-6c0-4.1-6-10.4-6-10.4Z" fill="currentColor" />
    </Glyph>
  );
}

export function MoonIcon() {
  return (
    <Glyph>
      <path d="M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9Z" {...LINE} />
    </Glyph>
  );
}

export function LocationIcon() {
  return (
    <Glyph>
      <path d="M12 20.5s6-5.4 6-10.5a6 6 0 0 0-12 0c0 5.1 6 10.5 6 10.5Z" {...LINE} />
      <circle cx="12" cy="10" r="2.2" {...LINE} />
    </Glyph>
  );
}

function Trigram({ broken }: { broken: [boolean, boolean, boolean] }) {
  return (
    <>
      {broken.map((gap, index) => {
        const y = -25 + index * 3 - 1;
        return gap ? (
          <g key={index}>
            <rect x={-6} y={y} width={5.5} height={2} />
            <rect x={0.5} y={y} width={5.5} height={2} />
          </g>
        ) : (
          <rect key={index} x={-6} y={y} width={12} height={2} />
        );
      })}
    </>
  );
}

/** Taegukgi: geon (upper left), gam (upper right), ri (lower left), gon (lower right) around the taegeuk. */
export function KoreaFlag() {
  return (
    <svg className="flag" viewBox="-36 -24 72 48" width="21" height="14" aria-hidden="true">
      <rect x="-36" y="-24" width="72" height="48" fill="#fff" />
      <g transform="rotate(-56.31)" fill="#000">
        <Trigram broken={[false, false, false]} />
        <g transform="rotate(180)">
          <Trigram broken={[true, true, true]} />
        </g>
        <circle r="12" fill="#cd2e3a" />
        <path d="M0-12A6 6 0 0 0 0 0a6 6 0 0 1 0 12 12 12 0 0 1 0-24Z" fill="#0047a0" />
      </g>
      <g transform="rotate(-123.69)" fill="#000">
        <Trigram broken={[false, true, false]} />
        <g transform="rotate(180)">
          <Trigram broken={[true, false, true]} />
        </g>
      </g>
    </svg>
  );
}

/** Union Jack, with the red diagonals offset as on the real flag. */
export function UnitedKingdomFlag() {
  const id = useId();
  return (
    <svg className="flag" viewBox="0 0 60 30" width="28" height="14" aria-hidden="true">
      <clipPath id={`${id}-s`}>
        <path d="M0 0v30h60V0z" />
      </clipPath>
      <clipPath id={`${id}-t`}>
        <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
      </clipPath>
      <g clipPath={`url(#${id}-s)`}>
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" clipPath={`url(#${id}-t)`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <Glyph>
      <path
        d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2M19.5 4.5v5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

export function PencilIcon() {
  return (
    <Glyph>
      <path
        d="M14.5 5.5l4 4M4.5 19.5l1-4.2L15.8 5a1.4 1.4 0 0 1 2 0l1.2 1.2a1.4 1.4 0 0 1 0 2L8.7 18.5l-4.2 1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

export function TrashIcon() {
  return (
    <Glyph>
      <path
        d="M4.5 7h15M10 7V5h4v2M6.5 7l.9 11.2A1.9 1.9 0 0 0 9.3 20h5.4a1.9 1.9 0 0 0 1.9-1.8L17.5 7M10.5 10.5v6M13.5 10.5v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

export function TodayIcon() {
  return (
    <Glyph>
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="14.7" r="1.9" fill="currentColor" />
    </Glyph>
  );
}

export function PrintIcon() {
  return (
    <Glyph>
      <path
        d="M7 8.5V4h10v4.5M7 16.5H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 8.5h14a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-2M7 13.5h10V20H7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="11.3" r="1" fill="currentColor" />
    </Glyph>
  );
}

export function PageSetupIcon() {
  return (
    <Glyph>
      <rect x="5" y="3.5" width="14" height="17" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Glyph>
  );
}

export function HideIcon() {
  return (
    <Glyph>
      <path
        d="M3.5 12s3-6 8.5-6c1.6 0 3 .5 4.2 1.2M20.5 12s-3 6-8.5 6c-1.6 0-3-.5-4.2-1.2M4.5 19.5l15-15M9.9 14.1a3 3 0 0 1 4.2-4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

export function FontIcon() {
  return (
    <Glyph>
      <path d="M4.5 19 10 5h1l5.5 14M6.6 14h7.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 12.5h3M18.5 11v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Glyph>
  );
}
