import { t } from '../i18n/index.js';
import {
  DEFAULT_COLOR_THEME_INDEX,
  PASTEL_PRESETS,
  normalizeColorThemeIndex,
  rgbToArgb,
  argbToRgb
} from './pastelThemeCatalog.js';
import { rgbToHex } from './pastelThemePaletteBuilder.js';

export function createPastelColorThemePicker({ initial, onChange }) {
  let useCustom = Boolean(initial?.useCustomAccentColor);
  let selectedIndex = normalizeColorThemeIndex(initial?.colorThemeIndex ?? DEFAULT_COLOR_THEME_INDEX);
  let customColor = initial?.useCustomAccentColor
    ? argbToRgb(initial.customAccentArgb)
    : PASTEL_PRESETS[selectedIndex].accent;

  const root = document.createElement('div');
  root.className = 'color-theme-picker';

  const label = document.createElement('span');
  label.className = 'color-theme-picker-label';
  label.textContent = t.preferencesColorTheme;

  const grid = document.createElement('div');
  grid.className = 'color-theme-grid';
  grid.setAttribute('role', 'listbox');
  grid.setAttribute('aria-label', t.preferencesColorTheme);

  const swatchButtons = [];

  for (const preset of PASTEL_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-swatch';
    button.dataset.index = String(preset.index);
    button.title = t[preset.nameKey] || preset.nameKey;
    button.style.backgroundColor = rgbToHex(preset.accent);
    button.setAttribute('role', 'option');
    button.addEventListener('click', () => {
      useCustom = false;
      selectedIndex = preset.index;
      refreshSelection();
      onChange?.(readValue());
    });
    swatchButtons.push(button);
    grid.appendChild(button);
  }

  const customRow = document.createElement('div');
  customRow.className = 'color-theme-custom-row';

  const customButton = document.createElement('button');
  customButton.type = 'button';
  customButton.className = 'color-theme-custom-btn';
  customButton.textContent = t.preferencesCustomColor;

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'color-theme-native-input';
  colorInput.value = rgbToHex(customColor);

  customButton.addEventListener('click', () => {
    colorInput.click();
  });

  colorInput.addEventListener('input', () => {
    const hex = colorInput.value;
    customColor = {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16)
    };
    useCustom = true;
    refreshSelection();
    onChange?.(readValue());
  });

  customRow.append(customButton, colorInput);
  root.append(label, grid, customRow);

  function refreshSelection() {
    for (const button of swatchButtons) {
      const index = Number.parseInt(button.dataset.index, 10);
      const selected = !useCustom && index === selectedIndex;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    customButton.classList.toggle('is-selected', useCustom);
    colorInput.value = rgbToHex(customColor);
  }

  function readValue() {
    return {
      colorThemeIndex: selectedIndex,
      useCustomAccentColor: useCustom,
      customAccentArgb: rgbToArgb(customColor)
    };
  }

  refreshSelection();

  return {
    element: root,
    readValue,
    refreshSelection
  };
}
