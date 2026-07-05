import { createIconElement } from './icons.js';

let activeMenu = null;
let activeSubmenu = null;
let activeMenuHandlers = null;

function closeSubmenu() {
  if (activeSubmenu) {
    activeSubmenu.remove();
    activeSubmenu = null;
  }
}

function closeActiveMenu() {
  closeSubmenu();
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
  }
  activeMenuHandlers?.onClose?.();
  activeMenuHandlers = null;
}

function onDocumentMouseDown(event) {
  const inMenu = activeMenu?.contains(event.target) || activeSubmenu?.contains(event.target);
  if (!inMenu) {
    closeActiveMenu();
  }
}

function onDocumentKeyDown(event) {
  if (event.key === 'Escape') {
    closeActiveMenu();
  }
}

function positionMenu(menu, anchorElement, preferRight = true) {
  const rect = anchorElement.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = preferRight ? rect.right + 4 : rect.left - menuRect.width - 4;
  let top = rect.top;

  if (left + menuRect.width > window.innerWidth - 8) {
    left = rect.left - menuRect.width - 4;
  }
  if (left < 8) {
    left = 8;
  }
  if (top + menuRect.height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - menuRect.height - 8);
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function openSubmenu(items, anchorButton, handlers) {
  closeSubmenu();

  const submenu = document.createElement('div');
  submenu.className = 'popup-menu popup-submenu';
  submenu.setAttribute('role', 'menu');

  for (const item of items) {
    if (item.visible === false) {
      continue;
    }
    submenu.appendChild(createMenuItem(item, handlers));
  }

  document.getElementById('menu-root').appendChild(submenu);
  activeSubmenu = submenu;
  requestAnimationFrame(() => {
    positionMenu(submenu, anchorButton, true);
  });
}

function createMenuItem(item, handlers) {
  if (item.type === 'separator') {
    const separator = document.createElement('div');
    separator.className = 'popup-menu-separator';
    return separator;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'popup-menu-item';
  button.disabled = Boolean(item.disabled);
  if (item.checked) {
    button.classList.add('is-checked');
  }

  const iconSlot = document.createElement('span');
  iconSlot.className = 'popup-menu-icon';
  if (item.iconName) {
    iconSlot.appendChild(createIconElement(item.iconName, 16));
  }
  button.append(iconSlot);

  const label = document.createElement('span');
  label.className = 'popup-menu-label';
  label.textContent = item.label;
  button.append(label);

  if (item.shortcut) {
    const shortcut = document.createElement('span');
    shortcut.className = 'popup-menu-shortcut';
    shortcut.textContent = item.shortcut;
    button.appendChild(shortcut);
  }

  if (item.submenu?.length) {
    button.classList.add('has-submenu');
    const showChildMenu = () => {
      if (button.disabled) {
        return;
      }
      openSubmenu(item.submenu, button, handlers);
    };
    button.addEventListener('mouseenter', showChildMenu);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showChildMenu();
    });
    return button;
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (button.disabled) {
      return;
    }
    const action = handlers?.onAction;
    closeActiveMenu();
    action?.(item.id, item);
  });

  return button;
}

export function showPopupMenu(items, anchorElement, handlers = {}) {
  closeActiveMenu();

  const menu = document.createElement('div');
  menu.className = 'popup-menu';
  menu.setAttribute('role', 'menu');

  for (const item of items) {
    if (item.visible === false) {
      continue;
    }
    menu.appendChild(createMenuItem(item, handlers));
  }

  document.getElementById('menu-root').appendChild(menu);
  activeMenu = menu;
  activeMenuHandlers = handlers;
  requestAnimationFrame(() => {
    positionMenu(menu, anchorElement, true);
  });

  document.addEventListener('mousedown', onDocumentMouseDown, true);
  document.addEventListener('keydown', onDocumentKeyDown, true);
  handlers.onOpen?.();
  return menu;
}

export function showPopupMenuAtPoint(items, x, y, handlers = {}) {
  const anchor = document.createElement('span');
  anchor.style.position = 'fixed';
  anchor.style.left = `${x}px`;
  anchor.style.top = `${y}px`;
  anchor.style.width = '0';
  anchor.style.height = '0';
  anchor.style.pointerEvents = 'none';
  document.body.appendChild(anchor);

  const wrappedHandlers = {
    ...handlers,
    onClose: () => {
      anchor.remove();
      handlers.onClose?.();
    }
  };

  return showPopupMenu(items, anchor, wrappedHandlers);
}

export function closePopupMenu() {
  closeActiveMenu();
}
