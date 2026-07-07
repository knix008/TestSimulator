export function getTooltipLabel(tooltip, children) {
  if (tooltip) return tooltip;
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return undefined;
}

function getVisibleChildText(children) {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children).trim();
  }
  return '';
}

function hasVisibleLabel(children) {
  if (children === undefined || children === null || children === false) return false;
  if (typeof children === 'string' || typeof children === 'number') {
    return getVisibleChildText(children).length > 0;
  }
  return true;
}

function shouldShowVisualTooltip(tooltip, children, visual) {
  if (!visual) return false;
  if (!hasVisibleLabel(children)) return true;
  if (!tooltip) return false;
  return getVisibleChildText(children) !== String(tooltip).trim();
}

export function getTooltipProps(tooltip, children, { visual = true } = {}) {
  const label = getTooltipLabel(tooltip, children);
  if (!label) return {};

  const explicitTooltip = tooltip !== undefined && tooltip !== null && tooltip !== '';
  const showVisual = visual && (
    explicitTooltip || shouldShowVisualTooltip(tooltip, children, visual)
  );

  return {
    'aria-label': label,
    ...(showVisual ? { 'data-tooltip': label, className: 'has-tooltip' } : {}),
  };
}

export function mergeTooltipClass(className = '', tooltipProps = {}) {
  const parts = [className, tooltipProps.className].filter(Boolean);
  return parts.join(' ');
}

export function getAccessibilityLabel(tooltip, children) {
  return getTooltipLabel(tooltip, children);
}
