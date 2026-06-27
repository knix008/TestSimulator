namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// A narrow column painted with 1-based line numbers for a paired scroll source,
/// kept in sync by repainting whenever the pane scrolls, resizes, or its content changes.
/// </summary>
public sealed class LineNumberGutter : Control
{
    private static readonly Color GutterTextColor = PaneTheme.GutterTextColor;

    private ILineScrollSource? _source;

    public LineNumberGutter()
    {
        Width = 44;
        DoubleBuffered = true;
        BackColor = PaneTheme.GutterBackgroundColor;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        var bounds = ClientRectangle;
        using (var background = new SolidBrush(BackColor))
        {
            e.Graphics.FillRectangle(background, bounds);
        }

        var source = _source;
        if (source == null)
        {
            return;
        }

        int firstLine = source.GetFirstVisibleLine();
        int contentLines = source.ContentLineCount;
        var font = source.LineFont;

        using var brush = new SolidBrush(GutterTextColor);
        for (int line = firstLine; line < contentLines; line++)
        {
            int top = source.GetLineTop(line);
            if (top < 0 || top >= bounds.Bottom)
            {
                break;
            }

            string text = (line + 1).ToString();
            var size = e.Graphics.MeasureString(text, font);
            e.Graphics.DrawString(text, font, brush, bounds.Width - size.Width - 6, top);
        }

        using var dividerPen = new Pen(PaneTheme.GutterDividerColor);
        e.Graphics.DrawLine(dividerPen, bounds.Width - 1, 0, bounds.Width - 1, bounds.Height);
    }

    public void Sync(SyncLineListBox listBox)
    {
        Unsubscribe();
        _source = listBox;
        listBox.Scrolled += OnSourceChanged;
        listBox.Resize += OnSourceChanged;
        listBox.FontChanged += OnSourceChanged;
        listBox.LinesChanged += OnSourceChanged;
        Invalidate();
    }

    private void OnSourceChanged(object? sender, EventArgs e) => Invalidate();

    private void Unsubscribe()
    {
        if (_source is SyncLineListBox listBox)
        {
            listBox.Scrolled -= OnSourceChanged;
            listBox.Resize -= OnSourceChanged;
            listBox.FontChanged -= OnSourceChanged;
            listBox.LinesChanged -= OnSourceChanged;
        }

        _source = null;
    }
}
