import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconText } from './IconText.jsx';
import { getTooltipProps, mergeTooltipClass } from './tooltip.js';

export function MenuDropdown({ labelKey, icon: Icon, items, showChevron = true }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const { t } = useLanguage();
  const label = t(labelKey);

  useEffect(() => {
    if (!open) return undefined;

    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };

    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', close);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousedown', close);
    };
  }, [open]);

  return (
    <div className="app-menu" ref={menuRef}>
      <button
        type="button"
        className={`app-menu__trigger${showChevron ? '' : ' app-menu__trigger--plain'}`}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {Icon ? <IconText icon={Icon}>{label}</IconText> : <span>{label}</span>}
        {showChevron && <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />}
      </button>
      {open && (
        <ul className="app-menu__dropdown" role="menu">
          {items.map((item) => {
            if (item.type === 'separator') {
              return <li key={item.id} role="separator" className="app-menu__separator" />;
            }

            const itemLabel = t(item.labelKey);
            const itemTooltipProps = getTooltipProps(
              item.tooltipKey ? t(item.tooltipKey) : undefined,
              itemLabel,
            );

            return (
              <li key={item.id} role="none">
                <button
                  type="button"
                  className={mergeTooltipClass('app-menu__item', itemTooltipProps)}
                  role="menuitem"
                  disabled={item.disabled}
                  aria-label={itemTooltipProps['aria-label'] || itemLabel}
                  data-tooltip={itemTooltipProps['data-tooltip']}
                  onClick={() => {
                    if (item.disabled) return;
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {item.icon ? (
                    <IconText icon={item.icon}>{itemLabel}</IconText>
                  ) : (
                    itemLabel
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
