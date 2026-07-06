import { hexColorsEqual, PRESET_COLORS } from '../utils/presetColors';

interface PresetColorSwatchesProps {
  selectedHex: string;
  disabled?: boolean;
  ariaLabel: string;
  presets?: readonly string[];
  onSelect: (hex: string) => void;
  className?: string;
}

export function PresetColorSwatches({
  selectedHex,
  disabled = false,
  ariaLabel,
  presets = PRESET_COLORS,
  onSelect,
  className,
}: PresetColorSwatchesProps) {
  return (
    <div
      className={['preset-color-swatches', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={ariaLabel}
    >
      {presets.map((hex) => {
        const selected = hexColorsEqual(selectedHex, hex);
        return (
          <button
            key={hex}
            type="button"
            className={`preset-color-swatch${selected ? ' preset-color-swatch--selected' : ''}`}
            style={{ backgroundColor: hex }}
            disabled={disabled}
            title={hex}
            aria-label={hex}
            aria-pressed={selected}
            onClick={() => onSelect(hex)}
          />
        );
      })}
    </div>
  );
}
