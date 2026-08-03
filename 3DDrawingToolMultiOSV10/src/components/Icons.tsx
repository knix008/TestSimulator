import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function IconSelect(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 3l5.5 16 2.2-6.3L19 10.5 5 3z" />
    </svg>
  );
}

export function IconMove(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3v18M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5M7 17l5 4 5-4M7 7l5-4 5 4" />
    </svg>
  );
}

export function IconRotate(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

export function IconScale(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 14v6h6M20 10V4h-6M14 4l6 6M10 20l-6-6" />
    </svg>
  );
}

export function IconBox(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </svg>
  );
}

export function IconSphere(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="3.5" ry="8" />
      <path d="M4.5 12h15" />
    </svg>
  );
}

export function IconCylinder(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <ellipse cx="12" cy="6" rx="6" ry="2.5" />
      <path d="M6 6v12c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6" />
    </svg>
  );
}

export function IconCone(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l8 16H4L12 3z" />
      <ellipse cx="12" cy="19" rx="8" ry="2" />
    </svg>
  );
}

export function IconTorus(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <ellipse cx="12" cy="12" rx="8" ry="4.5" />
      <ellipse cx="12" cy="12" rx="4" ry="2.2" />
    </svg>
  );
}

export function IconPlane(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 16l8-10 8 10H4z" />
      <path d="M4 16h16" />
    </svg>
  );
}

export function IconCapsule(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M8 7a4 4 0 0 1 8 0v10a4 4 0 0 1-8 0V7z" />
      <path d="M8 12h8" />
    </svg>
  );
}

export function IconPyramid(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l9 17H3L12 3z" />
      <path d="M12 3v17" />
    </svg>
  );
}

export function IconDodecahedron(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l7 4v6l-3 5H8l-3-5V7l7-4z" />
      <path d="M12 3v6l7 1M12 9L5 10M8 18l4-3 4 3" />
    </svg>
  );
}

export function IconIcosahedron(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l8 6-3 10H7L4 9l8-6z" />
      <path d="M12 3v18M4 9h16M7 19l5-7 5 7" />
    </svg>
  );
}

export function IconOctahedron(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 2l8 10-8 10L4 12 12 2z" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function IconTetrahedron(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 4l8 14H4L12 4z" />
      <path d="M12 4l-2 14M12 4l2 14" />
    </svg>
  );
}

export function IconTorusKnot(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M8 8c2-3 6-3 8 0s1 7-2 9-7 1-9-2 0-6 3-7 6 0 7 3" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

export function IconRing(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

export function IconText(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 5h14M12 5v14M9 19h6" />
      <path d="M5 8V5h14v3" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M8 10l4 4 4-4" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 12h16M12 4v16" />
    </svg>
  );
}

export function IconAxes(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 20V4" stroke="#5cff8a" />
      <path d="M4 16l16-8" stroke="#ff5c5c" />
      <path d="M20 16L4 8" stroke="#5c9cff" />
    </svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4" />
    </svg>
  );
}

export function IconLight(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 1 3.5 10.8c-.7.5-1.1 1.2-1.2 2.2h-4.6c-.1-1-.5-1.7-1.2-2.2A6 6 0 0 1 12 3z" />
    </svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M18 14.5A7.5 7.5 0 1 1 9.5 6 6 6 0 0 0 18 14.5z" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7h.01" />
    </svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

export function IconSave(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 3h12l4 4v14H5V3z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </svg>
  );
}

export function IconNew(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 3h7l5 5v13H7V3z" />
      <path d="M14 3v5h5M12 12v6M9 15h6" />
    </svg>
  );
}

export function IconDuplicate(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="8" y="8" width="11" height="11" rx="1.5" />
      <path d="M5 16V5.5A1.5 1.5 0 0 1 6.5 4H16" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  );
}

export function IconLang(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9S14.5 18.2 12 21c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z" />
    </svg>
  );
}

export function IconImport(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3v11" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function IconTemplate(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <path d="M14 16h6M17 13v6" />
    </svg>
  );
}

export function IconExportImage(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15l4.5-4.5L12 15l3-3 6 6" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="M16 3v6M13 6h6" />
    </svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 14H4v-5" />
      <path d="M4 9a9 9 0 1 1 3.2 6.9" />
    </svg>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M15 14h5v-5" />
      <path d="M20 9a9 9 0 1 0-3.2 6.9" />
    </svg>
  );
}
