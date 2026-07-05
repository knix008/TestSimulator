namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? _ctxEditorTableDeleteTable;
    private ToolStripMenuItem? _ctxEditorTableDeleteRows;
    private ToolStripMenuItem? _ctxEditorTableDeleteColumns;
    private ToolStripSeparator? _ctxEditorTableDeleteSeparator;
    private ToolStripMenuItem? _ctxEditorTableInsertRowAbove;
    private ToolStripMenuItem? _ctxEditorTableInsertRowBelow;
    private ToolStripMenuItem? _ctxEditorTableInsertColumnLeft;
    private ToolStripMenuItem? _ctxEditorTableInsertColumnRight;
    private ToolStripSeparator? _ctxEditorTableInsertSeparator;

    private void SetupEditorTableContextMenu()
    {
        _ctxEditorTable = new EditorContextMenuStrip(components);
        _ctxEditorTable.Opening += (_, _) => EnterEditorOverlay();
        _ctxEditorTable.Closed += (_, _) => ExitEditorOverlay();

        _ctxEditorTableDeleteTable = AddEditorTableMenuItem(
            K.EditorTableDelete,
            async (_, _) => await DeleteSelectedTableAsync(),
            "delete");
        _ctxEditorTableDeleteRows = AddEditorTableMenuItem(
            K.EditorTableDeleteRows,
            async (_, _) => await DeleteSelectedTableRowsAsync(),
            "delete");
        _ctxEditorTableDeleteColumns = AddEditorTableMenuItem(
            K.EditorTableDeleteColumns,
            async (_, _) => await DeleteSelectedTableColumnsAsync(),
            "delete");
        _ctxEditorTableDeleteSeparator = new ToolStripSeparator();
        _ctxEditorTable!.Items.Add(_ctxEditorTableDeleteSeparator);

        _ctxEditorTableInsertRowAbove = AddEditorTableMenuItem(
            K.EditorTableInsertRowAbove,
            async (_, _) => await InsertSelectedTableRowsAboveAsync(),
            "table",
            "ctxtableinsert_row_above");
        _ctxEditorTableInsertRowBelow = AddEditorTableMenuItem(
            K.EditorTableInsertRowBelow,
            async (_, _) => await InsertSelectedTableRowsBelowAsync(),
            "table",
            "ctxtableinsert_row_below");
        _ctxEditorTableInsertColumnLeft = AddEditorTableMenuItem(
            K.EditorTableInsertColumnLeft,
            async (_, _) => await InsertSelectedTableColumnsLeftAsync(),
            "table",
            "ctxtableinsert_column_left");
        _ctxEditorTableInsertColumnRight = AddEditorTableMenuItem(
            K.EditorTableInsertColumnRight,
            async (_, _) => await InsertSelectedTableColumnsRightAsync(),
            "table",
            "ctxtableinsert_column_right");
        _ctxEditorTableInsertSeparator = new ToolStripSeparator();
        _ctxEditorTable.Items.Add(_ctxEditorTableInsertSeparator);

        SetupEditorTableBackgroundColorMenu(insertIndex: 9);

        AddEditorTableMenuItem(K.EditorTableAlignLeft, async (_, _) => await SetTableCellsTextAlignAsync("left"), "align_left");
        AddEditorTableMenuItem(K.EditorTableAlignCenter, async (_, _) => await SetTableCellsTextAlignAsync("center"), "align_center");
        AddEditorTableMenuItem(K.EditorTableAlignRight, async (_, _) => await SetTableCellsTextAlignAsync("right"), "align_right");
        _ctxEditorTable.Items.Add(new ToolStripSeparator());
        AddEditorTableMenuItem(K.EditorTableAlignTop, async (_, _) => await SetTableCellsVerticalAlignAsync("top"), "align_top");
        AddEditorTableMenuItem(K.EditorTableAlignMiddle, async (_, _) => await SetTableCellsVerticalAlignAsync("middle"), "align_middle");
        AddEditorTableMenuItem(K.EditorTableAlignBottom, async (_, _) => await SetTableCellsVerticalAlignAsync("bottom"), "align_bottom");

        SetupEditorFontSizeMenus();
        AppTheme.StyleContextMenu(_ctxEditorTable);
    }

    private ToolStripMenuItem AddEditorTableMenuItem(string textKey, EventHandler click, string iconName, string? itemName = null)
    {
        var item = new ToolStripMenuItem(Localization.Get(textKey))
        {
            Tag = textKey,
            Name = itemName ?? $"ctxtable_{iconName}",
            Image = IconAssets.Load(16, iconName)
        };
        item.Click += click;
        _ctxEditorTable!.Items.Add(item);
        return item;
    }

    private void UpdateEditorTableContextMenu(EditorContextMenuContext context)
    {
        var showDeleteTable = context.IsTableScopeTable;
        var showDeleteRows = context.IsTableScopeRows;
        var showDeleteColumns = context.IsTableScopeColumns;
        var showInsertRows = context.IsTableScopeRows || context.IsTableScopeTable;
        var showInsertColumns = context.IsTableScopeColumns || context.IsTableScopeTable;

        if (_ctxEditorTableDeleteTable != null)
            _ctxEditorTableDeleteTable.Visible = showDeleteTable;

        if (_ctxEditorTableDeleteRows != null)
            _ctxEditorTableDeleteRows.Visible = showDeleteRows;

        if (_ctxEditorTableDeleteColumns != null)
            _ctxEditorTableDeleteColumns.Visible = showDeleteColumns;

        if (_ctxEditorTableDeleteSeparator != null)
            _ctxEditorTableDeleteSeparator.Visible = showDeleteTable || showDeleteRows || showDeleteColumns;

        if (_ctxEditorTableInsertRowAbove != null)
            _ctxEditorTableInsertRowAbove.Visible = showInsertRows;

        if (_ctxEditorTableInsertRowBelow != null)
            _ctxEditorTableInsertRowBelow.Visible = showInsertRows;

        if (_ctxEditorTableInsertColumnLeft != null)
            _ctxEditorTableInsertColumnLeft.Visible = showInsertColumns;

        if (_ctxEditorTableInsertColumnRight != null)
            _ctxEditorTableInsertColumnRight.Visible = showInsertColumns;

        if (_ctxEditorTableInsertSeparator != null)
            _ctxEditorTableInsertSeparator.Visible = showInsertRows || showInsertColumns;

        if (_ctxEditorTableBackgroundColor != null)
            _ctxEditorTableBackgroundColor.Visible = context.IsTableScopeRows
                                                     || context.IsTableScopeColumns
                                                     || context.IsTableScopeCells
                                                     || context.IsTableScopeTable;
    }

    private async Task DeleteSelectedTableAsync()
    {
        await RunEditorAsync(e => e.DeleteSelectedTableAsync());
        MarkPageDirty();
    }

    private async Task DeleteSelectedTableRowsAsync()
    {
        await RunEditorAsync(e => e.DeleteSelectedTableRowsAsync());
        MarkPageDirty();
    }

    private async Task DeleteSelectedTableColumnsAsync()
    {
        await RunEditorAsync(e => e.DeleteSelectedTableColumnsAsync());
        MarkPageDirty();
    }

    private async Task InsertSelectedTableRowsAboveAsync()
    {
        await RunEditorAsync(e => e.InsertSelectedTableRowsAboveAsync());
        MarkPageDirty();
    }

    private async Task InsertSelectedTableRowsBelowAsync()
    {
        await RunEditorAsync(e => e.InsertSelectedTableRowsBelowAsync());
        MarkPageDirty();
    }

    private async Task InsertSelectedTableColumnsLeftAsync()
    {
        await RunEditorAsync(e => e.InsertSelectedTableColumnsLeftAsync());
        MarkPageDirty();
    }

    private async Task InsertSelectedTableColumnsRightAsync()
    {
        await RunEditorAsync(e => e.InsertSelectedTableColumnsRightAsync());
        MarkPageDirty();
    }

    private async Task SetTableCellsTextAlignAsync(string align)
    {
        await RunEditorAsync(e => e.SetSelectedTableCellsTextAlignAsync(align));
        MarkPageDirty();
    }

    private async Task SetTableCellsVerticalAlignAsync(string align)
    {
        await RunEditorAsync(e => e.SetSelectedTableCellsVerticalAlignAsync(align));
        MarkPageDirty();
    }

    private void SetupEditorTableContextMenuTexts()
    {
        if (_ctxEditorTable == null)
            return;

        foreach (ToolStripItem item in _ctxEditorTable.Items)
        {
            if (item.Tag is string key)
                item.Text = Localization.Get(key);
        }

        SetupEditorTableBackgroundColorMenuTexts();
    }
}
