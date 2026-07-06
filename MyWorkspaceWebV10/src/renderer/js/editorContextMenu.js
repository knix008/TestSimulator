import { showPopupMenuAtPoint, closePopupMenu } from './ui/popupMenu.js';
import { EDITOR_FONT_SIZE_PRESETS } from './ui/fontScale.js';

const TABLE_BACKGROUND_COLORS = [
  { id: 'yellow', hex: '#FFF59D', labelKey: 'editorTableBackgroundColorYellow' },
  { id: 'green', hex: '#C5E1A5', labelKey: 'editorTableBackgroundColorGreen' },
  { id: 'blue', hex: '#90CAF9', labelKey: 'editorTableBackgroundColorBlue' },
  { id: 'gray', hex: '#CFD8DC', labelKey: 'editorTableBackgroundColorGray' },
  { id: 'pink', hex: '#F48FB1', labelKey: 'editorTableBackgroundColorPink' },
  { id: 'orange', hex: '#FFCC80', labelKey: 'editorTableBackgroundColorOrange' }
];

let lastTableBackgroundCustomColor = '#FFF59D';

function menuIcon(name) {
  return name;
}

function buildFontSizeSubmenu(t, idPrefix, { disabled = false } = {}) {
  const submenu = EDITOR_FONT_SIZE_PRESETS.map((size) => ({
    id: `${idPrefix}${size}`,
    label: String(size),
    iconName: menuIcon('font_size'),
    disabled
  }));
  submenu.push({ type: 'separator' });
  submenu.push({
    id: `${idPrefix}default`,
    label: t.editorFontSizeDefault,
    iconName: menuIcon('font_size'),
    disabled
  });
  return {
    id: `${idPrefix}menu`,
    label: t.editorFontSize,
    iconName: menuIcon('font_size'),
    disabled,
    submenu
  };
}

function buildImageQuote(src, alt) {
  if (!src?.trim()) {
    return '';
  }
  const safeSrc = src.trim();
  const safeAlt = alt?.trim() || '';
  return safeAlt ? `![${safeAlt}](${safeSrc})` : `![](${safeSrc})`;
}

