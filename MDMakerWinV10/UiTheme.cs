namespace MDMakerWinV10;

public static class UiTheme
{
    public static readonly Color Accent       = Color.FromArgb(0, 120, 212);
    public static readonly Color AccentHover  = Color.FromArgb(16, 110, 190);
    public static readonly Color Success      = Color.FromArgb(16, 137, 62);
    public static readonly Color Surface      = Color.White;
    public static readonly Color SurfaceAlt   = Color.FromArgb(243, 243, 243);
    public static readonly Color Border       = Color.FromArgb(200, 200, 200);
    public static readonly Color TextPrimary  = Color.FromArgb(50, 50, 50);
    public static readonly Color TextMuted    = Color.FromArgb(96, 96, 96);
    public static readonly Color LogBack      = Color.FromArgb(30, 30, 30);
    public static readonly Color LogFore      = Color.FromArgb(212, 212, 212);

    public const int ButtonHeight        = 32;
    public const int CompactButtonHeight = 30;

    static readonly Padding StandardPadding = new(8, 6, 10, 4);
    static readonly Padding CompactPadding  = new(6, 5, 8, 3);

    public static void StylePrimaryButton(Button btn, UiIconKind icon)
    {
        ApplyButtonChrome(btn, icon);
        btn.FlatAppearance.BorderSize = 0;
        btn.BackColor = Accent;
        btn.ForeColor = Color.White;
        btn.UseVisualStyleBackColor = false;
        FitButton(btn);
    }

    public static void StyleAccentOutlineButton(Button btn, UiIconKind icon)
    {
        ApplyButtonChrome(btn, icon);
        btn.FlatAppearance.BorderColor = Accent;
        btn.FlatAppearance.BorderSize = 1;
        btn.ForeColor = Accent;
        btn.UseVisualStyleBackColor = true;
        FitButton(btn);
    }

    public static void StyleSecondaryButton(Button btn, UiIconKind icon)
    {
        ApplyButtonChrome(btn, icon);
        btn.FlatAppearance.BorderColor = Border;
        btn.FlatAppearance.BorderSize = 1;
        btn.ForeColor = TextPrimary;
        btn.UseVisualStyleBackColor = true;
        FitButton(btn);
    }

    public static void StyleSuccessButton(Button btn, UiIconKind icon)
    {
        ApplyButtonChrome(btn, icon);
        btn.FlatAppearance.BorderSize = 0;
        btn.BackColor = Success;
        btn.ForeColor = Color.White;
        btn.UseVisualStyleBackColor = false;
        FitButton(btn);
    }

    static void ApplyButtonChrome(Button btn, UiIconKind icon, int height = ButtonHeight)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.Cursor = Cursors.Hand;
        btn.Image = UiIcons.Get(icon);
        btn.ImageAlign = ContentAlignment.MiddleCenter;
        btn.TextAlign = ContentAlignment.MiddleCenter;
        btn.TextImageRelation = TextImageRelation.ImageBeforeText;
        btn.Padding = height <= CompactButtonHeight ? CompactPadding : StandardPadding;
        btn.UseCompatibleTextRendering = true;
        btn.AutoSize = false;
        btn.Height = height;
    }

    public static void FitButton(Button btn, int minimumWidth = 0)
    {
        int w = btn.PreferredSize.Width + 6;
        if (minimumWidth > 0) w = Math.Max(w, minimumWidth);
        btn.Width = w;
    }

    public static void StyleCompactButton(Button btn, UiIconKind icon)
    {
        ApplyButtonChrome(btn, icon, CompactButtonHeight);
        btn.FlatAppearance.BorderColor = Border;
        btn.FlatAppearance.BorderSize = 1;
        btn.ForeColor = TextPrimary;
        btn.UseVisualStyleBackColor = true;
        FitButton(btn);
    }

    public static void NormalizeButtonColumn(params Button[] buttons)
    {
        if (buttons.Length == 0) return;
        int width = buttons.Max(b => b.Width);
        int left  = buttons.Max(b => b.Right) - width;
        foreach (var btn in buttons)
        {
            btn.Width = width;
            btn.Left  = left;
        }
    }

    public static void StyleToolStripButton(ToolStripButton btn, UiIconKind icon)
    {
        btn.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        btn.Image = UiIcons.Get(icon);
        btn.ImageScaling = ToolStripItemImageScaling.None;
        btn.ImageAlign = ContentAlignment.MiddleCenter;
        btn.TextAlign = ContentAlignment.MiddleCenter;
        btn.TextImageRelation = TextImageRelation.ImageBeforeText;
        btn.Padding = new Padding(2, 0, 2, 0);
    }

    public const int MenuIconSize = 16;

    public static void StyleMenuStrip(MenuStrip menu)
    {
        menu.BackColor = SurfaceAlt;
        menu.RenderMode = ToolStripRenderMode.System;
        menu.ImageScalingSize = new Size(MenuIconSize, MenuIconSize);
    }

    public static void StyleMenuItem(ToolStripMenuItem item, UiIconKind icon)
    {
        item.Image = MenuImage(icon);
        item.ImageScaling = ToolStripItemImageScaling.None;
        item.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
    }

    public static void StyleToolStrip(ToolStrip strip)
    {
        strip.BackColor = SurfaceAlt;
        strip.GripStyle = ToolStripGripStyle.Hidden;
        strip.RenderMode = ToolStripRenderMode.System;
        strip.ImageScalingSize = new Size(UiIcons.DefaultSize, UiIcons.DefaultSize);
        strip.Padding = new Padding(6, 3, 6, 1);
    }

    public static void StyleGroupBox(GroupBox grp)
    {
        grp.ForeColor = TextPrimary;
        grp.Padding = new Padding(8, 4, 8, 8);
    }

    public static Image MenuImage(UiIconKind kind) => UiIcons.Get(kind, 16);

    public static void ApplyToMainForm(MainForm form) => form.BackColor = Surface;

    public static void ApplyToDocumentViewForm(DocumentViewForm form) => form.BackColor = Surface;
}
