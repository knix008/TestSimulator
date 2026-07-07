import { getTooltipProps, mergeTooltipClass } from './tooltip.js';

/** Host wrapper so toolbar tooltips show on hover, including disabled controls. */
export function NavTooltipHost({ tooltip, label, className = '', children }) {
  const tooltipProps = getTooltipProps(tooltip, label, { forceVisual: Boolean(tooltip) });
  if (!tooltipProps['data-tooltip']) {
    return children;
  }

  return (
    <span
      className={mergeTooltipClass(`nav-tooltip-host ${className}`.trim(), tooltipProps)}
      data-tooltip={tooltipProps['data-tooltip']}
    >
      {children}
    </span>
  );
}