function buildEditorItems(t, { canEdit, loggedIn, selectedText, lineQuote, outlineVisible }) {
  const hasSelection = Boolean(selectedText?.trim());
  const hasLineQuote = Boolean(lineQuote?.trim());

  return [
    {
      id: 'editor-cut',
      label: t.editorCut,
      iconName: menuIcon('cut'),
      shortcut: 'Ctrl+X',
      disabled: !canEdit || !hasSelection
    },
    {
      id: 'editor-copy',
      label: t.editorCopy,
      iconName: menuIcon('copy'),
      shortcut: 'Ctrl+C',
      disabled: !hasSelection
    },
    {
      id: 'editor-paste',
      label: t.editorPaste,
      iconName: menuIcon('paste'),
      shortcut: 'Ctrl+V',
      disabled: !canEdit
    },
    {
      id: 'editor-comment-selection',
      label: t.editorCommentOnSelection,
      iconName: menuIcon('quote'),
      disabled: !loggedIn || !hasSelection
    },
    {
      id: 'editor-comment-line',
      label: t.editorCommentOnLine,
      iconName: menuIcon('quote'),
      disabled: !loggedIn || !hasLineQuote
    },
    { type: 'separator' },
    {
      id: 'editor-select-all',
      label: t.editorSelectAll,
      iconName: menuIcon('selectall'),
      shortcut: 'Ctrl+A'
    },
    { type: 'separator' },
    { id: 'editor-undo', label: t.toolbarUndo, iconName: menuIcon('undo'), shortcut: 'Ctrl+Z', disabled: !canEdit },
    { id: 'editor-redo', label: t.toolbarRedo, iconName: menuIcon('redo'), shortcut: 'Ctrl+Y', disabled: !canEdit },
    { type: 'separator' },
    { id: 'editor-h1', label: t.toolbarHeading1, iconName: menuIcon('h1'), disabled: !canEdit },
    { id: 'editor-h2', label: t.toolbarHeading2, iconName: menuIcon('h2'), disabled: !canEdit },
    { id: 'editor-h3', label: t.toolbarHeading3, iconName: menuIcon('h3'), disabled: !canEdit },
    { id: 'editor-h4', label: t.toolbarHeading4, iconName: menuIcon('h4'), disabled: !canEdit },
    { id: 'editor-h5', label: t.toolbarHeading5, iconName: menuIcon('h5'), disabled: !canEdit },
    { id: 'editor-h6', label: t.toolbarHeading6, iconName: menuIcon('h6'), disabled: !canEdit },
    { type: 'separator' },
    { id: 'editor-bold', label: t.editorBold, iconName: menuIcon('bold'), shortcut: 'Ctrl+B', disabled: !canEdit },
    { id: 'editor-italic', label: t.toolbarItalic, iconName: menuIcon('italic'), shortcut: 'Ctrl+I', disabled: !canEdit },
    { id: 'editor-strike', label: t.toolbarStrike, iconName: menuIcon('strike'), disabled: !canEdit },
    buildFontSizeSubmenu(t, 'editor-fontsize-', { disabled: !canEdit || !hasSelection }),
    { type: 'separator' },
    { id: 'editor-inline-code', label: t.toolbarInlineCode, iconName: menuIcon('code'), disabled: !canEdit },
    { id: 'editor-code-block', label: t.toolbarCodeBlock, iconName: menuIcon('codeblock'), disabled: !canEdit },
    { type: 'separator' },
    { id: 'editor-link', label: t.toolbarLink, iconName: menuIcon('link'), disabled: !canEdit },
    { id: 'editor-image', label: t.toolbarImage, iconName: menuIcon('image'), disabled: !canEdit },
    { id: 'editor-attach', label: t.toolbarAttachFile, iconName: menuIcon('attach'), disabled: !canEdit },
    { type: 'separator' },
    { id: 'editor-ul', label: t.toolbarBulletList, iconName: menuIcon('ul'), disabled: !canEdit },
    { id: 'editor-ol', label: t.toolbarNumberList, iconName: menuIcon('ol'), disabled: !canEdit },
    { id: 'editor-blockquote', label: t.toolbarQuote, iconName: menuIcon('quote'), disabled: !canEdit },
    { type: 'separator' },
    { id: 'editor-hr', label: t.toolbarHorizontalRule, iconName: menuIcon('hr'), disabled: !canEdit },
    { id: 'editor-table', label: t.toolbarTable, iconName: menuIcon('table'), disabled: !canEdit },
    { type: 'separator' },
    {
      id: 'editor-toggle-outline',
      label: t.menuDocumentStructure,
      iconName: menuIcon('document_structure'),
      checked: outlineVisible
    }
  ];
}

function buildImageItems(t, { canEdit, loggedIn, imageQuote }) {
  return [
    { id: 'image-open', label: t.editorImageOpen, iconName: menuIcon('image') },
    {
      id: 'image-comment',
      label: t.editorCommentOnSelection,
      iconName: menuIcon('quote'),
      disabled: !loggedIn || !imageQuote
    },
    { type: 'separator' },
    {
      id: 'image-cut',
      label: t.editorCut,
      iconName: menuIcon('cut'),
      shortcut: 'Ctrl+X',
      disabled: !canEdit
    },
    {
      id: 'image-copy',
      label: t.editorCopy,
      iconName: menuIcon('copy'),
      shortcut: 'Ctrl+C'
    },
    { type: 'separator' },
    { id: 'image-replace', label: t.editorImageReplace, iconName: menuIcon('image'), disabled: !canEdit },
    { id: 'image-delete', label: t.editorImageDelete, iconName: menuIcon('delete'), shortcut: 'Del', disabled: !canEdit }
  ];
}

