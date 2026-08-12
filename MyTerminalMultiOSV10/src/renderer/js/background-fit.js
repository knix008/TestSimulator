/** How the terminal background image is painted. */
export const BG_FIT_MODES = [
  {
    id: 'cover',
    size: 'cover',
    position: 'center',
    repeat: 'no-repeat',
  },
  {
    id: 'contain',
    size: 'contain',
    position: 'center',
    repeat: 'no-repeat',
  },
  {
    id: 'stretch',
    size: '100% 100%',
    position: 'center',
    repeat: 'no-repeat',
  },
  {
    id: 'center',
    size: 'auto',
    position: 'center',
    repeat: 'no-repeat',
  },
  {
    id: 'tile',
    size: 'auto',
    position: 'top left',
    repeat: 'repeat',
  },
];

export const DEFAULT_BG_FIT = 'cover';

export function getBgFitById(id) {
  return BG_FIT_MODES.find((m) => m.id === id) || BG_FIT_MODES[0];
}

export function normalizeBgFit(id) {
  return getBgFitById(id).id;
}
