import type { ComponentType, ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconNewProject(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4 1h8l4 4v14H4V1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 1v4h4M6 9h8M6 12h8M6 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M2 7V4h3M18 13v3h-3M4.5 15A6.5 6.5 0 0 0 15 6.5M15.5 5A6.5 6.5 0 0 0 5 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2" y="3" width="7" height="14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 5h4M12 9h4M12 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconToday(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2" y="4" width="16" height="14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 8h16M6 2v4M14 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="9" y="10" width="4" height="5" stroke="#ff8a80" strokeWidth="1.5" />
    </IconBase>
  );
}

export function IconCriticalPath(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="1" y="2" width="6" height="4" fill="#e53935" />
      <path d="M7 4h3l2 0" stroke="#e53935" strokeWidth="1.5" />
      <path d="M10 3l2 1-2 1z" fill="#e53935" />
      <rect x="12" y="2" width="6" height="4" fill="#e53935" />
      <path d="M18 1v6" stroke="#e53935" strokeWidth="1.5" />
      <rect x="1" y="11" width="4" height="3" fill="currentColor" fillOpacity="0.55" />
      <path d="M5 12.5h3" stroke="currentColor" strokeWidth="1" strokeOpacity="0.55" />
      <rect x="10" y="11" width="7" height="3" fill="currentColor" fillOpacity="0.55" />
    </IconBase>
  );
}

export function IconSave(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2" y="2" width="16" height="16" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="2" width="9" height="6" fill="currentColor" fillOpacity="0.35" />
      <rect x="5" y="11" width="10" height="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4v3" stroke="currentColor" strokeWidth="1.5" />
    </IconBase>
  );
}

export function IconAddTask(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconAddSubtask(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 5h11M9 9h8M9 13h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 9h4M5 7v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconDelete(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6h12v12H4V6zM7 4h6M2 6h16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 10v5M10 10v5M13 10v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconIndent(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2 5h16M10 10h8M10 15h8M8 5v5h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 7l5 3-5 3z" fill="currentColor" />
    </IconBase>
  );
}

export function IconOutdent(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2 5h16M2 10h10M2 15h10M8 10V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 7l-5 3 5 3z" fill="currentColor" />
    </IconBase>
  );
}

export function IconLink(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="4" cy="10" r="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16" cy="10" r="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 10h8M13 7l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

export function IconDatabase(props: IconProps) {
  return (
    <IconBase {...props}>
      <ellipse cx="10" cy="5.5" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 5.5v8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-8" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="10" cy="13.5" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.5" />
    </IconBase>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 17c0-3 2.2-5 5-5s5 2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 17c0-2.2 1.5-4 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconAccount(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 3H4v14h4M13 14l4-4-4-4M11 10h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

export type ToolbarIconName =
  | 'newProject'
  | 'refresh'
  | 'settings'
  | 'today'
  | 'criticalPath'
  | 'save'
  | 'addTask'
  | 'addSubtask'
  | 'deleteTask'
  | 'indent'
  | 'outdent'
  | 'link'
  | 'database'
  | 'users'
  | 'account'
  | 'logout';

const ICONS: Record<ToolbarIconName, ComponentType<IconProps>> = {
  newProject: IconNewProject,
  refresh: IconRefresh,
  settings: IconSettings,
  today: IconToday,
  criticalPath: IconCriticalPath,
  save: IconSave,
  addTask: IconAddTask,
  addSubtask: IconAddSubtask,
  deleteTask: IconDelete,
  indent: IconIndent,
  outdent: IconOutdent,
  link: IconLink,
  database: IconDatabase,
  users: IconUsers,
  account: IconAccount,
  logout: IconLogout,
};

export function ToolbarIcon({ name, className }: { name: ToolbarIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}
