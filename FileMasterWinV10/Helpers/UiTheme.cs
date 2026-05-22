namespace FileMasterWinV10.Helpers;

public static class UiTheme
{
    public static readonly Color Background = Color.FromArgb(245, 246, 248);
    public static readonly Color Surface = Color.FromArgb(255, 255, 255);
    public static readonly Color Border = Color.FromArgb(218, 222, 228);
    public static readonly Color Accent = Color.FromArgb(0, 103, 192);
    public static readonly Color AccentHover = Color.FromArgb(0, 90, 168);
    public static readonly Color TextPrimary = Color.FromArgb(30, 30, 30);
    public static readonly Color TextSecondary = Color.FromArgb(96, 102, 112);
    public static readonly Color HeaderBg = Color.FromArgb(237, 240, 244);
    public static readonly Color ListAlternate = Color.FromArgb(248, 249, 251);
    public static readonly Color DriveBarBg = Color.FromArgb(232, 235, 240);

    public static readonly Font UiFont = new("Segoe UI", 9.25f);
    public static readonly Font UiFontSmall = new("Segoe UI", 8.5f);
    public static readonly Font UiFontSemibold = new("Segoe UI Semibold", 9.25f);
    public static readonly Font MonoFont = new("Cascadia Mono", 9f);

    public static void ApplyForm(Form form)
    {
        form.BackColor = Background;
        form.Font = UiFont;
        form.ForeColor = TextPrimary;
    }

    public static void StylePrimaryButton(Button btn)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderSize = 0;
        btn.BackColor = Accent;
        btn.ForeColor = Color.White;
        btn.Font = UiFont;
        btn.Cursor = Cursors.Hand;
        btn.Padding = new Padding(8, 0, 8, 0);
        btn.MouseEnter += (_, _) => btn.BackColor = AccentHover;
        btn.MouseLeave += (_, _) => btn.BackColor = Accent;
    }

    public static void StyleSecondaryButton(Button btn)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderColor = Border;
        btn.FlatAppearance.BorderSize = 1;
        btn.BackColor = Surface;
        btn.ForeColor = TextPrimary;
        btn.Font = UiFontSmall;
        btn.Cursor = Cursors.Hand;
        btn.Padding = new Padding(6, 0, 6, 0);
        btn.MouseEnter += (_, _) => btn.BackColor = HeaderBg;
        btn.MouseLeave += (_, _) => btn.BackColor = Surface;
    }

    public static void StyleNavButton(Button btn)
    {
        StyleSecondaryButton(btn);
        btn.Size = new Size(32, 28);
        btn.Margin = new Padding(0, 0, 4, 0);
    }

    public static void StyleComboBox(ComboBox combo)
    {
        combo.FlatStyle = FlatStyle.Flat;
        combo.BackColor = Surface;
        combo.ForeColor = TextPrimary;
        combo.Font = UiFont;
    }

    public static void StyleListView(ListView lv)
    {
        lv.BorderStyle = BorderStyle.None;
        lv.BackColor = Surface;
        lv.ForeColor = TextPrimary;
        lv.Font = UiFont;
        lv.GridLines = false;
    }

    public static void StyleStatusStrip(StatusStrip strip)
    {
        strip.BackColor = HeaderBg;
        strip.ForeColor = TextSecondary;
        strip.Font = UiFontSmall;
        strip.Renderer = new ModernStatusStripRenderer();
    }

    public static void StyleMenuAndToolStrip(MenuStrip menu, ToolStrip toolbar)
    {
        menu.BackColor = Surface;
        menu.ForeColor = TextPrimary;
        menu.Font = UiFont;
        menu.Renderer = new ModernMenuRenderer();

        toolbar.BackColor = Surface;
        toolbar.ForeColor = TextPrimary;
        toolbar.Font = UiFont;
        toolbar.GripStyle = ToolStripGripStyle.Hidden;
        toolbar.Padding = new Padding(6, 4, 6, 4);
        toolbar.Renderer = new ModernToolStripRenderer();
    }
}

internal sealed class ModernMenuRenderer : ToolStripProfessionalRenderer
{
    public ModernMenuRenderer() : base(new ModernColorTable()) { }
}

internal sealed class ModernToolStripRenderer : ToolStripProfessionalRenderer
{
    public ModernToolStripRenderer() : base(new ModernColorTable()) { }

    protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
    {
        if (e.Item is ToolStripButton { Selected: true } or ToolStripButton { Pressed: true })
        {
            var rect = new Rectangle(Point.Empty, e.Item.Size);
            using var brush = new SolidBrush(UiTheme.HeaderBg);
            e.Graphics.FillRectangle(brush, rect);
            using var pen = new Pen(UiTheme.Border);
            e.Graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);
            return;
        }
        base.OnRenderButtonBackground(e);
    }
}

internal sealed class ModernStatusStripRenderer : ToolStripProfessionalRenderer
{
    public ModernStatusStripRenderer() : base(new ModernColorTable()) { }
}

internal sealed class ModernColorTable : ProfessionalColorTable
{
    public override Color ToolStripGradientBegin => UiTheme.Surface;
    public override Color ToolStripGradientMiddle => UiTheme.Surface;
    public override Color ToolStripGradientEnd => UiTheme.Surface;
    public override Color MenuStripGradientBegin => UiTheme.Surface;
    public override Color MenuStripGradientEnd => UiTheme.Surface;
    public override Color MenuItemSelected => UiTheme.HeaderBg;
    public override Color MenuItemSelectedGradientBegin => UiTheme.HeaderBg;
    public override Color MenuItemSelectedGradientEnd => UiTheme.HeaderBg;
    public override Color MenuItemBorder => UiTheme.Border;
    public override Color ToolStripBorder => UiTheme.Border;
    public override Color SeparatorDark => UiTheme.Border;
    public override Color SeparatorLight => UiTheme.Border;
    public override Color ImageMarginGradientBegin => UiTheme.Surface;
    public override Color ImageMarginGradientMiddle => UiTheme.Surface;
    public override Color ImageMarginGradientEnd => UiTheme.Surface;
}
