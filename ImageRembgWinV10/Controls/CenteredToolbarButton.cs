using System.Drawing.Drawing2D;
using ImageRembgWinV10.Resources;

namespace ImageRembgWinV10.Controls;

internal static class CenteredIconTextPainter
{
    public const int IconTextGap = 5;
    public const int HorizontalPadding = 8;
    public const int VerticalPadding = 4;

    private static readonly Color CheckedBackColor = Color.FromArgb(219, 234, 254);
    private static readonly Color DisabledBackColor = Color.FromArgb(243, 244, 246);

    public static void Paint(ButtonBase control, PaintEventArgs e)
    {
        var graphics = e.Graphics;
        graphics.SmoothingMode = SmoothingMode.None;
        graphics.PixelOffsetMode = PixelOffsetMode.Default;
        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;

        var bounds = control.ClientRectangle;
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        var isChecked = control is RadioButton { Checked: true } or CheckBox { Checked: true };
        var enabled = control.Enabled;

        var backColor = !enabled
            ? DisabledBackColor
            : isChecked
                ? CheckedBackColor
                : control.Parent?.BackColor ?? SystemColors.Control;

        using (var backBrush = new SolidBrush(backColor))
        {
            graphics.FillRectangle(backBrush, bounds);
        }

        var content = new Rectangle(
            bounds.X + HorizontalPadding,
            bounds.Y + VerticalPadding,
            Math.Max(0, bounds.Width - HorizontalPadding * 2),
            Math.Max(0, bounds.Height - VerticalPadding * 2));

        var textColor = enabled ? control.ForeColor : SystemColors.GrayText;
        var alignRight = control is CenteredToolbarButton { ContentAlignRight: true };
        DrawCenteredContent(graphics, control, content, textColor, backColor, alignRight);

        if (control.Focused && enabled)
        {
            var focusBounds = bounds;
            focusBounds.Inflate(-3, -3);
            ControlPaint.DrawFocusRectangle(graphics, focusBounds);
        }
    }

    private static void DrawCenteredContent(
        Graphics graphics,
        ButtonBase control,
        Rectangle bounds,
        Color textColor,
        Color disabledImageBackColor)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        Image? image = null;
        if (control.ImageList != null && !string.IsNullOrEmpty(control.ImageKey))
        {
            image = control.ImageList.Images[control.ImageKey];
        }

        var text = control.Text ?? string.Empty;
        var textSize = TextRenderer.MeasureText(
            graphics,
            text,
            control.Font,
            new Size(int.MaxValue, int.MaxValue),
            TextFormatFlags.SingleLine | TextFormatFlags.NoPadding);

        var imageWidth = image?.Width ?? 0;
        var imageHeight = image?.Height ?? 0;
        var contentHeight = Math.Max(imageHeight, textSize.Height);
        var startX = bounds.X;
        var startY = bounds.Y + Math.Max(0, (bounds.Height - contentHeight) / 2);

        if (image != null)
        {
            var imageY = startY + (contentHeight - imageHeight) / 2;
            if (control.Enabled)
            {
                graphics.DrawImage(image, startX, imageY, imageWidth, imageHeight);
            }
            else
            {
                ControlPaint.DrawImageDisabled(graphics, image, startX, imageY, disabledImageBackColor);
            }

            startX += imageWidth + IconTextGap;
        }

        if (string.IsNullOrEmpty(text))
        {
            return;
        }

        var textY = startY + (contentHeight - textSize.Height) / 2;
        TextRenderer.DrawText(
            graphics,
            text,
            control.Font,
            new Point(startX, textY),
            textColor,
            TextFormatFlags.SingleLine | TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix);
    }
}

public class CenteredToolbarButton : Button
{
    public CenteredToolbarButton()
    {
        ConfigureToolbarStyle();
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        CenteredIconTextPainter.Paint(this, pevent);
    }

    private void ConfigureToolbarStyle()
    {
        SetStyle(
            ControlStyles.UserPaint
            | ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.Opaque,
            true);
        AutoSize = false;
        Margin = Padding.Empty;
        Padding = Padding.Empty;
        FlatStyle = FlatStyle.Flat;
        UseVisualStyleBackColor = false;
        BackColor = SystemColors.Control;
        FlatAppearance.BorderSize = 0;
        FlatAppearance.MouseOverBackColor = SystemColors.Control;
        FlatAppearance.MouseDownBackColor = SystemColors.Control;
        TabStop = true;
    }
}

public class CenteredToolbarRadioButton : RadioButton
{
    public CenteredToolbarRadioButton()
    {
        Appearance = Appearance.Button;
        ConfigureToolbarStyle();
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        CenteredIconTextPainter.Paint(this, pevent);
    }

    private void ConfigureToolbarStyle()
    {
        SetStyle(
            ControlStyles.UserPaint
            | ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.Opaque,
            true);
        AutoSize = false;
        Margin = Padding.Empty;
        Padding = Padding.Empty;
        FlatStyle = FlatStyle.Flat;
        UseVisualStyleBackColor = false;
        BackColor = SystemColors.Control;
        FlatAppearance.BorderSize = 0;
        FlatAppearance.MouseOverBackColor = SystemColors.Control;
        FlatAppearance.MouseDownBackColor = SystemColors.Control;
        TabStop = true;
    }
}

public class CenteredToolbarCheckBox : CheckBox
{
    public CenteredToolbarCheckBox()
    {
        Appearance = Appearance.Button;
        ConfigureToolbarStyle();
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        CenteredIconTextPainter.Paint(this, pevent);
    }

    private void ConfigureToolbarStyle()
    {
        SetStyle(
            ControlStyles.UserPaint
            | ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.Opaque,
            true);
        AutoSize = false;
        Margin = Padding.Empty;
        Padding = Padding.Empty;
        FlatStyle = FlatStyle.Flat;
        UseVisualStyleBackColor = false;
        BackColor = SystemColors.Control;
        FlatAppearance.BorderSize = 0;
        FlatAppearance.MouseOverBackColor = SystemColors.Control;
        FlatAppearance.MouseDownBackColor = SystemColors.Control;
        TabStop = true;
    }
}
