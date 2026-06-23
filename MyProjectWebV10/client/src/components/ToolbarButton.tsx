import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ToolbarIcon, type ToolbarIconName } from './ToolbarIcons';

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ToolbarIconName;
  children: ReactNode;
}

export function ToolbarButton({ icon, children, className, ...props }: ToolbarButtonProps) {
  const classes = ['toolbar-btn', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes || undefined} {...props}>
      {icon ? <ToolbarIcon name={icon} className="toolbar-btn-icon" /> : null}
      <span className="toolbar-btn-label">{children}</span>
    </button>
  );
}
