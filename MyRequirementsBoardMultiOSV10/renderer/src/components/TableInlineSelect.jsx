export default function TableInlineSelect({
  value,
  options,
  getLabel,
  onChange,
  disabled = false,
  variant = 'text',
  ariaLabel,
}) {
  if (disabled) {
    if (variant === 'badge') {
      return (
        <span className={`badge badge-${String(value || '').toLowerCase()} table-inline-select__badge-readonly`}>
          {getLabel(value)}
        </span>
      );
    }
    return <span>{getLabel(value)}</span>;
  }

  const badgeClass = variant === 'badge' ? ` table-inline-select--badge-${String(value || '').toLowerCase()}` : '';

  return (
    <select
      className={`table-inline-select table-inline-select--${variant}${badgeClass}`}
      value={value}
      aria-label={ariaLabel}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {getLabel(option)}
        </option>
      ))}
    </select>
  );
}
