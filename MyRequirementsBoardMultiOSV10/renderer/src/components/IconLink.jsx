import { Link } from 'react-router-dom';
import { IconText } from './IconText.jsx';
import { getTooltipProps, mergeTooltipClass } from './tooltip.js';

export function IconLink({ icon, children, className = '', tooltip, ...props }) {
  const tooltipProps = getTooltipProps(tooltip, children, { forceVisual: Boolean(tooltip) });

  return (
    <Link
      className={mergeTooltipClass(`icon-link ${className}`.trim(), tooltipProps)}
      data-tooltip={tooltipProps['data-tooltip']}
      aria-label={tooltipProps['aria-label']}
      {...props}
    >
      <IconText icon={icon}>{children}</IconText>
    </Link>
  );
}
