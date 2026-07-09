namespace MyGitWinV10.App.Controls;

public static class ListViewHeaderThemeApplier
{
    private const int HeaderHeightFallback = 24;

    public static void ApplySectionTheme(ListView listView, SectionTitleKind kind)
    {
        listView.OwnerDraw = true;
        listView.DrawColumnHeader -= OnDrawColumnHeader;
        listView.DrawItem -= OnDrawItemDefault;
        listView.DrawSubItem -= OnDrawSubItemDefault;
        listView.SizeChanged -= OnListViewSizeChanged;
        listView.DrawColumnHeader += OnDrawColumnHeader;
        listView.DrawItem += OnDrawItemDefault;
        listView.DrawSubItem += OnDrawSubItemDefault;
        listView.SizeChanged += OnListViewSizeChanged;
        listView.Tag = kind;
        EnsureLastColumnFills(listView);
    }

    public static void EnsureLastColumnFills(ListView listView)
    {
        if (listView.Columns.Count == 0)
        {
            return;
        }

        ColumnHeader lastColumn = listView.Columns[listView.Columns.Count - 1];
        if (lastColumn.Width != -2)
        {
            lastColumn.Width = -2;
        }
    }

    private static void OnListViewSizeChanged(object? sender, EventArgs e)
    {
        if (sender is ListView listView)
        {
            EnsureLastColumnFills(listView);
        }
    }

    private static void OnDrawItemDefault(object? sender, DrawListViewItemEventArgs e) =>
        e.DrawDefault = true;

    private static void OnDrawSubItemDefault(object? sender, DrawListViewSubItemEventArgs e) =>
        e.DrawDefault = true;

    private static void OnDrawColumnHeader(object? sender, DrawListViewColumnHeaderEventArgs e)
    {
        if (sender is not ListView listView)
        {
            return;
        }

        var kind = listView.Tag as SectionTitleKind? ?? SectionTitleKind.CommitHistory;
        var theme = SectionTitleTheme.For(kind);
        Rectangle bounds = e.Bounds;
        int headerHeight = bounds.Height > 0 ? bounds.Height : HeaderHeightFallback;
        bool isFirst = e.ColumnIndex == 0;
        bool isLast = e.ColumnIndex == listView.Columns.Count - 1;

        Rectangle fillRect = isLast
            ? new Rectangle(bounds.Left, bounds.Top, Math.Max(bounds.Width, listView.ClientSize.Width - bounds.Left), headerHeight)
            : new Rectangle(bounds.Left, bounds.Top, bounds.Width, headerHeight);

        using (var background = new SolidBrush(theme.Background))
        {
            e.Graphics.FillRectangle(background, fillRect);
        }

        if (isFirst)
        {
            using var accent = new SolidBrush(theme.Accent);
            e.Graphics.FillRectangle(accent, bounds.Left, bounds.Top, 3, headerHeight);
        }

        using (var border = new Pen(theme.Border))
        {
            int bottom = bounds.Top + headerHeight - 1;
            if (isLast)
            {
                e.Graphics.DrawLine(border, 0, bottom, listView.ClientSize.Width - 1, bottom);
            }
            else
            {
                e.Graphics.DrawLine(border, bounds.Left, bottom, bounds.Right - 1, bottom);
            }
        }

        if (!isLast)
        {
            using var border = new Pen(theme.Border);
            e.Graphics.DrawLine(border, bounds.Right - 1, bounds.Top + 4, bounds.Right - 1, bounds.Bottom - 5);
        }

        using var font = new Font(listView.Font, FontStyle.Bold);
        var textRect = new Rectangle(bounds.X + 8, bounds.Y, Math.Max(0, bounds.Width - 10), bounds.Height);
        TextRenderer.DrawText(
            e.Graphics,
            e.Header?.Text ?? string.Empty,
            font,
            textRect,
            theme.Foreground,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
    }
}
