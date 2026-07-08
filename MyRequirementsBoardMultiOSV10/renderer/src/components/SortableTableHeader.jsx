import { ChevronDown, ChevronUp } from 'lucide-react';

export default function SortableTableHeader({
  columnId,
  label,
  sortable = true,
  sort,
  onSort,
  className = '',
  children = null,
  title,
}) {
  if (!sortable) {
    return (
      <th className={className}>
        {label}
        {children}
      </th>
    );
  }

  const isActive = sort?.columnId === columnId;
  const direction = isActive ? sort.direction : null;
  const ariaSort = direction === 'asc'
    ? 'ascending'
    : direction === 'desc'
      ? 'descending'
      : 'none';

  const handleClick = () => {
    onSort?.(columnId);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSort?.(columnId);
    }
  };

  return (
    <th
      className={`table-sortable${isActive ? ' table-sortable--active' : ''}${className ? ` ${className}` : ''}`}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className="table-sort-header"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        title={title}
        aria-label={title || label}
      >
        <span className="table-sort-header__label">{label}</span>
        <span className={`table-sort-indicator${isActive ? ' is-active' : ''}`} aria-hidden="true">
          {direction === 'asc' && <ChevronUp size={14} strokeWidth={2.25} />}
          {direction === 'desc' && <ChevronDown size={14} strokeWidth={2.25} />}
          {!direction && <ChevronUp size={14} strokeWidth={2.25} className="table-sort-indicator__idle" />}
        </span>
      </button>
      {children}
    </th>
  );
}
