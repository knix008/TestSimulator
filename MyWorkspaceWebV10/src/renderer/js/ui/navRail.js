import { setButtonIcon } from './icons.js';
import { showPopupMenu, closePopupMenu } from './popupMenu.js';

function getVisibleItems(items = []) {
  return items.filter((item) => item.visible !== false && item.type !== 'separator');
}

function tryActivateSingleLeafMenu(items = []) {
  let singleLeaf = null;
  let leafCount = 0;

  for (const item of getVisibleItems(items)) {
    if (item.submenu?.length) {
      return null;
    }
    singleLeaf = item;
    leafCount += 1;
    if (leafCount > 1) {
      return null;
    }
  }

  return leafCount === 1 ? singleLeaf : null;
}

export function createNavRail(container, entries, { onAction }) {
  const main = document.createElement('div');
  main.className = 'nav-rail-main';
  const bottom = document.createElement('div');
  bottom.className = 'nav-rail-bottom';
  container.replaceChildren(main, bottom);

  const buttons = new Map();
  const entryById = new Map();

  function addEntry(target, entry) {
    entryById.set(entry.id, entry);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-rail-btn';
    button.title = entry.tooltip;
    button.dataset.menuId = entry.id;
    setButtonIcon(button, entry.icon, 24);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const currentEntry = entryById.get(entry.id) || entry;

      if (!currentEntry.items?.length) {
        closePopupMenu();
        onAction(currentEntry.id, currentEntry.id);
        return;
      }

      const singleLeaf = tryActivateSingleLeafMenu(currentEntry.items);
      if (singleLeaf) {
        closePopupMenu();
        button.setAttribute('aria-expanded', 'false');
        onAction(currentEntry.id, singleLeaf.id);
        return;
      }

      closePopupMenu();
      showPopupMenu(currentEntry.items, button, {
        onAction: (actionId) => onAction(currentEntry.id, actionId),
        onClose: () => button.setAttribute('aria-expanded', 'false'),
        onOpen: () => button.setAttribute('aria-expanded', 'true')
      });
    });
    target.appendChild(button);
    buttons.set(entry.id, button);
  }

  function syncSection(target, items) {
    for (const entry of items) {
      entryById.set(entry.id, entry);
      let button = buttons.get(entry.id);
      if (!button) {
        addEntry(target, entry);
        button = buttons.get(entry.id);
      } else {
        target.appendChild(button);
        button.title = entry.tooltip;
      }
    }
  }

  for (const entry of entries.main) {
    addEntry(main, entry);
  }
  for (const entry of entries.bottom) {
    addEntry(bottom, entry);
  }

    return {
    setVisible(menuId, visible) {
      const button = buttons.get(menuId);
      if (button) {
        button.classList.toggle('hidden', !visible);
      }
    },
    setPressed(menuId, pressed) {
      const button = buttons.get(menuId);
      if (button) {
        button.classList.toggle('is-pressed', pressed);
      }
    },
    setBadge(menuId, count) {
      const button = buttons.get(menuId);
      if (!button) {
        return;
      }

      let badge = button.querySelector('.nav-rail-badge');
      const normalized = Number.parseInt(String(count ?? ''), 10);
      if (Number.isFinite(normalized) && normalized > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-rail-badge';
          button.appendChild(badge);
        }
        badge.classList.remove('is-dot');
        badge.textContent = normalized > 99 ? '99+' : String(normalized);
      } else if (badge) {
        badge.remove();
      }
    },
    setNotificationBadge(menuId, { unread = 0, total = 0 } = {}) {
      const button = buttons.get(menuId);
      if (!button) {
        return;
      }

      const unreadCount = Number.parseInt(String(unread ?? ''), 10) || 0;
      const totalCount = Number.parseInt(String(total ?? ''), 10) || 0;
      const hasHistory = totalCount > 0;
      const hasUnread = unreadCount > 0;

      button.classList.toggle('has-notification-history', hasHistory);
      button.classList.toggle('has-unread-notifications', hasUnread);
      button.setAttribute('aria-label', hasUnread
        ? `${button.title} (${unreadCount})`
        : hasHistory
          ? `${button.title} (${totalCount})`
          : button.title || '');

      let badge = button.querySelector('.nav-rail-badge');
      if (!hasHistory) {
        badge?.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-rail-badge';
        button.appendChild(badge);
      }

      if (hasUnread) {
        badge.classList.remove('is-dot');
        badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        badge.removeAttribute('aria-hidden');
      } else {
        badge.classList.add('is-dot');
        badge.textContent = '';
        badge.setAttribute('aria-hidden', 'true');
      }
    },
    updateEntries(entries) {
      syncSection(main, entries.main);
      syncSection(bottom, entries.bottom);
    }
  };
}
