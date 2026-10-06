import type { ReactNode } from "react";

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

export function HideIcon() {
  return (
    <Glyph>
      <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
