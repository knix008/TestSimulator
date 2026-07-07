export function IconText({ icon: Icon, children, className = '', iconClassName = '' }) {
  return (
    <span className={`icon-text ${className}`.trim()}>
      {Icon && (
        <span className={`icon-text__icon ${iconClassName}`.trim()} aria-hidden="true">
          <Icon size={16} strokeWidth={2} />
        </span>
      )}
      {children !== undefined && children !== null && children !== false && (
        <span className="icon-text__label">{children}</span>
      )}
    </span>
  );
}
