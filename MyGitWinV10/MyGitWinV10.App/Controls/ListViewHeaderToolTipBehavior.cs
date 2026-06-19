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
        foreach (var column in listView.Columns.Cast<ColumnHeader>().OrderBy(c => c.DisplayIndex))
        {
            if (x >= left && x < left + column.Width)
            {
                return column.Tag as string;
            }

            left += column.Width;
        }

        return null;
    }

    private static bool IsOverHeader(ListView listView, Point location) =>
        listView.View == View.Details && location.Y >= 0 && location.Y < HeaderHeight;
}
