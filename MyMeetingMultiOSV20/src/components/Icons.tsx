// Stroke icons: 24-unit paths, one hue per icon (styles/icons.css), the first shape carrying a
// light wash of the same colour.
import { PATHS } from '../icon-paths'

const MINE: Record<string, [string, string]> = {
  users: ['blue', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>'],
  agenda: ['indigo', '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5V2.5h6v1M8.5 9h7M8.5 13h7M8.5 17h4"/>'],
  decision: ['green', '<path d="M12 3 3 7.5 12 12l9-4.5z"/><path d="m8 15.5 3 3 6-6.5"/>'],
  action: ['orange', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>'],
  discussion: ['purple', '<path d="M4 5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M16 9h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1v3l-4-3h-4"/>'],
  info: ['sky', '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'],
  calendar: ['red', '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  place: ['pink', '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'],
  person: ['teal', '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>'],
  pen: ['amber', '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'],
  addSection: ['green', '<rect x="3" y="4" width="18" height="7" rx="1.5"/><path d="M3 15.5h8M3 19.5h8M17.5 14v7M14 17.5h7"/>'],
  grip: ['slate', '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>'],
  more: ['slate', '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>'],
  up: ['sky', '<path d="m6 15 6-6 6 6"/>'],
  down: ['sky', '<path d="m6 9 6 6 6-6"/>'],
  link: ['blue', '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'],
  quote: ['purple', '<path d="M5 17c0-4 1-7 5-9M14 17c0-4 1-7 5-9"/><path d="M5 17h4v-4H5zM14 17h4v-4h-4z"/>'],
  numbered: ['indigo', '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 4.5h1.5V9M3.5 9h3.5M3.5 14.5a1.5 1.5 0 0 1 3 .5c0 1-3 2-3 3.5h3.5"/>'],
  checklist: ['green', '<rect x="3" y="4" width="6" height="6" rx="1"/><path d="m4.5 15.5 1.5 1.5 3-3.5M12 7h9M12 16h9"/>'],
  rule: ['teal', '<path d="M3 12h18"/><path d="M3 6h4M3 18h4M17 6h4M17 18h4"/>'],
  heading: ['indigo', '<path d="M5 4v16M15 4v16M5 12h10"/><path d="M18 10l2-1v11"/>'],
  page: ['blue', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'],
  zoomOut: ['sky', '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6"/>'],
  word: ['blue', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="m8.5 12 1.5 6 2-4.5 2 4.5 1.5-6"/>'],
  html: ['orange', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="m10 13-2 2 2 2M14 13l2 2-2 2"/>'],
  text: ['cyan', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 12h6M9 15h6M9 18h4"/>'],
  markdown: ['purple', '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 15V9l2.5 3L11 9v6M15.5 9v6M13.5 13l2 2 2-2"/>'],
  file: ['blue', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>'],
  edit: ['amber', '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 20h7"/>'],
  saveAs: ['green', '<path d="M5 4h11l3 3v6"/><path d="M5 4v16h7M8 4v5h7V4M15 21l1-3 4-4 2 2-4 4z"/>'],
  color: ['pink', '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>'],
  template: ['purple', '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9h17M9 9v11.5"/>'],
  pdf: ['red', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 18v-5h1.5a1.5 1.5 0 0 1 0 3H9"/>'],
  // For the minutes themselves (the editor's icon picker).
  idea: ['amber', '<path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/><path d="M9.5 18.5h5M10.5 21h3"/>'],
  question: ['sky', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.5"/>'],
  flag: ['red', '<path d="M5 4h12l-2 4 2 4H5z"/><path d="M5 21V3"/>'],
  trophy: ['amber', '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/>'],
  rocket: ['purple', '<path d="M12 2.5c3.5 2 5 6 4.5 10.5l-2 3h-5l-2-3C7 8.5 8.5 4.5 12 2.5z"/><circle cx="12" cy="9" r="1.8"/><path d="M7.5 13 5 16l2.5 1M16.5 13l2.5 3-2.5 1M10 19l2 2.5 2-2.5"/>'],
  chartBar: ['green', '<path d="M10 20V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v13z"/><path d="M4 20v-7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7M16 20v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9M3 20.5h18"/>'],
  chartPie: ['purple', '<path d="M11 4v9h9a9 9 0 1 1-9-9z"/><path d="M14 2.5A7.5 7.5 0 0 1 21.5 10H14z"/>'],
  trendUp: ['green', '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'],
  trendDown: ['red', '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>'],
  money: ['green', '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v.5M18 14v.5"/>'],
  coin: ['amber', '<circle cx="12" cy="12" r="9"/><path d="M14.5 9c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6v1.5M12 16.5V18"/>'],
  cart: ['orange', '<path d="M6 6h15l-2 8H8z"/><path d="M3 3h2.5L8 14l-1 3h12"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>'],
  mail: ['blue', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>'],
  phone: ['green', '<path d="M5 3h3.5l1.5 4.5-2.2 1.4a11 11 0 0 0 7.3 7.3l1.4-2.2L21 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>'],
  video: ['red', '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'],
  mic: ['pink', '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'],
  bell: ['amber', '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'],
  lock: ['indigo', '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.5"/>'],
  unlock: ['teal', '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.7-1.5M12 14v2.5"/>'],
  key: ['amber', '<circle cx="8" cy="15" r="4.5"/><path d="m11.5 12 8-8M16 7l2.5 2.5M14 9l2 2"/>'],
  shield: ['blue', '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'],
  bug: ['red', '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M9 8a3 3 0 0 1 6 0M12 12v8M3 13h4M17 13h4M4 8l3 2M20 8l-3 2M4 19l3-2M20 19l-3-2"/>'],
  wrench: ['orange', '<path d="M15 3a5 5 0 0 0-4.6 7L3.5 16.9a2.1 2.1 0 0 0 3 3l6.9-6.9A5 5 0 0 0 21 9l-3 1-3-3 1-3.9z"/>'],
  cloud: ['sky', '<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A4 4 0 0 1 17.5 18z"/>'],
  database: ['cyan', '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>'],
  server: ['indigo', '<rect x="3.5" y="4" width="17" height="7" rx="1.5"/><rect x="3.5" y="13" width="17" height="7" rx="1.5"/><path d="M7 7.5h.5M7 16.5h.5M11 7.5h6M11 16.5h6"/>'],
  laptop: ['blue', '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19l-2-4h-15z"/>'],
  mobile: ['teal', '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'],
  map: ['green', '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'],
  car: ['red', '<rect x="3" y="11" width="18" height="6" rx="2"/><path d="M5 11l1.8-4.5A2 2 0 0 1 8.7 5h6.6a2 2 0 0 1 1.9 1.5L19 11M6 17v2.5M18 17v2.5M7 14h.5M16.5 14h.5"/>'],
  send: ['sky', '<path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m10 13 4-4"/>'],
  coffee: ['brown', '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3c-.5 1 .5 2 0 3M12 3c-.5 1 .5 2 0 3"/>'],
  gift: ['pink', '<rect x="4" y="10" width="16" height="10" rx="1"/><path d="M3 7h18v3H3zM12 7v13M12 7c-1-3-5-4-5-1.5S11 7 12 7c1 0 5 1 5-1.5S13 4 12 7"/>'],
  heart: ['red', '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>'],
  thumbsUp: ['blue', '<path d="M7 11H4v9h3z"/><path d="M7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 6.5a2.5 2.5 0 0 1-2.5 2.2H7"/>'],
  thumbsDown: ['orange', '<path d="M7 13H4V4h3z"/><path d="M7 13l4 8c1.5 0 2.5-1 2.5-2.5V15h5a2 2 0 0 0 2-2.3l-1.2-6.5A2.5 2.5 0 0 0 16.8 4H7"/>'],
  smile: ['amber', '<circle cx="12" cy="12" r="9"/><path d="M8 14a4.5 4.5 0 0 0 8 0M9 9.5v.5M15 9.5v.5"/>'],
  sad: ['sky', '<circle cx="12" cy="12" r="9"/><path d="M8 16.5a4.5 4.5 0 0 1 8 0M9 9.5v.5M15 9.5v.5"/>'],
  fire: ['orange', '<path d="M12 21c-4 0-7-2.8-7-6.5 0-3 2-5 3.5-6.5.3 2 1.3 3 2.5 3.5C11 8 12 5 14.5 3c.5 3 4.5 5.5 4.5 11 0 4-3 7-7 7z"/>'],
  bolt: ['yellow', '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>'],
  leaf: ['green', '<path d="M5 19C4 11 9 4.5 20 4c.5 11-6 16-14 15z"/><path d="M5 19 14 10"/>'],
  bookmark: ['red', '<path d="M6 3h12v18l-6-4-6 4z"/>'],
  tag: ['teal', '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>'],
  pin: ['red', '<path d="M9 3h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 13v8"/>'],
  paperclip: ['indigo', '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7"/>'],
  folder: ['amber', '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'],
  inbox: ['blue', '<path d="M3 13 6 5h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>'],
  download: ['green', '<path d="M4 17v3h16v-3"/><path d="M12 3v12M7 10l5 5 5-5"/>'],
  upload: ['blue', '<path d="M4 17v3h16v-3"/><path d="M12 15V3M7 8l5-5 5 5"/>'],
  hourglass: ['amber', '<path d="M7 3c0 5 10 5 10 9s-10 4-10 9h10c0-5-10-5-10-9s10-4 10-9z"/><path d="M6 3h12M6 21h12"/>'],
  alarm: ['red', '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M4 4.5 6.5 2.5M20 4.5l-2.5-2"/>'],
  milestone: ['purple', '<path d="M5 4h11l3 3.5-3 3.5H5z"/><path d="M5 2.5v19M3 21.5h5"/>'],
  handshake: ['orange', '<path d="M2 12l4-5 4 2 3-2 4 1 5 4-3 4"/><path d="M6 7l-2.5 7 4 4 2-1 2 2 2-1 2 1.5 3-3M10 9l-2 3 2 1 3-3"/>'],
  building: ['indigo', '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h.5M14.5 7h.5M9 11h.5M14.5 11h.5M9 15h.5M14.5 15h.5M10.5 21v-3h3v3"/>'],
  briefcase: ['brown', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18M11 12.5v2h2v-2"/>'],
  puzzle: ['green', '<path d="M5 8h3a2 2 0 1 1 4 0h3v3a2 2 0 1 1 0 4v3h-3a2 2 0 1 0-4 0H5v-3a2 2 0 1 0 0-4z"/>'],
  magnet: ['red', '<path d="M5 4h4v8a3 3 0 0 0 6 0V4h4v8a7 7 0 0 1-14 0z"/><path d="M5 8h4M15 8h4"/>'],
  megaphone: ['orange', '<path d="M3 10v4l3 .5L17 19V5L6 9.5z"/><path d="M6 14.5 7.5 20h3l-1-4.8M20 10v4"/>'],
  search: ['sky', '<circle cx="11" cy="11" r="7"/><path d="m21 21-5-5"/>'],
  filter: ['purple', '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>'],
  sparkle: ['yellow', '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'],
  crown: ['amber', '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>'],
  medal: ['amber', '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.5 5 3h4l3 6M15.5 10.5 19 3h-4l-3 6"/>'],
  hashtag: ['teal', '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>'],
  at: ['blue', '<circle cx="12" cy="12" r="4"/><path d="M16 8v5.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>'],
  calendarCheck: ['green', '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>'],
  wifi: ['sky', '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5v.5"/>'],
  truck: ['orange', '<rect x="2.5" y="6" width="11" height="10" rx="1"/><path d="M13.5 9h4l3 3.5V16h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>'],
  userPlus: ['green', '<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>'],
  plane: ['sky', '<path d="M10.5 3.5a1.5 1.5 0 0 1 3 0V9l8 5v2l-8-2.5V18l2.5 2v1.5L12 20.5l-4 1V20l2.5-2v-4.5l-8 2.5v-2l8-5z"/>'],
  music: ['pink', '<circle cx="7" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/><path d="M9.5 17.5V5.5l10-2v12"/>'],
  camera: ['cyan', '<path d="M4 7h3.5L9 5h6l1.5 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'],
  stop: ['red', '<rect x="5" y="5" width="14" height="14" rx="2"/>'],
  play: ['green', '<path d="M7 4.5v15l12-7.5z"/>'],
  pause: ['amber', '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'],
  plus: ['green', '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'],
  minus: ['red', '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'],
  arrowRight: ['blue', '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M13 9l3 3-3 3"/>'],
  arrowLeft: ['blue', '<circle cx="12" cy="12" r="9"/><path d="M16 12H8M11 9l-3 3 3 3"/>'],
  arrowUp: ['green', '<circle cx="12" cy="12" r="9"/><path d="M12 16V8M9 11l3-3 3 3"/>'],
  arrowDown: ['red', '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M9 13l3 3 3-3"/>'],
  // The start screen's backgrounds.
  bg_mindBloom: ['pink', '<circle cx="12" cy="12" r="3"/><path d="M12 9V5.5M15 12h3.5M12 15v3.5M9 12H5.5"/><circle cx="12" cy="4" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="12" cy="20" r="1.5"/><circle cx="4" cy="12" r="1.5"/>'],
  bg_fishbones: ['cyan', '<path d="M3 12h13l5-3.5v7L16 12"/><path d="M7 12 5 8M11 12 9 8M7 12l-2 4M11 12l-2 4"/>'],
  bg_treeChart: ['green', '<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v5M6 17v-5h12v5"/>'],
  bg_stickyNotes: ['amber', '<path d="M4 4h11v11H4z"/><path d="M9 15v5h8l3-3V9h-5"/><path d="M17 20v-3h3"/>'],
  bg_neurons: ['purple', '<circle cx="12" cy="12" r="3"/><path d="M12 9V4M14.6 13.5 19 17M9.4 13.5 5 17M14.6 10.5 19 8M9.4 10.5 5 8"/><circle cx="12" cy="3.5" r="1"/><circle cx="19.5" cy="17.5" r="1"/><circle cx="4.5" cy="17.5" r="1"/>'],
  bg_synapse: ['pink', '<circle cx="6" cy="12" r="3.5"/><circle cx="18" cy="12" r="3.5"/><path d="M9.5 12h1M13.5 12h1M11.6 12h.8"/>'],
  bg_ideaBubbles: ['sky', '<circle cx="10" cy="10" r="6.5"/><circle cx="17.5" cy="17" r="2.5"/><circle cx="21" cy="21" r="1"/>'],
  bg_orbits: ['indigo', '<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="4" ry="10"/>'],
  bg_blueprint: ['blue', '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'],
  bg_branches: ['green', '<path d="M12 21V11l-5-5M12 14l5-5"/><path d="M7 6V3M7 6H4M17 9h3.5M17 9V5.5"/>'],
  bg_flowRoots: ['brown', '<path d="M12 3v6"/><path d="M12 9c-4 1-6 4-7 11M12 9c0 4-1 7-2 11M12 9c1 4 3 7 4 11M12 9c4 1 6 4 7 11"/>'],
  bg_constellation: ['indigo', '<path d="m4 17 5-8 6 3 5-7"/><circle cx="4" cy="17" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="20" cy="5" r="1.5"/>'],
  bg_ripples: ['cyan', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>'],
  bg_aurora: ['teal', '<path d="M3 15c3-6 6-8 9-4s6 2 9-4"/><path d="M3 20c3-5 6-6 9-3s6 1 9-3"/>'],
  bg_honeycomb: ['amber', '<path d="M8 3.5l4 2.3v4.6l-4 2.3-4-2.3V5.8z"/><path d="M16 3.5l4 2.3v4.6l-4 2.3-4-2.3V5.8zM12 10.4l4 2.3v4.6l-4 2.3-4-2.3v-4.6z"/>'],
  bg_wordCloud: ['blue', '<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A4 4 0 0 1 17.5 18z"/><path d="M8.5 12.5h5M9.5 15h6"/>'],
  bg_sketch: ['orange', '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3M13 21h8"/>'],
  bg_globe3D: ['green', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
  bg_tree3D: ['green', '<path d="M12 3 6 11h3l-4 6h14l-4-6h3z"/><path d="M12 17v4"/>'],
  bg_tunnel3D: ['purple', '<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="8" y="8" width="8" height="8"/><path d="M3 3l5 5M21 3l-5 5M3 21l5-5M21 21l-5-5"/>'],
  bg_terrain3D: ['teal', '<path d="M2 19l6-9 4 5 3-4 7 8z"/><path d="M8 10l1.5 2.5"/>'],
  bg_cards3D: ['pink', '<rect x="4" y="7" width="11" height="14" rx="1.5"/><path d="M8 7V4.5A1.5 1.5 0 0 1 9.5 3h9A1.5 1.5 0 0 1 20 4.5v11a1.5 1.5 0 0 1-1.5 1.5H15"/>'],
  bg_starfield3D: ['yellow', '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M4 19v.5M19 4v.5M20 19v.5M5 5v.5"/>'],
  bg_lattice3D: ['indigo', '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'],
}

/** The hue and SVG body of an icon. */
export const iconOf = (name: string): [string, string] => MINE[name] ?? PATHS[name]?.[0] ?? PATHS.about[0]

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
