namespace MyGitWinV10.App.Controls;

public static class ListViewHeaderToolTipBehavior
{
    private const int HeaderHeight = 24;

    public static void Attach(ListView listView)
    {
        var toolTip = new ToolTip
        {
            InitialDelay = 300,
            ReshowDelay = 100,
            AutoPopDelay = 8000
        };

        string? activeTip = null;

        listView.Disposed += (_, _) => toolTip.Dispose();
        listView.MouseLeave += (_, _) =>
        {
            activeTip = null;
            toolTip.Hide(listView);
        };
        listView.MouseMove += (_, e) =>
        {
            if (!IsOverHeader(listView, e.Location))
            {
                if (activeTip != null)
                {
                    activeTip = null;
                    toolTip.Hide(listView);
                }

                return;
            }

            var tip = GetColumnToolTip(listView, e.X);
            if (tip == activeTip)
            {
                return;
            }

            activeTip = tip;
            if (tip is null)
            {
                toolTip.Hide(listView);
            }
            else
            {
                toolTip.Show(tip, listView, e.X + 14, e.Y + 14, 10000);
            }
        };
    }

    public static ColumnHeader AddColumn(ListView listView, string text, int width, string toolTip)
    {
        var column = new ColumnHeader
        {
            Text = text,
            Width = width,
            Tag = toolTip
        };
        listView.Columns.Add(column);
        return column;
    }

    private static string? GetColumnToolTip(ListView listView, int x)
    {
        int left = 0;
        var columns = listView.Columns.Cast<ColumnHeader>().OrderBy(c => c.DisplayIndex).ToList();
        for (int index = 0; index < columns.Count; index++)
        {
            ColumnHeader column = columns[index];
            int width = ResolveColumnWidth(listView, column, index == columns.Count - 1);
            if (width <= 0)
            {
                continue;
            }

            if (x >= left && x < left + width)
            {
                return column.Tag as string;
            }

            left += width;
        }

        return null;
    }

    private static int ResolveColumnWidth(ListView listView, ColumnHeader column, bool isLastColumn)
    {
        if (column.Width >= 0)
        {
            return column.Width;
        }

        if (isLastColumn && column.Width == -2)
        {
            int fixedWidth = listView.Columns
                .Cast<ColumnHeader>()
                .Take(listView.Columns.Count - 1)
                .Sum(c => Math.Max(0, c.Width));
            return Math.Max(0, listView.ClientSize.Width - fixedWidth);
        }

        return 0;
    }

    private static bool IsOverHeader(ListView listView, Point location) =>
        listView.View == View.Details && location.Y >= 0 && location.Y < HeaderHeight;
}
