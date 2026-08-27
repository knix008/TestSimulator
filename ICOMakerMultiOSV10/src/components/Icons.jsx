// Minimal stroke icons (24x24) for the toolbar and panels.
import React from 'react';

const S = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

// Open Image: a picture/photo frame (distinct from the folder glyph below).
export const OpenIcon = (p) => (<S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.6" /><path d="M21 16l-5-5-6 6-3-3-4 4" /></S>);
// Open Folder: an opened folder with a lifted flap.
export const FolderIcon = (p) => (<S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2H3z" /><path d="M3 9h18l-1.5 9a1 1 0 0 1-1 .8H5.5a1 1 0 0 1-1-.8z" /></S>);
export const ZoomInIcon = (p) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></S>);
export const ZoomOutIcon = (p) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></S>);
export const FitIcon = (p) => (<S {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" /></S>);
export const ActualIcon = (p) => (<S {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" /></S>);
export const RotateIcon = (p) => (<S {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></S>);
export const ThemeIcon = (p) => (<S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>);
export const LangIcon = (p) => (<S {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></S>);
export const ExportIcon = (p) => (<S {...p}><path d="M12 3v12M8 7l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></S>);
export const AboutIcon = (p) => (<S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></S>);
export const HomeIcon = (p) => (<S {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></S>);
export const UpIcon = (p) => (<S {...p}><path d="M12 19V5M5 12l7-7 7 7" /></S>);
export const RefreshIcon = (p) => (<S {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" /></S>);
export const ImageIcon = (p) => (<S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></S>);
export const CloseIcon = (p) => (<S {...p}><path d="M18 6L6 18M6 6l12 12" /></S>);
export const CopyIcon = (p) => (<S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></S>);
export const FlipIcon = (p) => (<S {...p}><path d="M12 3v18M7 8l-4 4 4 4M17 8l4 4-4 4" /></S>);
export const ResetIcon = (p) => (<S {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></S>);

// Drawing tools
export const CursorIcon = (p) => (<S {...p}><path d="M5 3l7 17 2.5-6.5L21 11z" /></S>);
export const SquareIcon = (p) => (<S {...p}><rect x="4" y="4" width="16" height="16" rx="3" /></S>);
export const CircleShapeIcon = (p) => (<S {...p}><circle cx="12" cy="12" r="8.5" /></S>);
export const LineIcon = (p) => (<S {...p}><path d="M5 19L19 5" /><circle cx="5" cy="19" r="1.6" /><circle cx="19" cy="5" r="1.6" /></S>);
export const PenIcon = (p) => (<S {...p}><path d="M4 20c4-1 5-2 7-6M12 14l4.5-8.5a2 2 0 0 1 3.5 2L11.5 16" /></S>);
export const TextIcon = (p) => (<S {...p}><path d="M5 6h14M12 6v13M9 19h6" /></S>);

// Z-order
export const BringFrontIcon = (p) => (<S {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V4h12" /></S>);
export const SendBackIcon = (p) => (<S {...p}><rect x="4" y="4" width="12" height="12" rx="2" /><path d="M20 8v12H8" /></S>);
export const ForwardIcon = (p) => (<S {...p}><path d="M12 5v14M6 11l6-6 6 6" /></S>);
export const BackwardIcon = (p) => (<S {...p}><path d="M12 19V5M6 13l6 6 6-6" /></S>);

// Object ops
export const DuplicateIcon = (p) => (<S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></S>);
export const TrashIcon = (p) => (<S {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></S>);
export const LayersIcon = (p) => (<S {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></S>);
export const FxIcon = (p) => (<S {...p}><path d="M5 3v18M5 3h9M5 12h7" /><circle cx="17" cy="16" r="4" /></S>);
export const CubeIcon = (p) => (<S {...p}><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M12 12l9-5M12 12v10M12 12L3 7" /></S>);
export const ImportIcon = (p) => (<S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v6M9 11l3 3 3-3" /></S>);

// More 2D shapes
export const TriangleIcon = (p) => (<S {...p}><path d="M12 4l8 15H4z" /></S>);
export const DiamondIcon = (p) => (<S {...p}><path d="M12 3l8 9-8 9-8-9z" /></S>);
export const StarIcon = (p) => (<S {...p}><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z" /></S>);
export const PentagonIcon = (p) => (<S {...p}><path d="M12 3l9 6.6-3.5 10.4H6.5L3 9.6z" /></S>);
export const HexagonIcon = (p) => (<S {...p}><path d="M7 4h10l4 8-4 8H7l-4-8z" /></S>);
export const ArrowShapeIcon = (p) => (<S {...p}><path d="M3 9h9V5l7 7-7 7v-4H3z" /></S>);
export const HeartIcon = (p) => (<S {...p}><path d="M12 20S3.5 14.6 3.5 9.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8.5 2.2C20.5 14.6 12 20 12 20z" /></S>);

export const RightTriangleIcon = (p) => (<S {...p}><path d="M5 4v15h15z" /></S>);
export const TrapezoidIcon = (p) => (<S {...p}><path d="M7 5h10l4 14H3z" /></S>);
export const ParallelogramIcon = (p) => (<S {...p}><path d="M8 5h13l-5 14H3z" /></S>);
export const OctagonIcon = (p) => (<S {...p}><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /></S>);
export const PlusShapeIcon = (p) => (<S {...p}><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></S>);
export const ChevronShapeIcon = (p) => (<S {...p}><path d="M4 4h9l7 8-7 8H4l6-8z" /></S>);
export const BoltIcon = (p) => (<S {...p}><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></S>);
export const MoonIcon = (p) => (<S {...p}><path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" /></S>);
export const CloudIcon = (p) => (<S {...p}><path d="M6 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1.5A4.2 4.2 0 0 1 17 18z" /></S>);
export const RingIcon = (p) => (<S {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.2" /></S>);
export const GearIcon = (p) => (<S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></S>);

// Solid (pseudo-3D) shapes
export const CylinderIcon = (p) => (<S {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /></S>);
export const SphereIcon = (p) => (<S {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" /></S>);
export const ConeIcon = (p) => (<S {...p}><path d="M12 3l6.5 14M12 3L5.5 17" /><ellipse cx="12" cy="17.5" rx="6.5" ry="2.5" /></S>);
export const PyramidIcon = (p) => (<S {...p}><path d="M12 3l9 16H3z" /><path d="M12 3v16M3 19l9-4 9 4" /></S>);

// Window controls (frameless)
export const MinimizeIcon = (p) => (<S {...p}><path d="M5 12h14" /></S>);
export const MaximizeIcon = (p) => (<S {...p}><rect x="5" y="5" width="14" height="14" rx="1.5" /></S>);
export const RestoreIcon = (p) => (<S {...p}><rect x="8" y="4" width="12" height="12" rx="1.5" /><path d="M16 20H6a2 2 0 0 1-2-2V8" /></S>);
