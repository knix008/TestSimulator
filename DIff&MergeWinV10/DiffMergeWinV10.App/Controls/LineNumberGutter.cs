namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// A narrow column painted with 1-based line numbers for a paired RichTextBox,
/// kept in sync by repainting whenever the box scrolls, resizes, or its text changes.
/// </summary>
public sealed class LineNumberGutter : Control
{
    private RichTextBox? _target;

    public LineNumberGutter()
    {
        Width = 44;
        DoubleBuffered = true;
        BackColor = Color.FromArgb(241, 245, 249);
    }

    public RichTextBox? Target
    {
        get => _target;
        set
        {
            _target = value;
            Invalidate();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        var box = _target;
        if (box == null || !box.IsHandleCreated)
        {
            return;
        }

        e.Graphics.Clear(BackColor);

        int firstCharIndex = box.GetCharIndexFromPosition(new Point(1, 1));
        int firstLine = box.GetLineFromCharIndex(firstCharIndex);
        int totalLines = box.Lines.Length == 0 ? 1 : box.Lines.Length;

        using var brush = new SolidBrush(Color.FromArgb(100, 116, 139));
        for (int line = firstLine; line < totalLines; line++)
        {
            int charIndex = box.GetFirstCharIndexFromLine(line);
            if (charIndex < 0)
            {
                break;
            }

            var position = box.GetPositionFromCharIndex(charIndex);
            if (position.Y > Height)
            {
                break;
            }

            string text = (line + 1).ToString();
            var size = e.Graphics.MeasureString(text, box.Font);
            e.Graphics.DrawString(text, box.Font, brush, Width - size.Width - 6, position.Y);
        }

        using var dividerPen = new Pen(Color.FromArgb(226, 232, 240));
        e.Graphics.DrawLine(dividerPen, Width - 1, 0, Width - 1, Height);
    }

    public void Sync(RichTextBox box)
    {
        Target = box;
        if (box is SyncRichTextBox sync)
        {
            sync.Scrolled += (_, _) => Invalidate();
        }
        box.TextChanged += (_, _) => Invalidate();
        box.Resize += (_, _) => Invalidate();
        box.FontChanged += (_, _) => Invalidate();
    }
}
