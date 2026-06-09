namespace MyUML20WinV10.Export;

public enum UmlDiagramExportKind
{
    Image,
    Svg,
    Pdf,
    Html,
    Markdown,
}

public sealed class UmlDiagramExportDialog : Form
{
    private readonly UmlDiagramExportKind _kind;
    private readonly ComboBox _cmbScope;
    private readonly ComboBox _cmbImageFormat;
    private readonly CheckBox _chkTransparent;
    private readonly Button _btnBackgroundColor;
    private readonly Label _lblImageFormat;
    private readonly Label _lblScope;
    private readonly Label _lblBackground;
    private Color _backgroundColor = Color.White;

    public UmlImageExportOptions ImageOptions { get; private set; } = new();
    public UmlVectorExportOptions VectorOptions { get; private set; } = new();
    public UmlDocumentExportOptions DocumentOptions { get; private set; } = new();
    public UmlDiagramExportScope Scope => (UmlDiagramExportScope)(_cmbScope.SelectedItem
        ?? UmlDiagramExportScope.CurrentDiagram);
    public UmlImageFormat ImageFormat => (UmlImageFormat)(_cmbImageFormat.SelectedItem ?? UmlImageFormat.Png);

    public UmlDiagramExportDialog(UmlDiagramExportKind kind, int diagramCount)
    {
        _kind = kind;
        Text = kind switch
        {
            UmlDiagramExportKind.Image => "다이어그램 이미지 보내기",
            UmlDiagramExportKind.Svg => "다이어그램 SVG 보내기",
            UmlDiagramExportKind.Pdf => "다이어그램 PDF 보내기",
            UmlDiagramExportKind.Html => "HTML 문서 보내기",
            UmlDiagramExportKind.Markdown => "Markdown 문서 보내기",
            _ => "보내기",
        };
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(420, kind is UmlDiagramExportKind.Html or UmlDiagramExportKind.Markdown ? 220 : 260);

        _lblScope = new Label { Text = "대상 뷰", Left = 16, Top = 20, Width = 120 };
        _cmbScope = new ComboBox
        {
            Left = 140,
            Top = 16,
            Width = 250,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        _cmbScope.Items.Add(UmlDiagramExportScope.CurrentDiagram);
        if (diagramCount > 1)
            _cmbScope.Items.Add(UmlDiagramExportScope.AllDiagrams);
        _cmbScope.SelectedIndex = 0;
        _cmbScope.Enabled = kind != UmlDiagramExportKind.Html && kind != UmlDiagramExportKind.Markdown;

        _lblImageFormat = new Label { Text = "이미지 형식", Left = 16, Top = 56, Width = 120 };
        _cmbImageFormat = new ComboBox
        {
            Left = 140,
            Top = 52,
            Width = 250,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        _cmbImageFormat.Items.AddRange([UmlImageFormat.Png, UmlImageFormat.Jpeg, UmlImageFormat.Bmp, UmlImageFormat.Tiff, UmlImageFormat.Gif]);
        _cmbImageFormat.SelectedItem = UmlImageFormat.Png;
        _cmbImageFormat.SelectedIndexChanged += (_, _) => UpdateTransparencyState();

        _chkTransparent = new CheckBox
        {
            Text = "배경 없음 (투명)",
            Left = 140,
            Top = 88,
            Width = 250,
        };
        _chkTransparent.CheckedChanged += (_, _) => UpdateBackgroundState();

        _lblBackground = new Label { Text = "배경 색", Left = 16, Top = 124, Width = 120 };
        _btnBackgroundColor = new Button
        {
            Left = 140,
            Top = 120,
            Width = 120,
            Height = 28,
            Text = "흰색",
            BackColor = Color.White,
        };
        _btnBackgroundColor.Click += (_, _) =>
        {
            using var dialog = new ColorDialog { Color = _backgroundColor, FullOpen = true };
            if (dialog.ShowDialog(this) != DialogResult.OK)
                return;

            _backgroundColor = dialog.Color;
            _btnBackgroundColor.BackColor = _backgroundColor;
            _btnBackgroundColor.Text = _backgroundColor.IsNamedColor ? _backgroundColor.Name : $"RGB {_backgroundColor.R},{_backgroundColor.G},{_backgroundColor.B}";
        };

        var btnOk = new Button { Text = "보내기", Left = 214, Top = ClientSize.Height - 44, Width = 88 };
        var btnCancel = new Button { Text = "취소", Left = 310, Top = ClientSize.Height - 44, Width = 88, DialogResult = DialogResult.Cancel };
        btnOk.Click += (_, _) =>
        {
            if (!TryApplyOptions())
                return;

            DialogResult = DialogResult.OK;
            Close();
        };
        AcceptButton = btnOk;
        CancelButton = btnCancel;

        Controls.AddRange([_lblScope, _cmbScope, btnOk, btnCancel]);

        if (kind is UmlDiagramExportKind.Html or UmlDiagramExportKind.Markdown)
        {
            _lblImageFormat.Text = "다이어그램 이미지 형식";
            Controls.AddRange([_lblImageFormat, _cmbImageFormat, _chkTransparent, _lblBackground, _btnBackgroundColor]);
            _lblScope.Visible = _cmbScope.Visible = false;
        }
        else if (kind == UmlDiagramExportKind.Svg)
        {
            _lblImageFormat.Visible = _cmbImageFormat.Visible = false;
            Controls.AddRange([_chkTransparent, _lblBackground, _btnBackgroundColor]);
        }
        else
        {
            Controls.AddRange([_lblImageFormat, _cmbImageFormat, _chkTransparent, _lblBackground, _btnBackgroundColor]);
        }

        if (kind == UmlDiagramExportKind.Pdf)
            _chkTransparent.Text = "배경 없음";

        UpdateTransparencyState();
        UpdateBackgroundState();
    }

    private bool TryApplyOptions()
    {
        var transparent = _chkTransparent.Checked;
        var scope = Scope;
        var imageFormat = ImageFormat;

        // 이미지 내보내기: PNG→투명, 그 외→흰색 배경 자동 적용
        if (_kind == UmlDiagramExportKind.Image && imageFormat != UmlImageFormat.Png)
            transparent = false;


        ImageOptions = new UmlImageExportOptions
        {
            TransparentBackground = transparent,
            BackgroundColor = _backgroundColor,
            Scope = scope,
        };
        VectorOptions = new UmlVectorExportOptions
        {
            TransparentBackground = transparent,
            BackgroundColor = _backgroundColor,
            Scope = scope,
        };
        DocumentOptions = new UmlDocumentExportOptions
        {
            EmbedDiagramImages = _kind == UmlDiagramExportKind.Html,
            TransparentDiagramBackground = transparent && imageFormat == UmlImageFormat.Png,
            DiagramBackgroundColor = _backgroundColor,
            DiagramImageFormat = imageFormat,
        };
        return true;
    }

    private void UpdateTransparencyState()
    {
        var format = ImageFormat;
        var isPng = format == UmlImageFormat.Png;
        var supportsTransparency = isPng || _kind == UmlDiagramExportKind.Svg || _kind == UmlDiagramExportKind.Pdf;

        // PNG → 자동으로 투명 배경, 그 외 이미지 → 자동으로 흰색 배경
        if (_kind == UmlDiagramExportKind.Image)
        {
            _chkTransparent.Checked = isPng;
            _chkTransparent.Enabled = false; // 형식에 따라 자동 결정
        }
        else
        {
            _chkTransparent.Enabled = supportsTransparency;
            if (!supportsTransparency)
                _chkTransparent.Checked = false;
        }

        if (!isPng && _kind == UmlDiagramExportKind.Image)
        {
            _backgroundColor = Color.White;
            _btnBackgroundColor.BackColor = Color.White;
            _btnBackgroundColor.Text = "흰색";
        }
        UpdateBackgroundState();
    }

    private void UpdateBackgroundState()
    {
        var hideBackground = _chkTransparent.Checked;
        _lblBackground.Enabled = !hideBackground;
        _btnBackgroundColor.Enabled = !hideBackground;
    }
}
