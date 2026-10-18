// Small 24×24 stroke pictures shared by the toolbox/explorer icons (icons-uml.js)
// and the drawings (shapes-more.js): the ArchiMate 3 element icons (drawn in the
// top-right corner of an element box, as the specification shows them) and the
// device pictures of network diagram nodes. Pure data.

/** ArchiMate icon of each element name (the part of a kind after its layer). */
export const ARCHIMATE_GLYPHS = {
  actor: '<circle cx="12" cy="5" r="3"/><path d="M12 8v7M6 11h12M12 15l-5 6M12 15l5 6"/>',
  role: '<ellipse cx="7" cy="12" rx="3" ry="5"/><path d="M7 7h10a3 5 0 0 1 0 10H7"/>',
  collaboration: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  interface: '<circle cx="15" cy="12" r="5"/><path d="M2 12h8"/>',
  process: '<path d="M3 9h11V5l7 7-7 7v-4H3z"/>',
  function: '<path d="M5 9l7-6 7 6v12l-7-5-7 5z"/>',
  interaction: '<path d="M10 4a8 8 0 0 0 0 16z"/><path d="M14 4a8 8 0 0 1 0 16z"/>',
  event: '<path d="M3 6h13a6 6 0 0 1 0 12H3l4-6z"/>',
  service: '<rect x="3" y="7" width="18" height="10" rx="5"/>',
  object: '<rect x="3" y="5" width="18" height="14"/><path d="M3 9h18"/>',
  contract: '<rect x="3" y="5" width="18" height="14"/><path d="M3 9h18M3 15h18"/>',
  representation: '<path d="M3 5h18v12c-3-2-6 2-9 0s-6-2-9 0z"/>',
  product: '<rect x="3" y="5" width="18" height="14"/><path d="M3 9h9V5"/>',
  component: '<rect x="7" y="4" width="13" height="16"/><rect x="4" y="7" width="6" height="3"/><rect x="4" y="13" width="6" height="3"/>',
  'data-object': '<rect x="3" y="5" width="18" height="14"/><path d="M3 9h18M7 13h10"/>',
  node: '<path d="M3 8l4-4h14v12l-4 4H3z"/><path d="M3 8h14v12M17 8l4-4"/>',
  device: '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 20l3-4h14l3 4z"/>',
  'system-software': '<circle cx="10" cy="14" r="7"/><path d="M9 7.1A7 7 0 0 1 16.9 15"/>',
  path: '<path d="M7 12h10" stroke-dasharray="2.5 2"/><path d="M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
  'communication-network': '<path d="M7 7h12l-2 10H5z"/><circle cx="7" cy="7" r="1.5"/><circle cx="19" cy="7" r="1.5"/><circle cx="17" cy="17" r="1.5"/><circle cx="5" cy="17" r="1.5"/>',
  artifact: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  equipment: '<circle cx="9" cy="14" r="5"/><circle cx="9" cy="14" r="1.5"/><circle cx="17" cy="7" r="3"/><path d="M17 2v2M17 10v2M12 7h2M20 7h2"/>',
  facility: '<path d="M3 21V9l5 3V9l5 3V4h4v17z"/>',
  'distribution-network': '<path d="M5 9h14M5 15h14"/><path d="M7 6l-4 3 4 3M17 12l4 3-4 3"/>',
  material: '<path d="M7 4h10l5 8-5 8H7l-5-8z"/><path d="M8 7h8M5.5 12h0M8 17h8"/>',
  stakeholder: '<ellipse cx="7" cy="12" rx="3" ry="5"/><path d="M7 7h10a3 5 0 0 1 0 10H7"/>',
  driver: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  assessment: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21"/>',
  goal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  outcome: '<circle cx="11" cy="13" r="7"/><circle cx="11" cy="13" r="3.5"/><path d="M11 13l9-9M16 4h4v4"/>',
  principle: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 7v7M12 17v.5"/>',
  requirement: '<path d="M7 6h14l-4 12H3z"/>',
  constraint: '<path d="M7 6h14l-4 12H3z"/><path d="M10 6l-4 12"/>',
  meaning: '<path d="M7 18a4 4 0 0 1-.5-8 5 5 0 0 1 9.5-1.5A4 4 0 0 1 17 18z"/>',
  value: '<ellipse cx="12" cy="12" rx="9" ry="6"/>',
  resource: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M19 10h2v4h-2M7 10v4M10 10v4M13 10v4"/>',
  capability: '<path d="M3 20h18V4h-6v5H9v5H3z"/><path d="M9 14h12M15 9h6"/>',
  'value-stream': '<path d="M3 6h13l5 6-5 6H3l5-6z"/>',
  'course-of-action': '<circle cx="14" cy="10" r="6"/><circle cx="14" cy="10" r="2"/><path d="M3 21c2-6 5-8 8-8"/><path d="M8 13h3v3"/>',
  'work-package': '<path d="M19 12a7 7 0 1 1-3-5.7"/><path d="M17 3v4h-4"/>',
  deliverable: '<path d="M4 4h16v13c-3-2-5 2-8 0s-5-2-8 0z"/>',
  plateau: '<path d="M8 7h13M5 12h13M3 17h13"/>',
  gap: '<circle cx="12" cy="12" r="7"/><path d="M3 10h18M3 14h18"/>',
  location: '<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  grouping: '<path d="M3 8h18v12H3z" stroke-dasharray="3 2"/><path d="M3 8V4h8v4"/>',
  junction: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
};

/** Pictures of network diagram nodes (NWNode.device). */
export const DEVICE_GLYPHS = {
  server: '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M7.5 6.5h.01M7.5 17.5h.01M11 6.5h6M11 17.5h6"/>',
  database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
  router: '<ellipse cx="12" cy="9" rx="9" ry="4"/><path d="M3 9v6c0 2.2 4 4 9 4s9-1.8 9-4V9"/><path d="M9 7.5l-2 1.5 2 1.5M15 7.5l2 1.5-2 1.5"/>',
  switch: '<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01"/>',
  firewall: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.3h18M3 14.6h18M9 4v5.3M15 9.3v5.3M9 14.6V20"/>',
  pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1"/><path d="M2 19h20l-2-4H4z"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  storage: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 12h18M7 8.5h.01M7 15.5h.01"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 5.5 5.5 0 0 1 10.6-1.5A4.5 4.5 0 0 1 17.5 18z"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  queue: '<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 7v10M12 7v10M17 7v10"/>',
};
export const DEVICES = Object.keys(DEVICE_GLYPHS);

/** "work-package" → "WorkPackage". */
export const pascal = (text) => String(text).split(/[-_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
/** Icon name of an ArchiMate element name (amActor, amWorkPackage …). */
export const archimateIcon = (name) => `am${pascal(name)}`;
/** Icon name of a network device (nwServer …). */
export const deviceIcon = (device) => `nw${pascal(device)}`;
