/** The forty colours the Swatches panel starts with: five rows of eight, all different. */
export const DEFAULT_SWATCHES = [
  // Vivid
  '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#5e35b1', '#d81b60',
  // Deep
  '#8e1c1c', '#a65a00', '#8d7b00', '#1b5e20', '#006064', '#0d47a1', '#311b92', '#880e4f',
  // Pastel
  '#ffb3ba', '#ffdfba', '#fff5ba', '#baffc9', '#bae7ff', '#bac8ff', '#d9baff', '#ffbaf2',
  // Pale pastel
  '#fde4e4', '#fdf0dc', '#fbfbd9', '#dff7e3', '#dcf5f7', '#dfe9fb', '#ece1fb', '#fbe1f0',
  // Neutrals and earth
  '#000000', '#424242', '#808080', '#bdbdbd', '#ffffff', '#795548', '#c8a27a', '#f5e6c8',
]

/** What the list used to start with: anyone still on exactly that gets the new one. */
const OLD_DEFAULT = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#78350f']

export function migrateSwatches(stored: string[]) {
  return stored.length === OLD_DEFAULT.length && stored.every((colour, index) => colour === OLD_DEFAULT[index]) ? DEFAULT_SWATCHES : stored
}
