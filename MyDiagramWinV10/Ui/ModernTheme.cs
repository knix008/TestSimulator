namespace MyDiagramWinV10.Ui;

public static class ModernTheme
{
    // Backgrounds
    public static readonly Color AppBackground = Color.FromArgb(240, 242, 245);
    public static readonly Color PanelBackground = Color.FromArgb(255, 255, 255);
    public static readonly Color SidebarBackground = Color.FromArgb(250, 251, 253);
    public static readonly Color CanvasChrome = Color.FromArgb(210, 215, 222);
    public static readonly Color CardBackground = Color.FromArgb(252, 253, 255);

    // Accent / Brand
    public static readonly Color Accent = Color.FromArgb(37, 99, 235);
    public static readonly Color AccentHover = Color.FromArgb(29, 78, 216);
    public static readonly Color AccentLight = Color.FromArgb(96, 165, 250);
    public static readonly Color AccentMuted = Color.FromArgb(219, 234, 254);

    // Borders & Dividers
    public static readonly Color Border = Color.FromArgb(209, 213, 219);
    public static readonly Color BorderLight = Color.FromArgb(229, 231, 235);
    public static readonly Color Divider = Color.FromArgb(243, 244, 246);

    // Text
    public static readonly Color TextPrimary = Color.FromArgb(17, 24, 39);
    public static readonly Color TextSecondary = Color.FromArgb(107, 114, 128);
    public static readonly Color TextMuted = Color.FromArgb(156, 163, 175);

    // Tool states
    public static readonly Color ToolIdle = Color.FromArgb(255, 255, 255);
    public static readonly Color ToolHover = Color.FromArgb(243, 244, 246);
    public static readonly Color ToolSelected = Color.FromArgb(219, 234, 254);

    // Status / Semantic
    public static readonly Color Success = Color.FromArgb(16, 185, 129);
    public static readonly Color Warning = Color.FromArgb(245, 158, 11);
    public static readonly Color Danger = Color.FromArgb(239, 68, 68);

    // Shadow
    public static readonly Color ShadowLight = Color.FromArgb(24, 0, 0, 0);
    public static readonly Color ShadowMedium = Color.FromArgb(48, 0, 0, 0);

    // Fonts
    public static readonly Font UiFont = new("Segoe UI", 9F);
    public static readonly Font UiFontSmall = new("Segoe UI", 8.5F);
    public static readonly Font TitleFont = new("Segoe UI Semibold", 10F, FontStyle.Bold);
    public static readonly Font SectionFont = new("Segoe UI Semibold", 8.5F, FontStyle.Bold);
    public static readonly Font SmallFont = new("Segoe UI", 7.5F);
    public static readonly Font SmallBoldFont = new("Segoe UI Semibold", 7.5F, FontStyle.Bold);

    public static void StyleInput(Control control)
    {
        control.Font = UiFont;
        control.ForeColor = TextPrimary;
        control.BackColor = PanelBackground;
    }

    public static void StylePrimaryButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = Accent;
        button.ForeColor = Color.White;
        button.Font = UiFont;
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
        button.Font = UiFont;
        button.Cursor = Cursors.Hand;
        button.FlatAppearance.MouseOverBackColor = ToolHover;
    }

    public static void StyleColorSwatch(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Border;
        button.FlatAppearance.BorderSize = 1;
        button.Cursor = Cursors.Hand;
        button.Height = 28;
    }

    public static void StyleGroupBox(GroupBox groupBox)
    {
        groupBox.Font = SectionFont;
        groupBox.ForeColor = Accent;
        groupBox.BackColor = PanelBackground;
    }

    public static void StyleMenuStrip(MenuStrip menu)
    {
        menu.BackColor = PanelBackground;
        menu.ForeColor = TextPrimary;
        menu.Font = UiFont;
        menu.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
    }

    public static void StyleToolStrip(ToolStrip strip)
    {
        strip.BackColor = PanelBackground;
        strip.ForeColor = TextPrimary;
        strip.Font = UiFont;
        strip.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
        strip.Padding = new Padding(6, 2, 6, 2);
        strip.GripStyle = ToolStripGripStyle.Hidden;
    }

    public static void StyleStatusStrip(StatusStrip strip)
    {
        strip.BackColor = SidebarBackground;
        strip.ForeColor = TextSecondary;
        strip.Font = UiFontSmall;
        strip.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
    }

    public static void StyleToolStripButton(ToolStripButton btn, bool isActive)
    {
        btn.BackColor = isActive ? AccentMuted : Color.Transparent;
        btn.ForeColor = isActive ? Accent : TextPrimary;
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
        public override Color ImageMarginGradientBegin => PanelBackground;
        public override Color ImageMarginGradientMiddle => PanelBackground;
        public override Color ImageMarginGradientEnd => PanelBackground;
        public override Color ButtonSelectedBorder => Accent;
        public override Color ButtonCheckedHighlight => AccentMuted;
        public override Color ButtonCheckedGradientBegin => AccentMuted;
        public override Color ButtonCheckedGradientEnd => AccentMuted;
        public override Color ButtonCheckedGradientMiddle => AccentMuted;
        public override Color ButtonSelectedGradientBegin => ToolHover;
        public override Color ButtonSelectedGradientEnd => ToolHover;
        public override Color ButtonSelectedGradientMiddle => ToolHover;
    }
}
