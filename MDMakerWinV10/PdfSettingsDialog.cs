namespace MDMakerWinV10;

public sealed partial class PdfSettingsDialog : Form
{
    public PdfSettings Result { get; private set; } = new();

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
        InitializeComponent();
        ConfigureAppearance();
        ConfigureNudRanges();
        LoadInitial(initial);
    }

    private void ConfigureAppearance()
    {
        BackColor = UiTheme.Surface;
        UiTheme.StyleGroupBox(_grpFormat);
        UiTheme.StylePrimaryButton(_btnOk, UiIconKind.Ok);
        UiTheme.StyleSecondaryButton(_btnReset, UiIconKind.Refresh);
        UiTheme.StyleSecondaryButton(_btnCancel, UiIconKind.Cancel);
        _btnOk.Margin = _btnReset.Margin = _btnCancel.Margin = new Padding(0, 0, 8, 0);
    }

    private void ConfigureNudRanges()
    {
        ConfigureNud(_nudFontSize, 8m, 20m, 0.5m, 1);
        ConfigureNud(_nudLineHeight, 1.0m, 3.0m, 0.1m, 1);
        ConfigureNud(_nudParaSpacing, 0.0m, 2.0m, 0.1m, 1);
        ConfigureNud(_nudMarginV, 0.25m, 2.0m, 0.25m, 2);
        ConfigureNud(_nudMarginH, 0.25m, 2.0m, 0.25m, 2);
    }

    private static void ConfigureNud(NumericUpDown nud, decimal min, decimal max, decimal step, int decimals)
    {
        nud.Minimum = min;
        nud.Maximum = max;
        nud.Increment = step;
        nud.DecimalPlaces = decimals;
    }

    private void LoadInitial(PdfSettings initial)
    {
        _cmbFont.Items.Clear();
        int sel = 0;
        for (int i = 0; i < Fonts.Length; i++)
        {
            _cmbFont.Items.Add(Fonts[i].Display);
            if (Fonts[i].Css == initial.FontFamily) sel = i;
        }
        _cmbFont.SelectedIndex = sel;

        _nudFontSize.Value   = (decimal)initial.FontSizePt;
        _nudLineHeight.Value = (decimal)initial.LineHeight;
        _nudParaSpacing.Value = (decimal)initial.ParagraphSpacingEm;
        _nudMarginV.Value    = (decimal)initial.MarginVerticalInch;
        _nudMarginH.Value    = (decimal)initial.MarginHorizontalInch;
        _chkNumberHeadings.Checked = initial.NumberHeadings;
        _cmbPageNumbers.SelectedIndex = (int)initial.PageNumbers;
    }

    private void ApplyDefaults()
    {
        LoadInitial(new PdfSettings());
    }

    private void CommitResult()
    {
        int idx = _cmbFont.SelectedIndex;
        Result = new PdfSettings
        {
            FontFamily             = idx >= 0 ? Fonts[idx].Css : Fonts[0].Css,
            FontSizePt             = (double)_nudFontSize.Value,
            LineHeight             = (double)_nudLineHeight.Value,
            ParagraphSpacingEm     = (double)_nudParaSpacing.Value,
            MarginVerticalInch     = (double)_nudMarginV.Value,
            MarginHorizontalInch   = (double)_nudMarginH.Value,
            NumberHeadings         = _chkNumberHeadings.Checked,
            PageNumbers            = (PageNumberPosition)Math.Max(0, _cmbPageNumbers.SelectedIndex),
        };
    }
}
