namespace ScreenCamWin.UI;

internal static class Theme
{
    public static readonly Color BgMain    = Color.FromArgb(13,  13,  26);
    public static readonly Color BgCard    = Color.FromArgb(22,  22,  40);
    public static readonly Color BgSection = Color.FromArgb(30,  30,  52);
    public static readonly Color Accent    = Color.FromArgb(99,  102, 241);
    public static readonly Color Success   = Color.FromArgb(34,  197, 94);
    public static readonly Color Danger    = Color.FromArgb(239, 68,  68);
    public static readonly Color Warning   = Color.FromArgb(245, 158, 11);
    public static readonly Color TextMain  = Color.FromArgb(248, 250, 252);
    public static readonly Color TextSub   = Color.FromArgb(148, 163, 184);
    public static readonly Color Border    = Color.FromArgb(51,  65,  85);

    public static readonly Font FontTitle    = new("Segoe UI", 13f, FontStyle.Bold);
    public static readonly Font FontSection  = new("Segoe UI", 8.5f, FontStyle.Bold);
    public static readonly Font FontBody     = new("Segoe UI", 9f);
    public static readonly Font FontSmall    = new("Segoe UI", 8f);
    public static readonly Font FontMono     = new("Consolas",  11f, FontStyle.Bold);

  // ── Form layout (540px wide content panels) ───────────────────────────────
    public const int PanelMargin   = 14;
    public const int PanelWidth    = 512;
    public const int LabelX        = 10;
    public const int LabelWidth    = 72;
    public const int FieldX        = 88;
    public const int FieldWidth    = 336;
    public const int ActionX       = 432;
    public const int ActionWidth   = 70;
    public const int RowHeight     = 36;
    public const int SectionGap    = 8;

    public static void ApplyButton(Button btn, Color? bg = null, Color? fg = null)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.BackColor = bg ?? Accent;
        btn.ForeColor = fg ?? TextMain;
        btn.FlatAppearance.BorderSize = 0;
        btn.FlatAppearance.MouseOverBackColor = ControlPaint.Light(btn.BackColor, 0.1f);
        btn.Cursor = Cursors.Hand;
        btn.Font   = FontBody;
    }

    public static void ApplyComboBox(ComboBox cb)
    {
        cb.BackColor  = BgSection;
        cb.ForeColor  = TextMain;
        cb.FlatStyle  = FlatStyle.Flat;
        cb.Font       = FontBody;
    }

    public static void ApplyTextBox(TextBox tb)
    {
        tb.BackColor   = BgSection;
        tb.ForeColor   = TextMain;
        tb.BorderStyle = BorderStyle.FixedSingle;
        tb.Font        = FontBody;
    }

    public static void ApplyTrackBar(TrackBar tb, Color bg)
    {
        tb.BackColor  = bg;
        tb.TickStyle  = TickStyle.None;
    }

    public static void ApplyNumericUpDown(NumericUpDown nud, Color? panelBg = null)
    {
        nud.BackColor   = BgSection;
        nud.ForeColor   = TextMain;
        nud.BorderStyle = BorderStyle.FixedSingle;
        nud.Font        = FontBody;
    }

    public static void ApplyCheckBox(CheckBox cb, Color? panelBg = null)
    {
        cb.BackColor = panelBg ?? BgCard;
        cb.ForeColor = TextMain;
        cb.FlatStyle = FlatStyle.Flat;
        cb.Font      = FontBody;
        cb.Cursor    = Cursors.Hand;
        cb.UseVisualStyleBackColor = false;
    }

    public static void ApplySecondaryButton(Button btn)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.BackColor = BgSection;
        btn.ForeColor = TextSub;
        btn.FlatAppearance.BorderColor = Border;
        btn.FlatAppearance.BorderSize  = 1;
        btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(40, 40, 64);
        btn.Cursor = Cursors.Hand;
        btn.Font   = FontSmall;
        btn.UseVisualStyleBackColor = false;
    }

    public static void ApplyProgressBar(ProgressBar bar, Color? panelBg = null)
    {
        bar.BackColor = panelBg ?? BgSection;
        bar.ForeColor = Success;
        bar.Style     = ProgressBarStyle.Continuous;
    }

    public static void ApplySectionLabel(Label lbl, Color? panelBg = null)
    {
        lbl.BackColor              = panelBg ?? BgCard;
        lbl.ForeColor              = Accent;
        lbl.Enabled                = true;
        lbl.UseCompatibleTextRendering = true;
    }

    public static void ApplyFieldLabel(Label lbl, Color? panelBg = null)
    {
        lbl.BackColor              = panelBg ?? BgCard;
        lbl.ForeColor              = TextSub;
        lbl.Enabled                = true;
        lbl.UseCompatibleTextRendering = true;
    }

    public static void ApplyValueLabel(Label lbl, Color? panelBg = null)
    {
        lbl.BackColor              = panelBg ?? BgCard;
        lbl.ForeColor              = TextMain;
        lbl.Enabled                = true;
        lbl.UseCompatibleTextRendering = true;
    }
}
