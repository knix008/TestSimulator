using Microsoft.Web.WebView2.WinForms;
using System.Reflection;

namespace EasyMDV10;

internal static class UiTheme
{
    public static readonly Color AppBackground = Color.FromArgb(243, 244, 246);
    public static readonly Color Surface = Color.White;
    public static readonly Color SidebarBackground = Color.FromArgb(248, 249, 251);
    public static readonly Color SidebarHeader = Color.FromArgb(32, 33, 36);
    public static readonly Color EditorBackground = Color.FromArgb(28, 28, 30);
    public static readonly Color EditorForeground = Color.FromArgb(220, 220, 220);
    public static readonly Color Border = Color.FromArgb(216, 222, 228);
    public static readonly Color ToolbarBackground = Color.FromArgb(252, 252, 253);
    public static readonly Color ToolbarHover = Color.FromArgb(234, 242, 255);
    public static readonly Color ToolbarPressed = Color.FromArgb(208, 228, 255);
    public static readonly Color TextPrimary = Color.FromArgb(31, 35, 40);
    public static readonly Color TextOnDark = Color.FromArgb(248, 249, 250);

    public static Font UiFont { get; } = new("Segoe UI", 9.75f);
    public static Font ToolbarFont { get; } = new("Segoe UI", 9.25f);
    public static Font ToolbarHeadingFont { get; } = new("Segoe UI", 9.25f, FontStyle.Bold);
    public static Font SidebarFont { get; } = new("Segoe UI", 9.5f);
    public static Font EditorFont { get; } = CreateEditorFont();

    public static void Apply(
        Form form,
        MenuStrip menuStrip,
        ToolStrip toolStrip,
        ToolStripButton btnToggleSidebar,
        ToolStripButton btnH1,
        ToolStripButton btnH2,
        ToolStripButton btnH3,
        ToolStripButton btnBold,
        ToolStripButton btnItalic,
        ToolStripButton btnStrike,
        ToolStripButton btnCode,
        ToolStripButton btnCodeBlock,
        ToolStripButton btnLink,
        ToolStripButton btnImage,
        ToolStripButton btnUL,
        ToolStripButton btnOL,
        ToolStripButton btnQuote,
        ToolStripButton btnHR,
        ToolStripButton btnTable,
        SplitContainer outerSplitContainer,
        SplitContainer splitContainer1,
        Panel pnlSidebar,
        Panel pnlSidebarHeader,
        Label lblOutline,
        Button btnCollapse,
        TreeView treeOutline,
        RichTextBox txtMarkdown,
        WebView2 webViewPreview)
    {
        form.Font = UiFont;
        form.BackColor = AppBackground;
        form.ForeColor = TextPrimary;

        var renderer = new ModernToolStripRenderer();
        menuStrip.Renderer = renderer;
        menuStrip.BackColor = ToolbarBackground;
        menuStrip.ForeColor = TextPrimary;
        menuStrip.Padding = new Padding(8, 2, 8, 2);

        toolStrip.Renderer = renderer;
        toolStrip.BackColor = ToolbarBackground;
        toolStrip.ForeColor = TextPrimary;
        toolStrip.Padding = new Padding(10, 6, 10, 6);
        toolStrip.ImageScalingSize = new Size(18, 18);

        StyleToolbarButton(btnToggleSidebar, ToolbarFont, isToggle: true);
        StyleToolbarButton(btnH1, ToolbarHeadingFont);
        StyleToolbarButton(btnH2, ToolbarHeadingFont);
        StyleToolbarButton(btnH3, ToolbarHeadingFont);
        StyleToolbarButton(btnBold, ToolbarFont, bold: true);
        StyleToolbarButton(btnItalic, ToolbarFont, italic: true);
        StyleToolbarButton(btnStrike, ToolbarFont);
        StyleToolbarButton(btnCode, EditorFont);
        StyleToolbarButton(btnCodeBlock, EditorFont);
        foreach (var btn in new[] { btnLink, btnImage, btnUL, btnOL, btnQuote, btnHR, btnTable })
            StyleToolbarButton(btn, ToolbarFont);

        outerSplitContainer.BackColor = Border;
        outerSplitContainer.SplitterWidth = 1;
        splitContainer1.BackColor = Border;
        splitContainer1.SplitterWidth = 1;

        EnableDoubleBuffer(pnlSidebar);
        EnableDoubleBuffer(pnlSidebarHeader);

        pnlSidebar.BackColor = SidebarBackground;
        pnlSidebarHeader.BackColor = SidebarHeader;
        pnlSidebarHeader.Height = 40;

        lblOutline.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        lblOutline.ForeColor = TextOnDark;
        lblOutline.Padding = new Padding(14, 0, 0, 0);

        btnCollapse.FlatAppearance.MouseOverBackColor = Color.FromArgb(64, 64, 68);
        btnCollapse.FlatAppearance.MouseDownBackColor = Color.FromArgb(80, 80, 86);
        btnCollapse.Font = new Font("Segoe UI Symbol", 10f);
        btnCollapse.ForeColor = TextOnDark;
        btnCollapse.Size = new Size(40, 40);
        btnCollapse.Text = "‹";

        treeOutline.BackColor = SidebarBackground;
        treeOutline.ForeColor = TextPrimary;
        treeOutline.Font = SidebarFont;
        treeOutline.Indent = 18;
        treeOutline.ItemHeight = 28;
        treeOutline.BorderStyle = BorderStyle.None;
        treeOutline.ShowLines = true;
        treeOutline.ShowRootLines = true;
        treeOutline.ShowPlusMinus = true;
        treeOutline.LineColor = Color.FromArgb(180, 186, 194);
        treeOutline.HideSelection = false;

        WrapEditor(splitContainer1, txtMarkdown);
        WrapPreview(splitContainer1, webViewPreview);

        txtMarkdown.BackColor = EditorBackground;
        txtMarkdown.ForeColor = EditorForeground;
        txtMarkdown.Font = EditorFont;
        txtMarkdown.BorderStyle = BorderStyle.None;
        txtMarkdown.ScrollBars = RichTextBoxScrollBars.Vertical;
    }

