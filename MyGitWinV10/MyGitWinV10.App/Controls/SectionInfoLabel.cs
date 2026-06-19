using System.ComponentModel;
using System.Drawing.Drawing2D;

namespace MyGitWinV10.App.Controls;

[ToolboxItem(true)]
public class SectionInfoLabel : Label
{
    private SectionTitleKind _section = SectionTitleKind.Repository;

    public SectionInfoLabel()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Dock = DockStyle.Top;
        Font = new Font("Segoe UI", 9F);
        Padding = new Padding(12, 8, 10, 8);
        TabStop = false;
        TextAlign = ContentAlignment.MiddleLeft;
        UseCompatibleTextRendering = true;
        ApplyTheme();
    }

    [DefaultValue(SectionTitleKind.Repository)]
    public SectionTitleKind Section
    {
        get => _section;
        set
        {
            if (_section == value)
            {
                return;
            }

            _section = value;
            ApplyTheme();
            Invalidate();
        }
    }

    private void ApplyTheme()
    {
        var theme = SectionTitleTheme.For(_section);
        BackColor = theme.Background;
        ForeColor = theme.Foreground;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var theme = SectionTitleTheme.For(_section);
        var rect = ClientRectangle;

        e.Graphics.Clear(theme.Background);

        using (var accent = new SolidBrush(theme.Accent))
        {
            e.Graphics.FillRectangle(accent, 0, 0, 3, rect.Height);
        }

        using (var border = new Pen(theme.Border))
        {
            var previousSmoothing = e.Graphics.SmoothingMode;
            e.Graphics.SmoothingMode = SmoothingMode.None;
            e.Graphics.DrawRectangle(border, 0, 0, rect.Width - 1, rect.Height - 1);
            e.Graphics.SmoothingMode = previousSmoothing;
        }

        var textRect = new Rectangle(
            Padding.Left,
            Padding.Top,
            Math.Max(0, rect.Width - Padding.Horizontal),
            Math.Max(0, rect.Height - Padding.Vertical));

        TextRenderer.DrawText(
            e.Graphics,
            Text,
            Font,
            textRect,
            theme.Foreground,
            TextFormatFlags.Left | TextFormatFlags.WordBreak | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
    }
}
