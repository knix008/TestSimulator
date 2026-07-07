import { IconText } from './IconText.jsx';
import { getTooltipProps, mergeTooltipClass } from './tooltip.js';

export function IconButton({
  icon,
  children,
  className = '',
  type = 'button',
  iconClassName = '',
  tooltip,
  ...props
}) {
  const tooltipProps = getTooltipProps(tooltip, children);

  return (
    <button
      type={type}
      className={mergeTooltipClass(`btn icon-btn ${className}`.trim(), tooltipProps)}
      data-tooltip={tooltipProps['data-tooltip']}
      aria-label={tooltipProps['aria-label']}
      {...props}
    >
      <IconText icon={icon} iconClassName={iconClassName}>{children}</IconText>
    </button>
  );
}
