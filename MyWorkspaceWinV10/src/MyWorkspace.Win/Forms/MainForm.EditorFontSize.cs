namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private static readonly int[] EditorFontSizePresets = [10, 12, 14, 16, 18, 20, 24];

    private ToolStripMenuItem? _ctxEditorFontSize;
    private ToolStripMenuItem? _ctxEditorTableFontSize;

    private void SetupEditorFontSizeMenus()
    {
        if (_ctxEditorTable == null)
            return;

        _ctxEditorTableFontSize = AddFontSizeSubmenu(
            _ctxEditorTable,
            "ctxtablefontsize_",
            ApplyTableCellsFontSizeAsync,
            insertIndex: 0);
    }

    private ToolStripMenuItem AddFontSizeSubmenu(
        ContextMenuStrip menu,
        string namePrefix,
        Func<int, Task> applyFontSizeAsync,
        int? insertIndex = null)
    {
        var parent = new ToolStripMenuItem(Localization.Get(K.EditorFontSize))
        {
            Tag = K.EditorFontSize,
            Name = $"{namePrefix}root",
            Image = IconAssets.Load(16, "font_size")
        };

        foreach (var size in EditorFontSizePresets)
        {
            var item = new ToolStripMenuItem(size.ToString())
            {
                Tag = $"{K.EditorFontSize}_{size}",
                Name = $"{namePrefix}{size}",
                Image = IconAssets.Load(16, "font_size")
            };
            var px = size;
            item.Click += async (_, _) =>
            {
                await applyFontSizeAsync(px);
                MarkPageDirty();
            };
            parent.DropDownItems.Add(item);
        }

        parent.DropDownItems.Add(new ToolStripSeparator());

        var defaultItem = new ToolStripMenuItem(Localization.Get(K.EditorFontSizeDefault))
        {
            Tag = K.EditorFontSizeDefault,
            Name = $"{namePrefix}default",
            Image = IconAssets.Load(16, "font_size")
        };
        defaultItem.Click += async (_, _) =>
        {
            await applyFontSizeAsync(0);
            MarkPageDirty();
        };
        parent.DropDownItems.Add(defaultItem);

        if (insertIndex.HasValue)
            menu.Items.Insert(insertIndex.Value, parent);
        else
            menu.Items.Add(parent);

        return parent;
    }

    private async Task ApplyEditorSelectionFontSizeAsync(int fontSizePx) =>
        await RunEditorAsync(e => e.ApplySelectionFontSizeAsync(fontSizePx));

    private async Task ApplyTableCellsFontSizeAsync(int fontSizePx) =>
        await RunEditorAsync(e => e.SetSelectedTableCellsFontSizeAsync(fontSizePx));

    private void UpdateEditorFontSizeMenuItem()
    {
        if (_ctxEditorFontSize == null)
            return;

        var enabled = SessionContext.IsLoggedIn
                      && _currentPageId.HasValue
                      && !string.IsNullOrWhiteSpace(_editorContextMenuSelectedText);

        _ctxEditorFontSize.Enabled = enabled;
        foreach (ToolStripItem item in _ctxEditorFontSize.DropDownItems)
        {
            if (item is ToolStripSeparator)
                continue;

            item.Enabled = enabled;
        }
    }

    private void SetupEditorFontSizeMenuTexts()
    {
        UpdateFontSizeSubmenuTexts(_ctxEditorFontSize);
        UpdateFontSizeSubmenuTexts(_ctxEditorTableFontSize);
    }

    private static void UpdateFontSizeSubmenuTexts(ToolStripMenuItem? parent)
    {
        if (parent == null)
            return;

        if (parent.Tag is string parentKey)
            parent.Text = Localization.Get(parentKey);

        foreach (ToolStripItem item in parent.DropDownItems)
        {
            if (item is ToolStripSeparator || item.Tag is not string key)
                continue;

            if (key == K.EditorFontSizeDefault)
                item.Text = Localization.Get(key);
        }
    }
}
