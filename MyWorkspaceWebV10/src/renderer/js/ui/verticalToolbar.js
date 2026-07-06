import { setButtonIcon } from './icons.js';
import { showPopupMenu } from './popupMenu.js';

const TOOLBAR_ITEMS = [
  { id: 'undo', icon: 'undo', titleKey: 'toolbarUndo', command: 'undo' },
  { id: 'redo', icon: 'redo', titleKey: 'toolbarRedo', command: 'redo' },
  { id: 'h1', icon: 'h1', titleKey: 'toolbarHeading1', command: 'heading', level: 1 },
  { id: 'h2', icon: 'h2', titleKey: 'toolbarHeading2', command: 'heading', level: 2 },
  { id: 'h3', icon: 'h3', titleKey: 'toolbarHeading3', command: 'heading', level: 3 },
  { id: 'h4', icon: 'h4', titleKey: 'toolbarHeading4', command: 'heading', level: 4 },
  { id: 'h5', icon: 'h5', titleKey: 'toolbarHeading5', command: 'heading', level: 5 },
  { id: 'h6', icon: 'h6', titleKey: 'toolbarHeading6', command: 'heading', level: 6 },
  { id: 'bold', icon: 'bold', titleKey: 'toolbarBold', command: 'bold' },
  { id: 'italic', icon: 'italic', titleKey: 'toolbarItalic', command: 'italic' },
  { id: 'strike', icon: 'strike', titleKey: 'toolbarStrike', command: 'strikeThrough' },
  { id: 'code', icon: 'code', titleKey: 'toolbarInlineCode', command: 'inlineCode' },
  { id: 'codeblock', icon: 'codeblock', titleKey: 'toolbarCodeBlock', command: 'codeBlock' },
  { id: 'link', icon: 'link', titleKey: 'toolbarLink', command: 'link' },
  { id: 'image', icon: 'image', titleKey: 'toolbarImage', command: 'image' },
  { id: 'attach', icon: 'attach', titleKey: 'toolbarAttachFile', command: 'attach' },
  { id: 'ul', icon: 'ul', titleKey: 'toolbarBulletList', command: 'insertUnorderedList' },
  { id: 'ol', icon: 'ol', titleKey: 'toolbarNumberList', command: 'insertOrderedList' },
  { id: 'quote', icon: 'quote', titleKey: 'toolbarQuote', command: 'blockquote' },
  { id: 'hr', icon: 'hr', titleKey: 'toolbarHorizontalRule', command: 'horizontalRule' },
  { id: 'table', icon: 'table', titleKey: 'toolbarTable', command: 'table' },
  { id: 'outline', icon: 'document_structure', titleKey: 'toolbarDocumentStructure', command: 'toggle-outline' }
];

function preventToolbarFocusLoss(event) {
  event.preventDefault();
}

function createOverflowDots() {
  const wrap = document.createElement('span');
  wrap.className = 'toolbar-overflow-dots';
  wrap.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) {
    wrap.appendChild(document.createElement('span'));
  }
  return wrap;
}

function createToolButton(item, labels, onCommand) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toolbar-btn';
  button.title = labels[item.titleKey] || item.id;
  button.dataset.command = item.command;
  button.dataset.itemId = item.id;
  if (item.level) {
    button.dataset.level = String(item.level);
  }
  setButtonIcon(button, item.icon, 20);
  button.addEventListener('mousedown', preventToolbarFocusLoss);
  button.addEventListener('click', () => onCommand(item));
  return button;
}

function readToolbarMetrics(container, infoButton) {
  const style = getComputedStyle(container);
  const buttonSize = Number.parseFloat(style.getPropertyValue('--toolbar-button-size')) || 44;
  const gap = Number.parseFloat(style.gap) || 2;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const infoHeight = infoButton.offsetHeight || buttonSize;
  const available =
    container.clientHeight - paddingTop - paddingBottom - infoHeight - 8;

  return {
    buttonSize,
    gap,
    step: buttonSize + gap,
    available
  };
}

export function createVerticalToolbar(container, labels, { onCommand }) {
  container.replaceChildren();
  container.classList.add('vertical-toolbar');

  const mainStrip = document.createElement('div');
  mainStrip.className = 'toolbar-main';

  const entries = TOOLBAR_ITEMS.map((item) => ({
    item,
    button: createToolButton(item, labels, onCommand)
  }));

  for (const entry of entries) {
    mainStrip.appendChild(entry.button);
  }

  const overflowButton = document.createElement('button');
  overflowButton.type = 'button';
  overflowButton.className = 'toolbar-btn toolbar-overflow hidden';
  overflowButton.title = labels.toolbarMoreTools || 'More tools';
  overflowButton.setAttribute('aria-label', labels.toolbarMoreTools || 'More tools');
  overflowButton.setAttribute('aria-haspopup', 'menu');
  overflowButton.appendChild(createOverflowDots());

  const spacer = document.createElement('div');
  spacer.className = 'toolbar-spacer';

  const infoButton = document.createElement('button');
  infoButton.type = 'button';
  infoButton.className = 'toolbar-btn toolbar-info';
  infoButton.title = labels.toolbarAbout;
  infoButton.dataset.command = 'about';
  setButtonIcon(infoButton, 'info', 20);
  infoButton.addEventListener('mousedown', preventToolbarFocusLoss);
  infoButton.addEventListener('click', () => onCommand({ command: 'about' }));

  mainStrip.appendChild(overflowButton);
  container.append(mainStrip, spacer, infoButton);

  let toolbarEnabled = true;
  let overflowItems = [];
  let layoutFrame = 0;

  function layoutToolbar() {
    layoutFrame = 0;

    for (const entry of entries) {
      entry.button.classList.remove('toolbar-btn-hidden');
    }
    overflowButton.classList.add('hidden');
    overflowItems = [];

    const { gap, step, available } = readToolbarMetrics(container, infoButton);
    if (available <= 0 || step <= 0) {
      return;
    }

    const maxSlots = Math.floor((available + gap) / step);
    if (maxSlots >= entries.length) {
      return;
    }

    const visibleCount = Math.max(0, maxSlots - 1);
    overflowButton.classList.remove('hidden');
    overflowItems = entries.slice(visibleCount).map((entry) => entry.item);

    entries.forEach((entry, index) => {
      entry.button.classList.toggle('toolbar-btn-hidden', index >= visibleCount);
    });
  }

  function scheduleLayout() {
    if (layoutFrame) {
      return;
    }
    layoutFrame = window.requestAnimationFrame(layoutToolbar);
  }

  overflowButton.addEventListener('mousedown', preventToolbarFocusLoss);
  overflowButton.addEventListener('click', () => {
    if (!overflowItems.length) {
      return;
    }

    showPopupMenu(
      overflowItems.map((item) => ({
        id: item.id,
        label: labels[item.titleKey] || item.id,
        iconName: item.icon,
        disabled: !toolbarEnabled
      })),
      overflowButton,
      {
        onAction: (_id) => {
          const item = overflowItems.find((entry) => entry.id === _id);
          if (item) {
            onCommand(item);
          }
        }
      }
    );
  });

  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(container);

  scheduleLayout();

  return {
    setEnabled(enabled) {
      toolbarEnabled = enabled;
      container.querySelectorAll('.toolbar-btn').forEach((button) => {
        if (button.dataset.command !== 'about') {
          button.disabled = !enabled;
        }
      });
    },
    refreshLayout: scheduleLayout,
    destroy() {
      resizeObserver.disconnect();
      if (layoutFrame) {
        window.cancelAnimationFrame(layoutFrame);
      }
    }
  };
}
