using System.Drawing;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private static readonly (string TextKey, string Hex)[] EditorTableBackgroundColorPresets =
    [
        (K.EditorTableBackgroundColorYellow, "#FFF59D"),
        (K.EditorTableBackgroundColorGreen, "#C5E1A5"),
        (K.EditorTableBackgroundColorBlue, "#90CAF9"),
        (K.EditorTableBackgroundColorGray, "#CFD8DC"),
        (K.EditorTableBackgroundColorPink, "#F48FB1"),
        (K.EditorTableBackgroundColorOrange, "#FFCC80"),
    ];

    private ToolStripMenuItem? _ctxEditorTableBackgroundColor;
    private Color _lastTableBackgroundCustomColor = Color.FromArgb(255, 245, 157);

    private void SetupEditorTableBackgroundColorMenu(int insertIndex)
    {
        if (_ctxEditorTable == null)
            return;

        _ctxEditorTableBackgroundColor = new ToolStripMenuItem(Localization.Get(K.EditorTableBackgroundColor))
        {
            Tag = K.EditorTableBackgroundColor,
            Name = "ctxtablebgcolor_root",
            Visible = false
        };

        foreach (var (textKey, hex) in EditorTableBackgroundColorPresets)
        {
            var item = new ToolStripMenuItem(Localization.Get(textKey))
            {
                Tag = textKey,
                Name = $"ctxtablebgcolor_{hex.TrimStart('#')}",
                Image = CreateTableBackgroundColorSwatch(hex)
            };
            var color = hex;
            item.Click += async (_, _) =>
            {
                await ApplyTableCellsBackgroundColorAsync(color);
                MarkPageDirty();
            };
            _ctxEditorTableBackgroundColor.DropDownItems.Add(item);
        }

        _ctxEditorTableBackgroundColor.DropDownItems.Add(new ToolStripSeparator());

        var customItem = new ToolStripMenuItem(Localization.Get(K.EditorTableBackgroundColorCustom))
        {
            Tag = K.EditorTableBackgroundColorCustom,
            Name = "ctxtablebgcolor_custom",
            Image = CreateCustomTableBackgroundColorSwatch()
        };
        customItem.Click += async (_, _) => await PickAndApplyTableCellsBackgroundColorAsync();
        _ctxEditorTableBackgroundColor.DropDownItems.Add(customItem);

        var defaultItem = new ToolStripMenuItem(Localization.Get(K.EditorTableBackgroundColorDefault))
        {
            Tag = K.EditorTableBackgroundColorDefault,
            Name = "ctxtablebgcolor_default",
            Image = CreateTableBackgroundColorSwatch("#FFFFFF")
        };
        defaultItem.Click += async (_, _) =>
        {
            await ApplyTableCellsBackgroundColorAsync(null);
            MarkPageDirty();
        };
        _ctxEditorTableBackgroundColor.DropDownItems.Add(defaultItem);

        _ctxEditorTable.Items.Insert(insertIndex, _ctxEditorTableBackgroundColor);
    }

    private async Task PickAndApplyTableCellsBackgroundColorAsync()
    {
        using var dialog = new ColorDialog
        {
            Color = _lastTableBackgroundCustomColor,
            FullOpen = true
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        _lastTableBackgroundCustomColor = dialog.Color;
        var hex = ColorToHex(dialog.Color);
        await ApplyTableCellsBackgroundColorAsync(hex);
        MarkPageDirty();
    }

    private async Task ApplyTableCellsBackgroundColorAsync(string? color) =>
        await RunEditorAsync(e => e.SetSelectedTableCellsBackgroundColorAsync(color));

    private static string ColorToHex(Color color) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}";

    private static Bitmap CreateTableBackgroundColorSwatch(string hex)
    {
        var color = ColorTranslator.FromHtml(hex);
        var bitmap = new Bitmap(16, 16);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.Clear(color);
            using var border = new Pen(Color.FromArgb(160, 160, 160));
            graphics.DrawRectangle(border, 0, 0, 15, 15);
        }

        return bitmap;
    }

    private static Bitmap CreateCustomTableBackgroundColorSwatch()
    {
        var bitmap = new Bitmap(16, 16);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.White);
        graphics.FillRectangle(Brushes.IndianRed, 0, 0, 8, 8);
        graphics.FillRectangle(Brushes.SteelBlue, 8, 0, 8, 8);
        graphics.FillRectangle(Brushes.MediumSeaGreen, 0, 8, 8, 8);
        graphics.FillRectangle(Brushes.Goldenrod, 8, 8, 8, 8);
        using var border = new Pen(Color.FromArgb(160, 160, 160));
        graphics.DrawRectangle(border, 0, 0, 15, 15);
        return bitmap;
    }

    private void SetupEditorTableBackgroundColorMenuTexts()
    {
        if (_ctxEditorTableBackgroundColor == null)
            return;

        if (_ctxEditorTableBackgroundColor.Tag is string parentKey)
            _ctxEditorTableBackgroundColor.Text = Localization.Get(parentKey);

        foreach (ToolStripItem item in _ctxEditorTableBackgroundColor.DropDownItems)
        {
            if (item is ToolStripSeparator || item.Tag is not string key)
                continue;

            item.Text = Localization.Get(key);
        }
    }
}