function buildTableBackgroundSubmenu(t, { disabled = false, visible = true } = {}) {
  const submenu = TABLE_BACKGROUND_COLORS.map((preset) => ({
    id: `table-bg-${preset.id}`,
    label: t[preset.labelKey],
    iconName: menuIcon('table'),
    disabled
  }));
  submenu.push({ type: 'separator' });
  submenu.push({
    id: 'table-bg-custom',
    label: t.editorTableBackgroundColorCustom,
    iconName: menuIcon('preferences'),
    disabled
  });
  submenu.push({
    id: 'table-bg-default',
    label: t.editorTableBackgroundColorDefault,
    iconName: menuIcon('table'),
    disabled
  });
  return {
    id: 'table-bg-menu',
    label: t.editorTableBackgroundColor,
    iconName: menuIcon('table'),
    disabled,
    visible,
    submenu
  };
}

function buildTableItems(t, context, canEdit) {
  const scope = context.selectionScope || 'cells';
  const showDeleteTable = scope === 'table';
  const showDeleteRows = scope === 'rows';
  const showDeleteColumns = scope === 'columns';
  const showInsertRows = scope === 'rows' || scope === 'table';
  const showInsertColumns = scope === 'columns' || scope === 'table';
  const showBackground =
    scope === 'rows' || scope === 'columns' || scope === 'cells' || scope === 'table';

  return [
    {
      id: 'table-delete-table',
      label: t.editorTableDelete,
      iconName: menuIcon('delete'),
      visible: showDeleteTable,
      disabled: !canEdit
    },
    {
      id: 'table-delete-rows',
      label: t.editorTableDeleteRows,
      iconName: menuIcon('delete'),
      visible: showDeleteRows,
      disabled: !canEdit
    },
    {
      id: 'table-delete-columns',
      label: t.editorTableDeleteColumns,
      iconName: menuIcon('delete'),
      visible: showDeleteColumns,
      disabled: !canEdit
    },
    { type: 'separator', visible: showDeleteTable || showDeleteRows || showDeleteColumns },
    {
      id: 'table-insert-row-above',
      label: t.editorTableInsertRowAbove,
      iconName: menuIcon('table'),
      visible: showInsertRows,
      disabled: !canEdit
    },
    {
      id: 'table-insert-row-below',
      label: t.editorTableInsertRowBelow,
      iconName: menuIcon('table'),
      visible: showInsertRows,
      disabled: !canEdit
    },
    {
      id: 'table-insert-column-left',
      label: t.editorTableInsertColumnLeft,
      iconName: menuIcon('table'),
      visible: showInsertColumns,
      disabled: !canEdit
    },
    {
      id: 'table-insert-column-right',
      label: t.editorTableInsertColumnRight,
      iconName: menuIcon('table'),
      visible: showInsertColumns,
      disabled: !canEdit
    },
    { type: 'separator', visible: showInsertRows || showInsertColumns },
    buildTableBackgroundSubmenu(t, { disabled: !canEdit, visible: showBackground }),
    {
      id: 'table-align-left',
      label: t.editorTableAlignLeft,
      iconName: menuIcon('align_left'),
      disabled: !canEdit
    },
    {
      id: 'table-align-center',
      label: t.editorTableAlignCenter,
      iconName: menuIcon('align_center'),
      disabled: !canEdit
    },
    {
      id: 'table-align-right',
      label: t.editorTableAlignRight,
      iconName: menuIcon('align_right'),
      disabled: !canEdit
    },
    { type: 'separator' },
    {
      id: 'table-align-top',
      label: t.editorTableAlignTop,
      iconName: menuIcon('align_top'),
      disabled: !canEdit
    },
    {
      id: 'table-align-middle',
      label: t.editorTableAlignMiddle,
      iconName: menuIcon('align_middle'),
      disabled: !canEdit
    },
    {
      id: 'table-align-bottom',
      label: t.editorTableAlignBottom,
      iconName: menuIcon('align_bottom'),
      disabled: !canEdit
    },
    { type: 'separator' },
    buildFontSizeSubmenu(t, 'table-fontsize-', { disabled: !canEdit })
  ];
}

