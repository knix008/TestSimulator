// Icons of the standard parts library, routing and rendering (24×24, stroke = currentColor, the style of
// icons-cad.js).
export const ICONS_STD = {
  // ── library and fasteners
  stdLibrary: '<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M9 9V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M3 13h18"/><path d="M7 13v2M17 13v2"/>',
  smartFastener: '<path d="M8 3h8l-1 3H9z"/><path d="M10 6v9l2 2 2-2V6"/><path d="M4 12h3M17 12h3" opacity="0.6"/><path d="M5 20l2-2M19 20l-2-2" stroke-width="1.4"/><circle cx="12" cy="21" r="1" fill="currentColor"/>',
  hexBolt: '<path d="M6 3h12l-1.5 4h-9z"/><path d="M9.5 7v13h5V7"/><path d="M9.5 10h5M9.5 13h5M9.5 16h5" opacity="0.55"/>',
  socketCap: '<rect x="6.5" y="3" width="11" height="5" rx="1.2"/><path d="M10.5 4.5h3l.8 1-.8 1h-3l-.8-1z" opacity="0.7"/><path d="M9.5 8v12h5V8"/><path d="M9.5 11h5M9.5 14h5M9.5 17h5" opacity="0.55"/>',
  hexNut: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3.6"/><path d="M12 8.4v-1M12 16.6v-1" opacity="0.4"/>',
  flatWasher: '<ellipse cx="12" cy="11" rx="9" ry="5"/><ellipse cx="12" cy="11" rx="3.5" ry="1.8"/><path d="M3 11v2c0 2.8 4 5 9 5s9-2.2 9-5v-2"/>',
  springWasher: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 4v4M14.5 4.4l-1.6 3.9" stroke-width="2.2"/>',
  ballBearing: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="5.8" r="1.6"/><circle cx="17.4" cy="9" r="1.6"/><circle cx="17.4" cy="15" r="1.6"/><circle cx="12" cy="18.2" r="1.6"/><circle cx="6.6" cy="15" r="1.6"/><circle cx="6.6" cy="9" r="1.6"/>',
  dowelPin: '<path d="M9 3.5h6l1 1.5v14l-1 1.5H9l-1-1.5V5z"/><path d="M8 6h8M8 18h8" opacity="0.5"/>',
  retainingRing: '<path d="M10 4.3A8 8 0 1 0 14 4.3"/><path d="M13.5 8A4.6 4.6 0 1 1 10.5 8" opacity="0.6"/><circle cx="9" cy="5.6" r="1.7"/><circle cx="15" cy="5.6" r="1.7"/>',
  parallelKey: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M7 8v8M17 8v8" opacity="0.4"/><path d="M3 19h18" opacity="0.5"/>',
  spurGear: '<path d="M10.5 2.5h3l.5 2.6 2.2.9 2.2-1.5 2.1 2.1-1.5 2.2.9 2.2 2.6.5v3l-2.6.5-.9 2.2 1.5 2.2-2.1 2.1-2.2-1.5-2.2.9-.5 2.6h-3l-.5-2.6-2.2-.9-2.2 1.5-2.1-2.1 1.5-2.2-.9-2.2-2.6-.5v-3l2.6-.5.9-2.2L4.7 6.6l2.1-2.1L9 6l2.2-.9z"/><circle cx="12" cy="12" r="3"/>',
  // ── pipe fittings
  pipeElbow: '<path d="M4 21V12a8 8 0 0 1 8-8h9"/><path d="M9 21v-9a3 3 0 0 1 3-3h9"/><path d="M3 21h7M21 3v7" stroke-width="2.2"/>',
  pipeElbow45: '<path d="M5 21v-7l9-9 3 0"/><path d="M10 21v-5l7-7" /><path d="M4 21h7M15 3l4 4" stroke-width="2.2"/>',
  pipeTee: '<path d="M2 8h20M2 16h20"/><path d="M9 16v6M15 16v6"/><path d="M2 6v12M22 6v12M7 22h10" stroke-width="2.2"/>',
  pipeFlange: '<rect x="3" y="4" width="5" height="16" rx="1"/><path d="M8 8h12M8 16h12"/><circle cx="5.5" cy="7" r="0.9" fill="currentColor"/><circle cx="5.5" cy="17" r="0.9" fill="currentColor"/>',
  pipeBend: '<path d="M4 20v-6a8 8 0 0 1 8-8h8" stroke-width="3.2" opacity="0.35"/><path d="M4 20v-6a8 8 0 0 1 8-8h8"/><path d="M8 14a4 4 0 0 1 4-4" stroke-dasharray="1.5 1.5"/>',
  // ── routing
  pipeRoute: '<path d="M3 20h5a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3h7" stroke-width="3.4" opacity="0.3"/><path d="M3 20h5a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3h7"/><circle cx="3" cy="20" r="1.4" fill="currentColor"/><circle cx="21" cy="5" r="1.4" fill="currentColor"/>',
  tubeRoute: '<path d="M3 18c4 0 4-6 8-6s4-6 10-6" stroke-width="2.8" opacity="0.3"/><path d="M3 18c4 0 4-6 8-6s4-6 10-6"/><path d="M3 15v6M21 3v6" opacity="0.6"/>',
  cableRoute: '<path d="M3 6c5 0 4 6 9 6s4 6 9 6" stroke-width="2.6"/><rect x="1.5" y="4" width="3" height="4" rx="0.8"/><rect x="19.5" y="16" width="3" height="4" rx="0.8"/>',
  // ── rendering
  renderView: '<circle cx="12" cy="11" r="6.5"/><path d="M8.5 8.5a4.5 4.5 0 0 1 4-2" stroke-width="2"/><ellipse cx="12" cy="20" rx="7" ry="1.6" opacity="0.5"/><path d="M19.5 3.5l1 1M21 7h1" opacity="0.6"/>',
  renderSave: '<rect x="3" y="3" width="13" height="11" rx="1.5"/><circle cx="9.5" cy="8.5" r="3"/><path d="M14 17v4M11.5 19l2.5 2.5 2.5-2.5M19 10v11" />',
  environment: '<path d="M2 15h20"/><path d="M4 15a8 8 0 0 1 16 0" opacity="0.6"/><circle cx="16" cy="8" r="2.2"/><path d="M5 19h14M8 22h8" opacity="0.5"/>',
  groundShadow: '<rect x="7" y="4" width="10" height="9" rx="1"/><ellipse cx="12" cy="18" rx="8" ry="2.5" fill="currentColor" opacity="0.3"/><path d="M4 18h16" opacity="0.5"/>',
  depthOfField: '<circle cx="5" cy="12" r="2.5" opacity="0.45"/><circle cx="12" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5" opacity="0.45"/><path d="M12 4v3M12 17v3"/><path d="M2 6l3 1M22 6l-3 1" opacity="0.4"/>',
  resolution: '<rect x="3" y="5" width="18" height="13" rx="1.5"/><path d="M7 9h3M7 9v3M17 14h-3M17 14v-3"/><path d="M9 21h6" opacity="0.5"/>',
};
