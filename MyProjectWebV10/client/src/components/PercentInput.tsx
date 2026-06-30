import { useEffect, useState, type MouseEvent, type FocusEvent } from 'react';

interface PercentInputProps {
  value: number;
  inputKey?: string | number;
  readOnly?: boolean;
  className?: string;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
  onClick?: (event: MouseEvent<HTMLInputElement>) => void;
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePercentInput(raw: string, min: number, max: number, fallback: number): number {
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return clampPercent(Math.round(parsed), min, max);
}

/** Percent field that allows clearing while typing; commits on blur or Enter. */
export function PercentInput({
  value,
  inputKey,
  readOnly = false,
  className,
  min = 0,
  max = 100,
  onCommit,
  onClick,
}: PercentInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const roundedValue = Math.round(value);

  useEffect(() => {
    setDraft(null);
  }, [inputKey]);

  const displayValue = draft ?? String(roundedValue);

  const commit = (raw: string) => {
    const next = parsePercentInput(raw, min, max, roundedValue);
    setDraft(null);
    if (next !== roundedValue) {
      onCommit(next);
    }
  };

  return (
    <input
      type="number"
      className={className}
      min={min}
      max={max}
      readOnly={readOnly}
      value={displayValue}
      onClick={onClick}
      onFocus={(event: FocusEvent<HTMLInputElement>) => {
        event.target.select();
        setDraft(String(roundedValue));
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