    private static void WrapEditor(SplitContainer split, RichTextBox editor)
    {
        var host = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = EditorBackground,
            Padding = new Padding(20, 16, 12, 16)
        };
        EnableDoubleBuffer(host);

        split.Panel1.Controls.Remove(editor);
        editor.Dock = DockStyle.Fill;
        host.Controls.Add(editor);
        split.Panel1.BackColor = EditorBackground;
        split.Panel1.Controls.Add(host);
    }

    private static void WrapPreview(SplitContainer split, Control preview)
    {
        var host = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Surface,
            Padding = new Padding(8, 0, 0, 0)
        };
        EnableDoubleBuffer(host);

        split.Panel2.Controls.Remove(preview);
        preview.Dock = DockStyle.Fill;
        host.Controls.Add(preview);
        split.Panel2.BackColor = Surface;
        split.Panel2.Controls.Add(host);
    }

    private static void StyleToolbarButton(
        ToolStripButton button,
        Font font,
        bool bold = false,
        bool italic = false,
        bool isToggle = false)
    {
        button.DisplayStyle = ToolStripItemDisplayStyle.Text;
        button.ForeColor = TextPrimary;
        button.Padding = new Padding(isToggle ? 8 : 6, 2, isToggle ? 8 : 6, 2);
        button.Margin = new Padding(2, 0, 2, 0);
        if (bold)
            button.Font = new Font(font, FontStyle.Bold);
        else if (italic)
            button.Font = new Font(font, FontStyle.Italic);
        else
            button.Font = font;
    }

    private static Font CreateEditorFont()
    {
        foreach (var name in new[] { "Cascadia Mono", "Cascadia Code", "Consolas" })
        {
            try
            {
                return new Font(name, 11f);
            }
            catch
            {
                // try next family
            }
        }

        return new Font(FontFamily.GenericMonospace, 11f);
    }

    private static void EnableDoubleBuffer(Control control)
    {
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            BindingFlags.SetProperty | BindingFlags.Instance | BindingFlags.NonPublic,
            null,
            control,
            [true]);
    }
}
