/**
 * The moving start-screen backgrounds laid out as cards to choose from (ported from MyZipMaster).
 * Each card shows a small coloured stroke icon and the background's name; the chosen one is `.on`.
 * Renders its own `.bg-cards-wrap` (the container-query box) so the grid always fills whole rows.
 */
import type { ReactNode } from 'react'
import { ANIMATIONS } from './background'

// A small picture for each background: its colour and what it shows (24 × 24 viewBox).
const ICONS: Record<string, [string, ReactNode]> = {
  discs: ['#2563eb', <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 8.5a6.5 6.5 0 0 1 3-2.6" /><path d="M17.5 15.5a6.5 6.5 0 0 1-3 2.6" /></>],
  burn: ['#ea580c', <><circle cx="12" cy="12" r="9" /><path d="M14 12a2 2 0 1 1-2-2 4 4 0 0 1 4 4 6 6 0 0 1-6 6" /><circle cx="10" cy="20" r="1" /></>],
  sectors: ['#65a30d', <><rect x="3.5" y="3.5" width="4.5" height="4.5" rx="0.8" /><rect x="9.75" y="3.5" width="4.5" height="4.5" rx="0.8" /><rect x="16" y="3.5" width="4.5" height="4.5" rx="0.8" /><rect x="3.5" y="9.75" width="4.5" height="4.5" rx="0.8" /><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="0.8" /><rect x="3.5" y="16" width="4.5" height="4.5" rx="0.8" /><path d="M16 12h4.5M10 18.25h4" /></>],
  tracks: ['#7c3aed', <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="1.5" /><path d="M12 3a9 9 0 0 1 6.4 2.6" strokeWidth="3" /><path d="M6.5 12a5.5 5.5 0 0 1 1.6-3.9" strokeWidth="3" /></>],
  isotree: ['#ca8a04', <><rect x="3" y="3" width="7" height="4" rx="1" /><path d="M6 7v11h5M6 12h5" /><rect x="11" y="10" width="9" height="4" rx="1" /><rect x="11" y="16" width="9" height="4" rx="1" /></>],
  beams: ['#db2777', <><path d="M12 20 4.5 6" /><path d="M12 20V4" /><path d="M12 20 19.5 6" /><circle cx="12" cy="20" r="1.5" /></>],
  files: ['#3b82f6', <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></>],
  volumes: ['#8b5cf6', <><rect x="3" y="5" width="18" height="4" rx="1" /><rect x="3" y="11" width="11" height="4" rx="1" /><rect x="3" y="17" width="6" height="3" rx="1" /></>],
  boxes: ['#f97316', <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>],
  bytes: ['#22c55e', <><rect x="5" y="4" width="5" height="7" rx="2" /><path d="M16 4v7" /><path d="M6 14v7" /><rect x="13" y="14" width="5" height="7" rx="2" /></>],
  aurora: ['#10b981', <><path d="M3 18c3-10 5-12 7-12s1 8 4 8 3-6 7-9" /><path d="M3 21c4-4 6-5 9-5s5 1 9-3" /></>],
  waves: ['#0ea5e9', <><path d="M3 8c3-3 6-3 9 0s6 3 9 0" /><path d="M3 13c3-3 6-3 9 0s6 3 9 0" /><path d="M3 18c3-3 6-3 9 0s6 3 9 0" /></>],
  particles: ['#ec4899', <><circle cx="6" cy="7" r="1.6" /><circle cx="15" cy="5" r="1.2" /><circle cx="19" cy="12" r="1.8" /><circle cx="10" cy="13" r="1.4" /><circle cx="5" cy="18" r="1.2" /><circle cx="15" cy="19" r="1.6" /></>],
  constellation: ['#6366f1', <><path d="m5 6 7 4 7-5M12 10l-3 9 10-3" /><circle cx="5" cy="6" r="1.5" /><circle cx="12" cy="10" r="1.5" /><circle cx="19" cy="5" r="1.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="19" cy="16" r="1.5" /></>],
  bubbles: ['#06b6d4', <><circle cx="9" cy="14" r="5" /><circle cx="17" cy="8" r="3" /><circle cx="18" cy="17" r="2" /></>],
  gridflow: ['#64748b', <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>],
  starfield: ['#eab308', <path d="m12 3 2.6 6 6.4.6-4.8 4.2 1.4 6.2-5.6-3.3L6.4 20l1.4-6.2L3 9.6 9.4 9z" />],
  snow: ['#38bdf8', <><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /><path d="m9.5 5 2.5 2 2.5-2M9.5 19l2.5-2 2.5 2" /></>],
  fireflies: ['#a3e635', <><circle cx="7" cy="8" r="2" /><circle cx="17" cy="7" r="1.4" /><circle cx="14" cy="16" r="2.4" /><circle cx="6" cy="18" r="1.2" /></>],
  ripples: ['#2dd4bf', <><circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="9" /></>],
  hexagons: ['#d97706', <><path d="m8 3 4 2.3v4.6L8 12.2 4 9.9V5.3z" /><path d="m16 3 4 2.3v4.6l-4 2.3-4-2.3V5.3z" /><path d="m12 11.7 4 2.3v4.6l-4 2.3-4-2.3V14z" /></>],
  orbits: ['#a855f7', <><circle cx="12" cy="12" r="2.5" /><ellipse cx="12" cy="12" rx="10" ry="4" /><circle cx="20" cy="9.5" r="1.2" /></>],
  lava: ['#ef4444', <><path d="M8 3h8l1 3-1 3c3 3 3 12-4 12S5 12 8 9L7 6z" /><circle cx="12" cy="15" r="2" /></>],
  ribbons: ['#f43f5e', <><path d="M3 7c5-4 7 8 12 4s4-5 6-5" /><path d="M3 15c5-4 7 8 12 4s4-5 6-5" /></>],
}

export interface BackgroundCardsProps {
  value: string
  onChange: (id: string) => void
  names: Record<string, string>
}

export default function BackgroundCards({ value, onChange, names }: BackgroundCardsProps) {
  const ids: string[] = ANIMATIONS
  return (
    <div className="bg-cards-wrap">
      <div className="bg-cards" data-testid="bg-cards">
        {ids.map((id) => {
          const [color, shape] = ICONS[id] ?? ['currentColor', <circle cx="12" cy="12" r="8" />]
          const name = names[id] ?? id
          const on = id === value
          return (
            <button key={id} type="button" className={on ? 'bg-card on' : 'bg-card'} data-bg-card={id} aria-pressed={on} title={name} onClick={() => onChange(id)}>
              <svg className="bg-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>
              <span className="bg-card-name">{name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { BackgroundCards }
