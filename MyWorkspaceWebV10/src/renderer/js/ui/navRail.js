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
    updateEntries(entries) {
      for (const entry of [...entries.main, ...entries.bottom]) {
        entryById.set(entry.id, entry);
        const button = buttons.get(entry.id);
        if (button) {
          button.title = entry.tooltip;
        }
      }
    }
  };
}
