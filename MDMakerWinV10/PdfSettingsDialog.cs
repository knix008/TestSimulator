namespace MDMakerWinV10;

public sealed class PdfSettingsDialog : Form
{
    public PdfSettings Result { get; private set; } = new();

    private readonly ComboBox      _cmbFont;
    private readonly NumericUpDown _nudFontSize;
    private readonly NumericUpDown _nudLineHeight;
    private readonly NumericUpDown _nudParaSpacing;
    private readonly NumericUpDown _nudMarginV;
    private readonly NumericUpDown _nudMarginH;

    private static readonly (string Display, string Css)[] Fonts =
    [
        ("맑은 고딕 (기본)",    "'Malgun Gothic','Segoe UI',Helvetica,Arial,sans-serif"),
        ("Segoe UI",            "'Segoe UI',Helvetica,Arial,sans-serif"),
        ("굴림",               "Gulim,'Malgun Gothic',sans-serif"),
        ("돋움",               "Dotum,'Malgun Gothic',sans-serif"),
        ("바탕",               "Batang,Georgia,serif"),
        ("Arial",              "Arial,sans-serif"),
        ("Times New Roman",    "'Times New Roman',Georgia,serif"),
        ("Georgia",            "Georgia,serif"),
    ];

    public PdfSettingsDialog(PdfSettings initial)
    {
        Text = "보내기 서식";
        ClientSize = new Size(380, 290);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 9F);

        _cmbFont     = MakeCombo(initial.FontFamily);
        _nudFontSize   = MakeNud(8m,    20m,  0.5m, 1, (decimal)initial.FontSizePt);
        _nudLineHeight  = MakeNud(1.0m,  3.0m, 0.1m, 1, (decimal)initial.LineHeight);
        _nudParaSpacing = MakeNud(0.0m,  2.0m, 0.1m, 1, (decimal)initial.ParagraphSpacingEm);
        _nudMarginV     = MakeNud(0.25m, 2.0m, 0.25m, 2, (decimal)initial.MarginVerticalInch);
        _nudMarginH     = MakeNud(0.25m, 2.0m, 0.25m, 2, (decimal)initial.MarginHorizontalInch);

        var grp = new GroupBox
        {
            Text = "서식",
            Location = new Point(8, 8),
            Size = new Size(364, 228),
        };

        string[] labels = { "글꼴", "글꼴 크기 (pt)", "줄 간격", "단락 간격 (em)", "위/아래 여백 (인치)", "좌/우 여백 (인치)" };
        Control[] controls = { _cmbFont, _nudFontSize, _nudLineHeight, _nudParaSpacing, _nudMarginV, _nudMarginH };

        const int lblX = 12, ctlX = 200, startY = 20, rowH = 34;
        for (int i = 0; i < labels.Length; i++)
        {
            grp.Controls.Add(new Label
            {
                Text = labels[i],
                Location = new Point(lblX, startY + i * rowH + 7),
                Size = new Size(186, 18),
                TextAlign = ContentAlignment.MiddleLeft,
            });
            controls[i].Location = new Point(ctlX, startY + i * rowH + 5);
            grp.Controls.Add(controls[i]);
        }

        var btnOk     = new Button { Text = "확인",  Size = new Size(76, 28), Location = new Point(8,   252), DialogResult = DialogResult.OK };
        var btnReset  = new Button { Text = "기본값", Size = new Size(76, 28), Location = new Point(90,  252) };
        var btnCancel = new Button { Text = "취소",  Size = new Size(76, 28), Location = new Point(296, 252), DialogResult = DialogResult.Cancel };

        btnReset.Click += (_, _) => ApplyDefaults();
        btnOk.Click    += (_, _) => CommitResult();
        AcceptButton = btnOk;
        CancelButton = btnCancel;

        Controls.AddRange([grp, btnOk, btnReset, btnCancel]);
    }

    private static ComboBox MakeCombo(string currentCss)
    {
        var cmb = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = 152,
        };
        int sel = 0;
        for (int i = 0; i < Fonts.Length; i++)
        {
            cmb.Items.Add(Fonts[i].Display);
            if (Fonts[i].Css == currentCss) sel = i;
        }
        cmb.SelectedIndex = sel;
        return cmb;
    }

    private static NumericUpDown MakeNud(decimal min, decimal max, decimal step, int decimals, decimal value) =>
        new() { Minimum = min, Maximum = max, Increment = step, DecimalPlaces = decimals,
                Value = Math.Clamp(value, min, max), Width = 90 };

    private void ApplyDefaults()
    {
        var d = new PdfSettings();
        int defIdx = Array.FindIndex(Fonts, f => f.Css == d.FontFamily);
        _cmbFont.SelectedIndex     = defIdx >= 0 ? defIdx : 0;
        _nudFontSize.Value         = (decimal)d.FontSizePt;
        _nudLineHeight.Value       = (decimal)d.LineHeight;
        _nudParaSpacing.Value      = (decimal)d.ParagraphSpacingEm;
        _nudMarginV.Value          = (decimal)d.MarginVerticalInch;
        _nudMarginH.Value          = (decimal)d.MarginHorizontalInch;
    }

    private void CommitResult()
    {
        int idx = _cmbFont.SelectedIndex;
        Result = new PdfSettings
        {
            FontFamily           = idx >= 0 ? Fonts[idx].Css : Fonts[0].Css,
            FontSizePt           = (double)_nudFontSize.Value,
            LineHeight           = (double)_nudLineHeight.Value,
            ParagraphSpacingEm   = (double)_nudParaSpacing.Value,
            MarginVerticalInch   = (double)_nudMarginV.Value,
            MarginHorizontalInch = (double)_nudMarginH.Value,
        };
    }
}