async function pickCustomTableBackgroundColor() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = lastTableBackgroundCustomColor;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.addEventListener(
      'change',
      () => {
        lastTableBackgroundCustomColor = input.value;
        input.remove();
        resolve(input.value);
      },
      { once: true }
    );
    input.addEventListener(
      'blur',
      () => {
        window.setTimeout(() => {
          if (input.isConnected) {
            input.remove();
            resolve(null);
          }
        }, 200);
      },
      { once: true }
    );
    input.click();
  });
}

export function createEditorContextMenu({
  editor,
  editorFrame,
  t,
  getState,
  onCommentQuote,
  onToggleOutline,
  onImportImage,
  onImportAttach,
  onInsertTable,
  onInsertLink,
  onOpenResource
}) {
  let lastContext = null;
  let lastSelectedText = '';
  let lastLineQuote = '';
  let lastImageSrc = '';
  let lastImageQuote = '';
  let lastMenuPoint = null;

  async function showAt(clientX, clientY) {
    const state = getState();
    if (!state.loggedIn || !state.hasOpenPage) {
      return;
    }

    const frameRect = editorFrame.getBoundingClientRect();
    const screenX = frameRect.left + clientX;
    const screenY = frameRect.top + clientY;
    lastMenuPoint = { x: screenX, y: screenY };

    lastContext = await editor.getContextMenuContext(clientX, clientY);
    lastSelectedText = (await editor.getSelectedText()).trim();
    lastLineQuote = lastContext.lineQuote?.trim() || '';
    lastImageSrc = lastContext.src || '';
    lastImageQuote = buildImageQuote(lastContext.src, lastContext.alt);

    let items;
    if (lastContext.target === 'image') {
      items = buildImageItems(t, {
        canEdit: state.canEdit,
        loggedIn: state.loggedIn,
        imageQuote: lastImageQuote
      });
    } else if (lastContext.target === 'table-cells') {
      items = buildTableItems(t, lastContext, state.canEdit);
    } else {
      items = buildEditorItems(t, {
        canEdit: state.canEdit,
        loggedIn: state.loggedIn,
        selectedText: lastSelectedText,
        lineQuote: lastLineQuote,
        outlineVisible: state.outlinePanelVisible
      });
    }

    showPopupMenuAtPoint(items, screenX, screenY, {
      onAction: (actionId) => handleAction(actionId, state)
    });
  }

  async function handleAction(actionId, state) {
    try {
      switch (actionId) {
        case 'editor-cut':
          await editor.applyFormat('cut');
          break;
        case 'editor-copy':
          await editor.applyFormat('copy');
          break;
        case 'editor-paste':
          await editor.applyFormat('paste');
          break;
        case 'editor-comment-selection':
          onCommentQuote?.(lastSelectedText);
          break;
        case 'editor-comment-line':
          onCommentQuote?.(lastLineQuote);
          break;
        case 'editor-select-all':
          await editor.selectAll();
          break;
        case 'editor-undo':
          await editor.runCommand({ command: 'undo' });
          break;
        case 'editor-redo':
          await editor.runCommand({ command: 'redo' });
          break;
        case 'editor-h1':
        case 'editor-h2':
        case 'editor-h3':
        case 'editor-h4':
        case 'editor-h5':
        case 'editor-h6':
          await editor.runCommand({ command: 'heading', level: Number.parseInt(actionId.slice(-1), 10) });
          break;
        case 'editor-bold':
          await editor.runCommand({ command: 'bold' });
          break;
        case 'editor-italic':
          await editor.runCommand({ command: 'italic' });
          break;
        case 'editor-strike':
          await editor.runCommand({ command: 'strikeThrough' });
          break;
        case 'editor-inline-code':
          await editor.runCommand({ command: 'inlineCode' });
          break;
        case 'editor-code-block':
          await editor.runCommand({ command: 'codeBlock' });
          break;
        case 'editor-link':
          await onInsertLink?.();
          break;
        case 'editor-image':
          await onImportImage?.();
          break;
        case 'editor-attach':
          await onImportAttach?.();
          break;
        case 'editor-ul':
          await editor.runCommand({ command: 'insertUnorderedList' });
          break;
        case 'editor-ol':
          await editor.runCommand({ command: 'insertOrderedList' });
          break;
        case 'editor-blockquote':
          await editor.runCommand({ command: 'blockquote' });
          break;
        case 'editor-hr':
          await editor.runCommand({ command: 'horizontalRule' });
          break;
        case 'editor-table':
          await onInsertTable?.(lastMenuPoint || undefined);
          break;
        case 'editor-toggle-outline':
          onToggleOutline?.();
          break;
        case 'image-open':
          if (lastImageSrc) {
            await onOpenResource?.(lastImageSrc);
          }
          break;
        case 'image-comment':
          onCommentQuote?.(lastImageQuote);
          break;
        case 'image-cut':
          await editor.callEditorMethod('cutSelectedImage');
          break;
        case 'image-copy':
          await editor.callEditorMethod('copySelectedImage');
          break;
        case 'image-replace':
          await onImportImage?.({ replace: true });
          break;
        case 'image-delete':
          await editor.callEditorMethod('deleteSelectedImage');
          break;
        case 'table-delete-table':
          await editor.callEditorMethod('deleteSelectedTable');
          break;
        case 'table-delete-rows':
          await editor.callEditorMethod('deleteSelectedTableRows');
          break;
        case 'table-delete-columns':
          await editor.callEditorMethod('deleteSelectedTableColumns');
          break;
        case 'table-insert-row-above':
          await editor.callEditorMethod('insertSelectedTableRowsAbove');
          break;
        case 'table-insert-row-below':
          await editor.callEditorMethod('insertSelectedTableRowsBelow');
          break;
        case 'table-insert-column-left':
          await editor.callEditorMethod('insertSelectedTableColumnsLeft');
          break;
        case 'table-insert-column-right':
          await editor.callEditorMethod('insertSelectedTableColumnsRight');
          break;
        case 'table-align-left':
          await editor.callEditorMethod('setSelectedCellsTextAlign', 'left');
          break;
        case 'table-align-center':
          await editor.callEditorMethod('setSelectedCellsTextAlign', 'center');
          break;
        case 'table-align-right':
          await editor.callEditorMethod('setSelectedCellsTextAlign', 'right');
          break;
        case 'table-align-top':
          await editor.callEditorMethod('setSelectedCellsVerticalAlign', 'top');
          break;
        case 'table-align-middle':
          await editor.callEditorMethod('setSelectedCellsVerticalAlign', 'middle');
          break;
        case 'table-align-bottom':
          await editor.callEditorMethod('setSelectedCellsVerticalAlign', 'bottom');
          break;
        case 'table-bg-default':
          await editor.callEditorMethod('setSelectedCellsBackgroundColor', '');
          break;
        case 'table-bg-custom': {
          const color = await pickCustomTableBackgroundColor();
          if (color) {
            await editor.callEditorMethod('setSelectedCellsBackgroundColor', color);
          }
          break;
        }
        default: {
          const bgMatch = /^table-bg-(yellow|green|blue|gray|pink|orange)$/.exec(actionId);
          if (bgMatch) {
            const preset = TABLE_BACKGROUND_COLORS.find((entry) => entry.id === bgMatch[1]);
            if (preset) {
              await editor.callEditorMethod('setSelectedCellsBackgroundColor', preset.hex);
            }
            break;
          }
          const selectionFontMatch = /^editor-fontsize-(default|\d+)$/.exec(actionId);
          if (selectionFontMatch) {
            const size = selectionFontMatch[1] === 'default' ? 0 : Number.parseInt(selectionFontMatch[1], 10);
            await editor.callEditorMethod('applySelectionFontSize', size);
            break;
          }
          const tableFontMatch = /^table-fontsize-(default|\d+)$/.exec(actionId);
          if (tableFontMatch) {
            const size = tableFontMatch[1] === 'default' ? 0 : Number.parseInt(tableFontMatch[1], 10);
            await editor.callEditorMethod('setSelectedCellsFontSize', size);
            break;
          }
          break;
        }
      }
    } catch (error) {
      state.onError?.('편집기 컨텍스트 메뉴', error);
    }
  }

  return {
    showAt,
    close: closePopupMenu
  };
}
