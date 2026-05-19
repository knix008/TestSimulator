using System.Drawing;
using System.Windows.Forms;

namespace RemoteDesktopWinV10.App;

/// <summary>WinForms 공통 색·폰트·플랫 컨트롤 스타일.</summary>
internal static class UiTheme
{
    public static readonly Font UiFont = new("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point);

    public static readonly Color BgApp = Color.FromArgb(243, 243, 243);
    public static readonly Color BgToolbar = Color.FromArgb(250, 250, 250);
    public static readonly Color BgPanel = Color.White;
    public static readonly Color BgRemote = Color.FromArgb(28, 28, 28);
    public static readonly Color TextPrimary = Color.FromArgb(32, 32, 32);
    public static readonly Color TextMuted = Color.FromArgb(96, 96, 96);
    public static readonly Color Accent = Color.FromArgb(0, 120, 212);
    public static readonly Color AccentDisconnect = Color.FromArgb(196, 43, 28);
    public static readonly Color AccentRecord = Color.FromArgb(22, 163, 74);
    public static readonly Color BorderSubtle = Color.FromArgb(218, 218, 218);

    private static readonly ToolStripRenderer LightToolStripRenderer =
        new ToolStripProfessionalRenderer(new LightChromeColorTable());

    private sealed class LightChromeColorTable : ProfessionalColorTable
    {
        private static readonly Color Bar = Color.FromArgb(252, 252, 252);
        private static readonly Color Highlight = Color.FromArgb(229, 241, 251);
        private static readonly Color Pressed = Color.FromArgb(204, 228, 247);

        public override Color ToolStripGradientBegin => Bar;
        public override Color ToolStripGradientMiddle => Bar;
        public override Color ToolStripGradientEnd => Bar;
        public override Color MenuStripGradientBegin => Bar;
        public override Color MenuStripGradientEnd => Bar;
        public override Color ImageMarginGradientBegin => Bar;
        public override Color ImageMarginGradientMiddle => Bar;
        public override Color ImageMarginGradientEnd => Bar;
        public override Color OverflowButtonGradientBegin => Bar;
        public override Color OverflowButtonGradientMiddle => Bar;
        public override Color OverflowButtonGradientEnd => Bar;
        public override Color MenuBorder => BorderSubtle;
        public override Color MenuItemBorder => BorderSubtle;
        public override Color MenuItemSelected => Highlight;
        public override Color MenuItemSelectedGradientBegin => Highlight;
        public override Color MenuItemSelectedGradientEnd => Highlight;
        public override Color MenuItemPressedGradientBegin => Pressed;
        public override Color MenuItemPressedGradientEnd => Pressed;
        public override Color RaftingContainerGradientBegin => Bar;
        public override Color RaftingContainerGradientEnd => Bar;
        public override Color SeparatorDark => Color.FromArgb(200, 200, 200);
        public override Color SeparatorLight => Color.White;
        public override Color ToolStripDropDownBackground => BgPanel;
        public override Color ImageMarginRevealedGradientBegin => Bar;
        public override Color ImageMarginRevealedGradientMiddle => Bar;
        public override Color ImageMarginRevealedGradientEnd => Bar;
        public override Color ButtonSelectedBorder => Accent;
        public override Color ButtonSelectedGradientBegin => Highlight;
        public override Color ButtonSelectedGradientMiddle => Highlight;
        public override Color ButtonSelectedGradientEnd => Highlight;
        public override Color ButtonPressedBorder => Accent;
        public override Color ButtonPressedGradientBegin => Pressed;
        public override Color ButtonPressedGradientMiddle => Pressed;
        public override Color ButtonPressedGradientEnd => Pressed;
    }

    public static void ApplyLightToolStripChrome(ToolStrip strip)
    {
        strip.Font = UiFont;
        strip.BackColor = BgPanel;
        strip.Renderer = LightToolStripRenderer;
    }

    public static void ApplyDialogChrome(Form form)
    {
        form.Font = UiFont;
        form.BackColor = BgApp;
        form.ForeColor = TextPrimary;
    }

    public static void StyleGroupBox(GroupBox gb)
    {
        gb.Font = UiFont;
        gb.ForeColor = TextPrimary;
        gb.BackColor = BgPanel;
    }

    public static void StyleTextBox(TextBox tb)
    {
        tb.Font = UiFont;
        tb.BorderStyle = BorderStyle.Fixed3D;
        tb.BackColor = BgPanel;
        tb.ForeColor = TextPrimary;
    }

    public static void StyleCombo(ComboBox cb)
    {
        cb.Font = UiFont;
        cb.FlatStyle = FlatStyle.Flat;
        cb.BackColor = BgPanel;
        cb.ForeColor = TextPrimary;
    }

    public static void StyleCheckBox(CheckBox chk, Color? panelBack = null)
    {
        chk.Font = UiFont;
        chk.FlatStyle = FlatStyle.Flat;
        chk.UseVisualStyleBackColor = false;
        chk.BackColor = panelBack ?? BgToolbar;
        chk.ForeColor = TextPrimary;
    }

    public static void StyleLabelMuted(Label lbl)
    {
        lbl.Font = UiFont;
        lbl.ForeColor = TextMuted;
        lbl.BackColor = Color.Transparent;
    }

    public static void StyleListBox(ListBox lb)
    {
        lb.Font = UiFont;
        lb.BorderStyle = BorderStyle.FixedSingle;
        lb.BackColor = BgPanel;
        lb.ForeColor = TextPrimary;
    }

    public static void StylePrimaryButton(Button b, int minHeight = 30)
    {
        b.Font = UiFont;
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderSize = 0;
        b.BackColor = Accent;
        b.ForeColor = Color.White;
        b.Cursor = Cursors.Hand;
        b.UseVisualStyleBackColor = false;
        b.FlatAppearance.MouseOverBackColor = ControlPaint.Light(Accent, 0.15f);
        b.FlatAppearance.MouseDownBackColor = ControlPaint.Light(Accent, 0.25f);
        b.AutoSize = false;
        b.Height = Math.Max(b.Height, minHeight);
        b.Padding = new Padding(12, 4, 12, 4);
    }

    public static void StyleSecondaryButton(Button b, int minHeight = 30)
    {
        b.Font = UiFont;
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderSize = 1;
        b.FlatAppearance.BorderColor = BorderSubtle;
        b.BackColor = BgPanel;
        b.ForeColor = TextPrimary;
        b.Cursor = Cursors.Hand;
        b.UseVisualStyleBackColor = false;
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(245, 245, 245);
        b.FlatAppearance.MouseDownBackColor = Color.FromArgb(235, 235, 235);
        b.AutoSize = false;
        b.Height = Math.Max(b.Height, minHeight);
        b.Padding = new Padding(12, 4, 12, 4);
    }

    public static void StyleRecordButton(Button b, int minHeight = 32)
    {
        StylePrimaryButton(b, minHeight);
        var fill = AccentRecord;
        b.BackColor = fill;
        b.ForeColor = Color.White;
        b.FlatAppearance.MouseOverBackColor = ControlPaint.Light(fill, 0.12f);
        b.FlatAppearance.MouseDownBackColor = ControlPaint.Light(fill, 0.22f);
        b.MinimumSize = new Size(96, minHeight);
    }

    public static void StyleStopRecordButton(Button b, int minHeight = 32)
    {
        b.Font = UiFont;
        b.FlatStyle = FlatStyle.Flat;
        b.UseVisualStyleBackColor = false;
        b.FlatAppearance.BorderSize = 0;
        var fill = AccentDisconnect;
        b.BackColor = fill;
        b.ForeColor = Color.White;
        b.Cursor = Cursors.Hand;
        b.FlatAppearance.MouseOverBackColor = ControlPaint.Light(fill, 0.12f);
        b.FlatAppearance.MouseDownBackColor = ControlPaint.Light(fill, 0.22f);
        b.AutoSize = false;
        b.Height = Math.Max(b.Height, minHeight);
        b.Padding = new Padding(12, 4, 12, 4);
        b.MinimumSize = new Size(96, minHeight);
    }

    public static void StyleDangerOutlineButton(Button b, int minHeight = 30)
    {
        b.Font = UiFont;
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderSize = 1;
        b.FlatAppearance.BorderColor = Color.FromArgb(220, 150, 140);
        b.BackColor = BgPanel;
        b.ForeColor = AccentDisconnect;
        b.Cursor = Cursors.Hand;
        b.UseVisualStyleBackColor = false;
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(255, 245, 245);
        b.FlatAppearance.MouseDownBackColor = Color.FromArgb(255, 235, 235);
        b.AutoSize = false;
        b.Height = Math.Max(b.Height, minHeight);
        b.Padding = new Padding(12, 4, 12, 4);
    }

    public static void StyleConnectButton(Button b, bool sessionActive)
    {
        StylePrimaryButton(b, minHeight: 32);
        var fill = sessionActive ? AccentDisconnect : Accent;
        b.BackColor = fill;
        b.FlatAppearance.MouseOverBackColor = ControlPaint.Light(fill, 0.12f);
        b.FlatAppearance.MouseDownBackColor = ControlPaint.Light(fill, 0.22f);
        b.MinimumSize = new Size(96, 32);
    }

    /// <summary>세션 수립 중(서버 응답 대기)일 때 연결 버튼 표시.</summary>
    public static void StyleConnectButtonConnecting(Button b)
    {
        b.Font = UiFont;
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderSize = 0;
        var fill = Color.FromArgb(107, 114, 128);
        b.BackColor = fill;
        b.ForeColor = Color.White;
        b.Cursor = Cursors.AppStarting;
        b.UseVisualStyleBackColor = false;
        b.FlatAppearance.MouseOverBackColor = fill;
        b.FlatAppearance.MouseDownBackColor = fill;
        b.AutoSize = false;
        b.MinimumSize = new Size(96, 32);
        b.Height = Math.Max(b.Height, 32);
        b.Padding = new Padding(12, 4, 12, 4);
    }

    public static void StyleConnectToolStripButton(ToolStripButton b, bool sessionActive)
    {
        b.DisplayStyle = ToolStripItemDisplayStyle.Text;
        b.Font = new Font(UiFont.FontFamily, 9f, FontStyle.Bold);
        var fill = sessionActive ? AccentDisconnect : Accent;
        b.BackColor = fill;
        b.ForeColor = Color.White;
        b.AutoSize = false;
        b.Width = sessionActive ? 96 : 88;
    }

    public static void StyleConnectToolStripButtonConnecting(ToolStripButton b)
    {
        b.DisplayStyle = ToolStripItemDisplayStyle.Text;
        b.Font = new Font(UiFont.FontFamily, 9f, FontStyle.Bold);
        b.BackColor = Color.FromArgb(255, 193, 7);
        b.ForeColor = Color.Black;
        b.Enabled = false;
        b.AutoSize = false;
        b.Width = 96;
    }

    public static void StylePanelRoot(Panel p)
    {
        p.BackColor = BgApp;
    }

    public static void StyleTableLayoutPanelRoot(TableLayoutPanel t) => StylePanelRoot(t);

    public static void StyleInputsRecursive(Control root)
    {
        foreach (Control c in root.Controls)
        {
            StyleInputsRecursive(c);
            switch (c)
            {
                case TextBox tb:
                    StyleTextBox(tb);
                    break;
                case ComboBox cb:
                    StyleCombo(cb);
                    break;
                case CheckBox chk:
                {
                    var panel = chk.Parent is GroupBox g ? g.BackColor : BgToolbar;
                    StyleCheckBox(chk, panel);
                    break;
                }
                case FlowLayoutPanel flp:
                    flp.BackColor = BgApp;
                    break;
                case Label lbl:
                    lbl.Font = UiFont;
                    lbl.ForeColor = TextPrimary;
                    lbl.BackColor = Color.Transparent;
                    break;
            }
        }
    }
}
