namespace MyDiagramWinV10.Ui;

public static class ModernTheme
{
    public static readonly Color AppBackground = Color.FromArgb(243, 244, 246);
    public static readonly Color PanelBackground = Color.FromArgb(255, 255, 255);
    public static readonly Color SidebarBackground = Color.FromArgb(248, 249, 251);
    public static readonly Color CanvasChrome = Color.FromArgb(226, 230, 236);
    public static readonly Color Accent = Color.FromArgb(37, 99, 235);
    public static readonly Color AccentHover = Color.FromArgb(59, 130, 246);
    public static readonly Color AccentMuted = Color.FromArgb(219, 234, 254);
    public static readonly Color Border = Color.FromArgb(209, 213, 219);
    public static readonly Color TextPrimary = Color.FromArgb(31, 41, 55);
    public static readonly Color TextSecondary = Color.FromArgb(107, 114, 128);
    public static readonly Color ToolIdle = Color.FromArgb(255, 255, 255);
    public static readonly Color ToolHover = Color.FromArgb(243, 244, 246);
    public static readonly Color ToolSelected = Color.FromArgb(219, 234, 254);

    public static readonly Font UiFont = new("Segoe UI", 9F);
    public static readonly Font TitleFont = new("Segoe UI Semibold", 10F, FontStyle.Bold);
    public static readonly Font SectionFont = new("Segoe UI Semibold", 9F, FontStyle.Bold);

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
    }

    public static void StyleGroupBox(GroupBox groupBox)
    {
        groupBox.Font = SectionFont;
        groupBox.ForeColor = TextPrimary;
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
        strip.Padding = new Padding(8, 4, 8, 4);
    }

    public static void StyleStatusStrip(StatusStrip strip)
    {
        strip.BackColor = SidebarBackground;
        strip.ForeColor = TextSecondary;
        strip.Font = UiFont;
        strip.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
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
    }
}
