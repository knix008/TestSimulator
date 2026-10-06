/** Toolbar and menu icons, drawn inline so no icon font or image files are needed. */

const PATHS: Record<string, string> = {
  repo: "M3 3h10l2 2v14H3zM6 3v6h7",
  refresh: "M17 10a7 7 0 1 1-2.1-5M17 3v4h-4",
  branch: "M6 4v9a3 3 0 0 0 3 3h3M6 4a2 2 0 1 0 0 0zM15 13a2 2 0 1 0 0 0zM15 4a2 2 0 1 0 0 0zM15 6v2a3 3 0 0 1-3 3H9",
  openLeft: "M11 4H4v12h12v-7M9 9 3 3M3 7V3h4",
  openRight: "M9 4h7v12H4v-7M11 9l6-6M17 7V3h-4",
  reload: "M4 10a6 6 0 0 1 10-4.5M16 10a6 6 0 0 1-10 4.5M14 3v3h-3M6 17v-3h3",
  prev: "M10 16V4M5 9l5-5 5 5",
  next: "M10 4v12M5 11l5 5 5-5",
  wrap: "M3 5h14M3 10h9a3 3 0 1 1 0 6H9M11 13l-2 3 2 3",
  highlight: "M4 14l6-10 6 10M7 11h6M3 17h14",
  font: "M4 16l5-12 5 12M6 12h6M15 16h2",
  info: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM10 9v5M10 6h.01",
  settings: "M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2v2M10 16v2M4 10H2M18 10h-2M5 5 3.5 3.5M16.5 16.5 15 15M15 5l1.5-1.5M3.5 16.5 5 15",
  folder: "M2 5h5l2 2h9v9H2z",
  file: "M5 2h7l3 3v13H5zM12 2v4h3",
  dirCompare: "M2 4h6l1 2h3v8H2zM12 6h6v10h-8",
  fileCompare: "M3 3h6v14H3zM11 3h6v14h-6M6 7h0M14 7h0",
  git: "M10 2 2 10l8 8 8-8zM10 7v6M8 10h4",
  theme: "M10 2a8 8 0 1 0 0 16V2z",
  close: "M5 5l10 10M15 5 5 15",
  copy: "M7 7h9v9H7zM4 13V4h9",
  plug: "M7 3v5M13 3v5M5 8h10v3a5 5 0 0 1-10 0zM10 16v3",
  check: "M4 11l4 4 8-9",
  up: "M10 15V5M5 10l5-5 5 5",
  search: "M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3zM13.5 13.5 17 17",
  text: "M4 5h12M4 9h12M4 13h8",
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  const path = PATHS[name] ?? PATHS.file;
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
