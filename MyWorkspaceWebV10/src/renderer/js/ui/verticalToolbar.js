import { setButtonIcon } from './icons.js';

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

export function createVerticalToolbar(container, labels, { onCommand }) {
  container.replaceChildren();

  for (const item of TOOLBAR_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-btn';
    button.title = labels[item.titleKey] || item.id;
    button.dataset.command = item.command;
    if (item.level) {
      button.dataset.level = String(item.level);
    }
    setButtonIcon(button, item.icon, 20);
    button.addEventListener('click', () => onCommand(item));
    container.appendChild(button);
  }

  const spacer = document.createElement('div');
  spacer.className = 'toolbar-spacer';
  container.appendChild(spacer);

  const infoButton = document.createElement('button');
  infoButton.type = 'button';
  infoButton.className = 'toolbar-btn toolbar-info';
  infoButton.title = labels.toolbarAbout;
  infoButton.dataset.command = 'about';
  setButtonIcon(infoButton, 'info', 20);
  infoButton.addEventListener('click', () => onCommand({ command: 'about' }));
  container.appendChild(infoButton);

  return {
    setEnabled(enabled) {
      container.querySelectorAll('.toolbar-btn').forEach((button) => {
        if (button.dataset.command !== 'about') {
          button.disabled = !enabled;
        }
      });
    }
  };
}
