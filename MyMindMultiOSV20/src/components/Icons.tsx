// Stroke icons: 24-unit paths, one hue per icon (styles/icons.css), the first shape carrying a
// light wash of the same colour.
import { PATHS } from '../icon-paths'

const MINE: Record<string, [string, string]> = {
  mind: ['blue', '<circle cx="12" cy="12" r="3.2"/><circle cx="5" cy="6.5" r="2"/><circle cx="19" cy="6.5" r="2"/><circle cx="5" cy="17.5" r="2"/><circle cx="19" cy="17.5" r="2"/><path d="M9.5 10 6.5 7.8M14.5 10l3-2.2M9.5 14l-3 2.2M14.5 14l3 2.2"/>'],
  fish: ['teal', '<path d="M2 12h15"/><path d="M17 8.5h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3z"/><path d="M6 12 3.5 6.5M11 12 8.5 6.5M6 12l-2.5 5.5M11 12l-2.5 5.5M15.5 12 13 6.5M15.5 12 13 17.5"/>'],
  child: ['green', '<rect x="3" y="4" width="9" height="6" rx="1.5"/><rect x="12" y="15" width="9" height="6" rx="1.5"/><path d="M7.5 10v8H12"/>'],
  sibling: ['cyan', '<rect x="3" y="3.5" width="10" height="6" rx="1.5"/><rect x="3" y="14.5" width="10" height="6" rx="1.5"/><path d="M18 8v8M14 12h8"/>'],
  layout: ['indigo', '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2.5" y="16" width="6" height="5" rx="1"/><rect x="15.5" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5.5 16v-4h13v4"/>'],
  shape: ['purple', '<rect x="4" y="4" width="10" height="10" rx="2"/><circle cx="15.5" cy="15.5" r="5"/>'],
  center: ['sky', '<circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>'],
  align: ['green', '<rect x="4" y="4" width="16" height="4" rx="1"/><rect x="4" y="10" width="10" height="4" rx="1"/><rect x="4" y="16" width="13" height="4" rx="1"/>'],
  file: ['amber', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>'],
  edit: ['orange', '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'],
  color: ['pink', '<path d="M12 3s7 7.2 7 11.5a7 7 0 0 1-14 0C5 10.2 12 3 12 3z"/>'],
  saveAs: ['indigo', '<path d="M4 4h13l3 3v6"/><path d="M4 4v16h8"/><path d="M8 4v5h7V4"/><path d="M15 21l6-6-2-2-6 6v2z"/>'],
}

const iconOf = (name: string): [string, string] => MINE[name] ?? PATHS[name]?.[0] ?? PATHS.about[0]

export const ICON_NAMES = [...Object.keys(PATHS), ...Object.keys(MINE)]

export function Icon({ name, size }: { name: string; size?: number }) {
  const [tone, body] = iconOf(name)
  return (
    <svg
      className="icon"
      data-tone={tone}
      data-icon={name}
      data-duo=""
      viewBox="0 0 24 24"
      style={size ? { width: size, height: size, minWidth: size, minHeight: size, flexBasis: size } : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}

/** The country whose language a click switches to. */
export function Flag({ country }: { country: 'gb' | 'kr' }) {
  return (
    <span className="flag-slot" data-flag={country}>
      {country === 'gb' ? (
        <svg className="flag" viewBox="0 0 60 30" width="18" height="12" aria-hidden="true">
          <defs>
            <clipPath id="flag-gb-bounds"><rect width="60" height="30" /></clipPath>
            <clipPath id="flag-gb-offset"><path d="M30 15h30v15zv15H0zH0V0zV0h30z" /></clipPath>
          </defs>
          <g clipPath="url(#flag-gb-bounds)">
            <path d="M0 0v30h60V0z" fill="#012169" />
            <path d="M0 0 60 30M60 0 0 30" stroke="#fff" strokeWidth="6" />
            <path d="M0 0 60 30M60 0 0 30" clipPath="url(#flag-gb-offset)" stroke="#C8102E" strokeWidth="4" />
            <path d="M-1 11h27v-12h8v12h27v8H34v12h-8V19H-1z" fill="#C8102E" stroke="#FFF" strokeWidth="2" />
          </g>
        </svg>
      ) : (
        <svg className="flag" viewBox="-72 -48 144 96" width="18" height="12" aria-hidden="true">
          <path fill="#fff" d="M-72-48v96H72v-96z" />
          <g stroke="#000" strokeWidth="4" fill="none">
            <path transform="rotate(33.69006752598)" d="M-50-12v24m6 0v-24m6 0v24m76 0V1m0-2v-11m6 0v11m0 2v11m6 0V1m0-2v-11" />
            <path transform="rotate(-33.69006752598)" d="M-50-12v24m6 0V1m0-2v-11m6 0v24m76 0V1m0-2v-11m6 0v24m6 0V1m0-2v-11" />
          </g>
          <g transform="rotate(33.69006752598)">
            <path fill="#cd2e3a" d="M12 0a18 18 0 11-36 0 24 24 0 1148 0" />
            <path fill="#0047a0" d="M-24 0a24 24 0 1048 0A12 12 0 100 0a12 12 0 11-24 0" />
          </g>
        </svg>
      )}
    </span>
  )
}

/** Named shorthands for the toolbar, the context menu and the side panels. */
const named = (name: string) => {
  const Named = ({ size }: { size?: number }) => <Icon name={name} size={size} />
  return Named
}

export const IconExport = named('export')
export const IconNew = named('new')
export const IconOpen = named('open')
export const IconSave = named('save')
export const IconSaveAs = named('saveAs')
export const IconMind = named('mind')
export const IconFish = named('fish')
export const IconChild = named('child')
export const IconSibling = named('sibling')
export const IconTrash = named('delete')
export const IconInfo = named('about')
export const IconTheme = named('theme')
export const IconLang = named('language')
export const IconGrid = named('gridIcon')
export const IconLayout = named('layout')
export const IconShape = named('shape')
export const IconLine = named('line')
export const IconReset = named('center')
export const IconAlign = named('align')
export const IconFile = named('file')
export const IconUndo = named('undo')
export const IconRedo = named('redo')
export const IconEdit = named('edit')
export const IconText = named('label')
export const IconCopy = named('copy')
export const IconPaste = named('paste')
export const IconDuplicate = named('duplicate')
export const IconColor = named('color')
