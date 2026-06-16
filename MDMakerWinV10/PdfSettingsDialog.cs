namespace MDMakerWinV10;

public sealed partial class PdfSettingsDialog : Form
{
    public PdfSettings Result { get; private set; } = PdfSettings.CreateDefault();

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

    private static readonly (string Display, PageNumberPosition Position)[] ConfidentialPositionOptions =
    [
        ("상단 왼쪽", PageNumberPosition.TopLeft),
        ("상단 가운데", PageNumberPosition.TopCenter),
        ("상단 오른쪽", PageNumberPosition.TopRight),
        ("하단 왼쪽", PageNumberPosition.BottomLeft),
        ("하단 가운데", PageNumberPosition.BottomCenter),
    ];

    public PdfSettingsDialog(PdfSettings? initial)
    {
        InitializeComponent();
        ConfigureAppearance();
        ConfigureNudRanges();
        LoadInitial((initial ?? PdfSettings.CreateDefault()).Clone());
        _btnBrowseWordTemplate.Click += BrowseWordTemplate_Click;
        _txtCopyright.TextChanged += (_, _) => RefreshConfidentialPositionOptions();
        FormClosing += OnFormClosing;
    }

    void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (DialogResult == DialogResult.OK)
            CommitResult();
    }

    private void ConfigureAppearance()
    {
        BackColor = UiTheme.Surface;
        UiTheme.StyleGroupBox(_grpFormat);
        UiTheme.StyleGroupBox(_grpHeaderFooter);
        UiTheme.StyleGroupBox(_grpWord);
        UiTheme.StyleCompactButton(_btnBrowseWordTemplate, UiIconKind.Folder);
        _btnBrowseWordTemplate.Padding = new Padding(4, 4, 6, 3);
        UiTheme.FitButton(_btnBrowseWordTemplate);
        _grpWord.Resize += (_, _) => LayoutWordTemplateControls();
        LayoutWordTemplateControls();
        UiTheme.StylePrimaryButton(_btnOk, UiIconKind.Ok);
        UiTheme.StyleSecondaryButton(_btnReset, UiIconKind.Refresh);
        UiTheme.StyleSecondaryButton(_btnCancel, UiIconKind.Cancel);
        _btnOk.Margin = _btnReset.Margin = _btnCancel.Margin = new Padding(0, 0, 8, 0);
    }

    private void LayoutWordTemplateControls()
    {
        const int rowGap = 6;
        int right = _grpWord.ClientRectangle.Right - _grpWord.Padding.Right;
        _txtWordTemplate.Top = 24;
        _txtWordTemplate.Width = Math.Max(120, right - _txtWordTemplate.Left);
        _btnBrowseWordTemplate.Top = _txtWordTemplate.Bottom + rowGap;
        _btnBrowseWordTemplate.Left = right - _btnBrowseWordTemplate.Width;
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
        initial.MigrateLegacyDefaults();

        _cmbFont.Items.Clear();
        int sel = 0;
        for (int i = 0; i < Fonts.Length; i++)
        {
            _cmbFont.Items.Add(Fonts[i].Display);
            if (Fonts[i].Css == initial.FontFamily) sel = i;
        }
        _cmbFont.SelectedIndex = sel;

        _nudFontSize.Value   = (decimal)initial.FontSizePt;
        _nudLineHeight.Value = Clamp((decimal)initial.LineHeight, _nudLineHeight);
        _nudParaSpacing.Value = Clamp((decimal)initial.ParagraphSpacingEm, _nudParaSpacing);
        _nudMarginV.Value    = Clamp((decimal)initial.MarginVerticalInch, _nudMarginV);
        _nudMarginH.Value    = Clamp((decimal)initial.MarginHorizontalInch, _nudMarginH);
        _chkNumberHeadings.Checked = initial.NumberHeadings;
        _cmbPageNumbers.SelectedIndex = Math.Clamp((int)initial.PageNumbers, 0, _cmbPageNumbers.Items.Count - 1);
        _txtWordTemplate.Text = initial.WordTemplatePath ?? "";
        _txtConfidential.Text = initial.Confidential ?? "";
        _txtCopyright.Text = initial.Copyright ?? "";
        RefreshConfidentialPositionOptions();
        SelectConfidentialPosition(initial.ConfidentialPosition);
    }

    void SelectConfidentialPosition(PageNumberPosition pos)
    {
        pos = ExportMarginLayout.NormalizeConfidentialPosition(pos);
        for (int i = 0; i < _cmbConfidentialPosition.Items.Count; i++)
        {
            if (_cmbConfidentialPosition.Items[i] is ConfidentialPositionItem item && item.Position == pos)
            {
                _cmbConfidentialPosition.SelectedIndex = i;
                return;
            }
        }
        _cmbConfidentialPosition.SelectedIndex = Math.Max(0, _cmbConfidentialPosition.Items.Count - 1);
    }

    void RefreshConfidentialPositionOptions()
    {
        bool copyrightSet = !string.IsNullOrWhiteSpace(_txtCopyright.Text);
        var selected = _cmbConfidentialPosition.SelectedItem as ConfidentialPositionItem;

        _cmbConfidentialPosition.Items.Clear();
        foreach (var (display, position) in ConfidentialPositionOptions)
        {
            if (copyrightSet && position == PageNumberPosition.BottomLeft)
                continue;
            _cmbConfidentialPosition.Items.Add(new ConfidentialPositionItem(display, position));
        }

        if (selected != null && !(copyrightSet && selected.Position == PageNumberPosition.BottomLeft))
            SelectConfidentialPosition(selected.Position);
        else if (copyrightSet && selected?.Position == PageNumberPosition.BottomLeft)
            SelectConfidentialPosition(PageNumberPosition.BottomCenter);
        else if (_cmbConfidentialPosition.SelectedIndex < 0)
            SelectConfidentialPosition(PageNumberPosition.TopCenter);
    }

    sealed record ConfidentialPositionItem(string Display, PageNumberPosition Position)
    {
        public override string ToString() => Display;
    }

    private void BrowseWordTemplate_Click(object? sender, EventArgs e)
    {
        using var dlg = new OpenFileDialog
        {
            Title = "Word 양식 파일 선택",
            Filter = "Word 서식 (*.dotx;*.dotm)|*.dotx;*.dotm|모든 파일 (*.*)|*.*",
            DefaultExt = "dotx",
            CheckFileExists = true,
        };
        var current = _txtWordTemplate.Text.Trim();
        if (!string.IsNullOrEmpty(current))
        {
            var dir = Path.GetDirectoryName(current);
            if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
                dlg.InitialDirectory = dir;
            dlg.FileName = Path.GetFileName(current);
        }
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        _txtWordTemplate.Text = dlg.FileName;
    }

    private void ApplyDefaults() => LoadInitial(PdfSettings.CreateDefault());

    static decimal Clamp(decimal value, NumericUpDown nud) =>
        Math.Max(nud.Minimum, Math.Min(nud.Maximum, value));

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
            WordTemplatePath       = _txtWordTemplate.Text.Trim(),
            Confidential           = _txtConfidential.Text.Trim(),
            ConfidentialPosition   = (_cmbConfidentialPosition.SelectedItem as ConfidentialPositionItem)?.Position
                                     ?? PageNumberPosition.TopCenter,
            Copyright              = _txtCopyright.Text.Trim(),
        };
        Result.ConfidentialPosition = ExportMarginLayout.NormalizeConfidentialPosition(Result.ConfidentialPosition);
        if (!string.IsNullOrWhiteSpace(Result.Copyright)
            && Result.ConfidentialPosition == PageNumberPosition.BottomLeft)
            Result.ConfidentialPosition = PageNumberPosition.BottomCenter;
        Result.MigrateLegacyDefaults();
    }
}
