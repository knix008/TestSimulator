import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconText } from './IconText.jsx';
import { getTooltipProps, mergeTooltipClass } from './tooltip.js';

function measureDropdownStyle(triggerEl) {
  if (!triggerEl) return null;

  const rect = triggerEl.getBoundingClientRect();
  return {
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
  };
}

export function MenuDropdown({ labelKey, icon: Icon, items, showChevron = true }) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const menuRef = useRef(null);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const { t } = useLanguage();
  const label = t(labelKey);

  const updateDropdownPosition = () => {
    setDropdownStyle(measureDropdownStyle(triggerRef.current));
  };

  useLayoutEffect(() => {
    if (!open) {
      setDropdownStyle(null);
      return undefined;
    }

    updateDropdownPosition();

    const handleRelayout = () => updateDropdownPosition();
    window.addEventListener('resize', handleRelayout);
    window.addEventListener('scroll', handleRelayout, true);

    return () => {
      window.removeEventListener('resize', handleRelayout);
      window.removeEventListener('scroll', handleRelayout, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const close = (e) => {
      const target = e.target;
      if (menuRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
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
        ref={triggerRef}
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
      {open && dropdownStyle && createPortal(
        <ul ref={dropdownRef} className="app-menu__dropdown" role="menu" style={dropdownStyle}>
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
        </ul>,
        document.body,
      )}
    </div>
  );
}
