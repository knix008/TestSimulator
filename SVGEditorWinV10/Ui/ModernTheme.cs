namespace SVGEditorWinV10.Ui;

public static class ModernTheme
{
    public static readonly Color AppBackground = Color.FromArgb(240, 242, 245);
    public static readonly Color PanelBackground = Color.FromArgb(255, 255, 255);
    public static readonly Color SidebarBackground = Color.FromArgb(250, 251, 253);
    public static readonly Color CanvasChrome = Color.FromArgb(210, 215, 222);
    public static readonly Color Accent = Color.FromArgb(37, 99, 235);
    public static readonly Color AccentHover = Color.FromArgb(29, 78, 216);
    public static readonly Color AccentMuted = Color.FromArgb(219, 234, 254);
    public static readonly Color Border = Color.FromArgb(209, 213, 219);
    public static readonly Color TextPrimary = Color.FromArgb(17, 24, 39);
    public static readonly Color TextSecondary = Color.FromArgb(107, 114, 128);
    public static readonly Color ToolHover = Color.FromArgb(243, 244, 246);

    public static readonly Font UiFont = new("Segoe UI", 9F);
    public static readonly Font UiFontSmall = new("Segoe UI", 8.5F);
    public static readonly Font TitleFont = new("Segoe UI Semibold", 10F, FontStyle.Bold);
    public static readonly Font MonoFont = new("Cascadia Mono", 9.75F);
    public static readonly Font MonoFontFallback = new("Consolas", 9.75F);

    public static void StyleMenuStrip(MenuStrip menu)
    {
        menu.BackColor = PanelBackground;
        menu.ForeColor = TextPrimary;
        menu.Font = UiFont;
        menu.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
    }

    public static void StyleToolStrip(ToolStrip strip)
    {
        strip.BackColor = SidebarBackground;
        strip.ForeColor = TextPrimary;
        strip.Font = UiFont;
        strip.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
        strip.Padding = new Padding(4, 4, 4, 4);
        strip.GripStyle = ToolStripGripStyle.Hidden;
    }

    public static void StyleStatusStrip(StatusStrip strip)
    {
        strip.BackColor = SidebarBackground;
        strip.ForeColor = TextSecondary;
        strip.Font = UiFontSmall;
        strip.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
    }

    public static void StylePrimaryButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = Accent;
        button.ForeColor = Color.White;
        button.Font = UiFontSmall;
        button.Cursor = Cursors.Hand;
        button.FlatAppearance.MouseOverBackColor = AccentHover;
    }

    public static void StyleSecondaryButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Border;
        button.FlatAppearance.BorderSize = 1;
        button.BackColor = PanelBackground;
        button.ForeColor = TextPrimary;
        button.Font = UiFontSmall;
        button.Cursor = Cursors.Hand;
        button.FlatAppearance.MouseOverBackColor = ToolHover;
    }

    public static void StyleColorSwatch(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Border;
        button.FlatAppearance.BorderSize = 1;
        button.Cursor = Cursors.Hand;
    }

    public static void StyleSectionLabel(Label label)
    {
        label.Font = TitleFont;
        label.ForeColor = TextPrimary;
        label.BackColor = SidebarBackground;
        label.Padding = new Padding(12, 0, 0, 0);
    }

    public static void StyleCaptionLabel(Label label)
    {
        label.Font = UiFontSmall;
        label.ForeColor = TextSecondary;
        label.BackColor = SidebarBackground;
    }

    public static void StyleInput(Control control)
    {
        control.Font = UiFont;
        control.ForeColor = TextPrimary;
        control.BackColor = PanelBackground;
    }

    public static void StyleToolStripButton(ToolStripButton btn, bool isActive)
    {
        btn.BackColor = isActive ? AccentMuted : Color.Transparent;
        btn.ForeColor = isActive ? Accent : TextPrimary;
    }

    public static Font ResolveMonoFont()
    {
        var preferred = new[] { "Cascadia Mono", "Consolas", "Courier New" };
        foreach (var familyName in preferred)
        {
            if (FontFamily.Families.Any(f => f.Name.Equals(familyName, StringComparison.OrdinalIgnoreCase)))
                return new Font(familyName, 9.75F);
        }

        return MonoFontFallback;
    }

    private sealed class ModernColorTable : ProfessionalColorTable
    {
        public override Color ToolStripGradientBegin => PanelBackground;
        public override Color ToolStripGradientMiddle => PanelBackground;
        public override Color ToolStripGradientEnd => PanelBackground;
        public override Color MenuStripGradientBegin => PanelBackground;
        public override Color MenuStripGradientEnd => PanelBackground;
        public override Color MenuItemSelected => AccentMuted;
        public override Color MenuItemBorder => Border;
        public override Color MenuBorder => Border;
        public override Color ButtonSelectedBorder => Accent;
        public override Color ButtonCheckedHighlight => AccentMuted;
        public override Color ButtonCheckedGradientBegin => AccentMuted;
        public override Color ButtonCheckedGradientMiddle => AccentMuted;
        public override Color ButtonCheckedGradientEnd => AccentMuted;
        public override Color ButtonSelectedGradientBegin => ToolHover;
        public override Color ButtonSelectedGradientMiddle => ToolHover;
        public override Color ButtonSelectedGradientEnd => ToolHover;
    }
}
