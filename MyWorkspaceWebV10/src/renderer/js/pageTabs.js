export function createPageTabs(container, { onSelect, onClose }) {
  const tabs = new Map();

  function render() {
    container.replaceChildren();
    for (const tab of tabs.values()) {
      container.appendChild(createTabElement(tab));
    }
  }

  function createTabElement(tab) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `page-tab${tab.active ? ' is-active' : ''}`;
    button.dataset.pageId = String(tab.pageId);

    const title = document.createElement('span');
    title.textContent = tab.title;
    button.appendChild(title);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'page-tab-close';
    close.textContent = '×';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      onClose(tab.pageId);
    });
    button.appendChild(close);

    button.addEventListener('click', () => onSelect(tab.pageId));
    return button;
  }

  return {
    open(page) {
      for (const tab of tabs.values()) {
        tab.active = false;
      }

      tabs.set(page.id, {
        pageId: page.id,
        title: page.title,
        active: true,
        dirty: false
      });
      render();
    },
    setActive(pageId) {
      for (const tab of tabs.values()) {
        tab.active = tab.pageId === pageId;
      }
      render();
    },
    setTitle(pageId, title) {
      const tab = tabs.get(pageId);
      if (tab) {
        tab.title = title;
        render();
      }
    },
    setDirty(pageId, dirty) {
      const tab = tabs.get(pageId);
      if (tab) {
        tab.dirty = dirty;
        tab.title = dirty ? `${tab.title.replace(' *', '')} *` : tab.title.replace(' *', '');
        render();
      }
    },
    close(pageId) {
      tabs.delete(pageId);
      render();
    },
    getOpenIds() {
      return [...tabs.keys()];
    },
    getActiveId() {
      for (const tab of tabs.values()) {
        if (tab.active) {
          return tab.pageId;
        }
      }
      return null;
    },
    has(pageId) {
      return tabs.has(pageId);
    }
  };
}
