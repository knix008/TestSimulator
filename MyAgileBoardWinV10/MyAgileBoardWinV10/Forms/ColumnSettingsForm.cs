using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Forms;

public partial class ColumnSettingsForm : Form
{
    private KanbanColumn _column = null!;
    private ColumnSettingsSnapshot _snapshot;
    private Color _headerColor;
    private Color _canvasColor;
    private Color _titleColor;
    private string _titleFontFamily = "Segoe UI";
    private float _titleFontSize;
    private bool _titleFontBold;
    private bool _titleFontItalic;
    private bool _autoTitleColor;
    private bool _loading;

    private const int ColorSwatchSize = 28;
    private const int ColorSwatchMargin = 2;

    private static readonly Color[] HeaderColorPalette =
    [
        Color.FromArgb(128, 128, 128),
        Color.FromArgb(189, 195, 199),
        Color.FromArgb(44, 62, 80),
        Color.FromArgb(68, 114, 196),
        Color.FromArgb(52, 152, 219),
        Color.FromArgb(26, 188, 156),
        Color.FromArgb(112, 173, 71),
        Color.FromArgb(56, 118, 56),
        Color.FromArgb(237, 125, 49),
        Color.FromArgb(241, 196, 15),
        Color.FromArgb(255, 193, 7),
        Color.FromArgb(158, 73, 211),
        Color.FromArgb(103, 58, 183),
        Color.FromArgb(231, 76, 60),
        Color.FromArgb(255, 87, 87),
        Color.FromArgb(192, 57, 43),
        Color.FromArgb(121, 85, 72),
        Color.FromArgb(96, 125, 139),
        Color.FromArgb(0, 121, 107),
        Color.FromArgb(63, 81, 181),
    ];

    private static readonly Color[] CanvasColorPalette =
    [
        Color.FromArgb(252, 252, 250),
        Color.FromArgb(255, 255, 255),
        Color.FromArgb(245, 245, 245),
        Color.FromArgb(238, 238, 238),
        Color.FromArgb(250, 248, 240),
        Color.FromArgb(255, 250, 235),
        Color.FromArgb(240, 248, 255),
        Color.FromArgb(235, 245, 255),
        Color.FromArgb(240, 255, 240),
        Color.FromArgb(232, 245, 233),
        Color.FromArgb(255, 240, 245),
        Color.FromArgb(255, 245, 238),
        Color.FromArgb(245, 240, 255),
        Color.FromArgb(255, 255, 224),
        Color.FromArgb(224, 255, 255),
        Color.FromArgb(230, 230, 250),
        Color.FromArgb(255, 228, 225),
        Color.FromArgb(240, 255, 255),
        Color.FromArgb(248, 248, 220),
        Color.FromArgb(220, 220, 220),
    ];

    private static readonly Color[] TitleColorPalette =
    [
        Color.Black,
        Color.White,
        Color.FromArgb(51, 51, 51),
        Color.FromArgb(85, 85, 85),
        Color.FromArgb(119, 119, 119),
        Color.FromArgb(238, 238, 238),
        Color.FromArgb(68, 114, 196),
        Color.FromArgb(26, 82, 118),
        Color.FromArgb(46, 125, 50),
        Color.FromArgb(27, 94, 32),
        Color.FromArgb(220, 60, 60),
        Color.FromArgb(183, 28, 28),
        Color.FromArgb(237, 125, 49),
        Color.FromArgb(230, 81, 0),
        Color.FromArgb(158, 73, 211),
        Color.FromArgb(106, 27, 154),
        Color.FromArgb(0, 96, 100),
        Color.FromArgb(255, 235, 59),
        Color.FromArgb(255, 213, 79),
        Color.FromArgb(176, 190, 197),
    ];

    public ColumnSettingsForm()
    {
        InitializeComponent();
    }

    public ColumnSettingsForm(KanbanColumn column) : this()
    {
        _column = column;
        _snapshot = ColumnSettingsSnapshot.Capture(column);
        _headerColor = ColorTranslator.FromHtml(column.HeaderColorHex);
        _canvasColor = column.GetCanvasColor();
        _titleFontFamily = column.TitleFontFamily;
        _titleFontSize = column.TitleFontSize;
        _titleFontBold = column.TitleFontBold;
        _titleFontItalic = column.TitleFontItalic;
        _autoTitleColor = string.IsNullOrWhiteSpace(column.TitleColorHex);
        _titleColor = _autoTitleColor
            ? column.ResolveTitleColor(_headerColor)
            : ColorTranslator.FromHtml(column.TitleColorHex!);

        LoadFromColumn();
    }

    public event EventHandler? PreviewChanged;

    private void LoadFromColumn()
    {
        _loading = true;
        try
        {
        txtName.Text = _column.Name;
        nudColumnWidth.Value = Math.Clamp(_column.ColumnWidth > 0 ? _column.ColumnWidth : ColumnWidthDefaults.Default, 50, 2000);
        chkIsCompletion.Checked = _column.IsCompletionColumn;
        chkAutoTitleColor.Checked = _autoTitleColor;
        BuildHeaderColorPalette();
        BuildCanvasColorPalette();
        BuildTitleColorPalette();
        UpdateTitleColorControlsEnabled();
        UpdatePreview();
        }
        finally
        {
            _loading = false;
        }
    }

    private void BuildHeaderColorPalette()
    {
        BuildColorPalette(panelColors, HeaderColorPalette, _headerColor, ColorBtn_Click);
    }

    private void BuildCanvasColorPalette()
    {
        BuildColorPalette(panelCanvasColors, CanvasColorPalette, _canvasColor, CanvasColorBtn_Click);
    }

    private void BuildTitleColorPalette()
    {
        BuildColorPalette(panelTitleColors, TitleColorPalette, _titleColor, TitleColorBtn_Click);
    }

    private static void BuildColorPalette(
        FlowLayoutPanel panel, Color[] palette, Color selected, EventHandler clickHandler)
    {
        panel.Controls.Clear();
        foreach (var color in palette)
        {
            var btn = new Panel
            {
                Size = new Size(ColorSwatchSize, ColorSwatchSize),
                BackColor = color,
                BorderStyle = BorderStyle.FixedSingle,
                Cursor = Cursors.Hand,
                Margin = new Padding(ColorSwatchMargin),
                Tag = color
            };
            if (color.ToArgb() == selected.ToArgb())
                btn.BorderStyle = BorderStyle.Fixed3D;

            btn.Click += clickHandler;
            panel.Controls.Add(btn);
        }
    }

    private void ColorBtn_Click(object? sender, EventArgs e)
    {
        if (sender is not Panel btn) return;
        _headerColor = (Color)btn.Tag!;
        MarkSelectedPanel(panelColors, btn);
        CommitPreview();
    }

    private void CanvasColorBtn_Click(object? sender, EventArgs e)
    {
        if (sender is not Panel btn) return;
        _canvasColor = (Color)btn.Tag!;
        MarkSelectedPanel(panelCanvasColors, btn);
        CommitPreview();
    }

    private void TitleColorBtn_Click(object? sender, EventArgs e)
    {
        if (sender is not Panel btn) return;
        _titleColor = (Color)btn.Tag!;
        MarkSelectedPanel(panelTitleColors, btn);
        CommitPreview();
    }

    private static void MarkSelectedPanel(FlowLayoutPanel panel, Panel selected)
    {
        foreach (Panel p in panel.Controls.OfType<Panel>())
            p.BorderStyle = BorderStyle.FixedSingle;
        selected.BorderStyle = BorderStyle.Fixed3D;
    }

    private void UpdatePreview()
    {
        panelPreview.BackColor = _headerColor;
        panelCanvasPreview.BackColor = _canvasColor;
        lblCanvasPreviewHint.ForeColor = ResolveAutoTitleColor(_canvasColor);
        lblPreviewText.Font = CreatePreviewFont();
        lblPreviewText.ForeColor = _autoTitleColor
            ? ResolveAutoTitleColor(_headerColor)
            : _titleColor;
        lblPreviewText.Text = string.IsNullOrWhiteSpace(txtName.Text) ? "컬럼 이름" : txtName.Text;
        lblTitleFontSample.Text = GetTitleFontDisplayName();
    }

    private Font CreatePreviewFont()
    {
        var style = FontStyle.Regular;
        if (_titleFontBold) style |= FontStyle.Bold;
        if (_titleFontItalic) style |= FontStyle.Italic;
        try { return new Font(_titleFontFamily, _titleFontSize, style); }
        catch (ArgumentException) { return new Font("Segoe UI", _titleFontSize, style); }
    }

    private string GetTitleFontDisplayName()
    {
        var style = _titleFontBold && _titleFontItalic ? "Bold Italic"
                  : _titleFontBold ? "Bold"
                  : _titleFontItalic ? "Italic"
                  : "Regular";
        return $"{_titleFontFamily}, {_titleFontSize:0.#}pt, {style}";
    }

    private void txtName_TextChanged(object? sender, EventArgs e)
    {
        UpdatePreview();
        CommitPreview();
    }

    private void nudColumnWidth_ValueChanged(object? sender, EventArgs e) => CommitPreview();

    private void chkIsCompletion_CheckedChanged(object? sender, EventArgs e) => CommitPreview();

    private void chkAutoTitleColor_CheckedChanged(object? sender, EventArgs e)
    {
        _autoTitleColor = chkAutoTitleColor.Checked;
        UpdateTitleColorControlsEnabled();
        UpdatePreview();
        CommitPreview();
    }

    private void UpdateTitleColorControlsEnabled()
    {
        panelTitleColors.Enabled = !_autoTitleColor;
        btnTitleCustomColor.Enabled = !_autoTitleColor;
    }

    private void btnCustomColor_Click(object? sender, EventArgs e)
    {
        using var dlg = new ColorDialog { Color = _headerColor, FullOpen = true };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        _headerColor = dlg.Color;
        BuildHeaderColorPalette();
        CommitPreview();
    }

    private void btnCanvasCustomColor_Click(object? sender, EventArgs e)
    {
        using var dlg = new ColorDialog { Color = _canvasColor, FullOpen = true };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        _canvasColor = dlg.Color;
        BuildCanvasColorPalette();
        CommitPreview();
    }

    private void btnTitleCustomColor_Click(object? sender, EventArgs e)
    {
        using var dlg = new ColorDialog { Color = _titleColor, FullOpen = true };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        _titleColor = dlg.Color;
        BuildTitleColorPalette();
        CommitPreview();
    }

    private void btnTitleFont_Click(object? sender, EventArgs e)
    {
        using var previewFont = CreatePreviewFont();
        using var dlg = new FontDialog
        {
            Font = previewFont,
            ShowEffects = true,
            ShowColor = false,
            MinSize = 7,
            MaxSize = 24
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        _titleFontFamily = dlg.Font.FontFamily.Name;
        _titleFontSize = dlg.Font.Size;
        _titleFontBold = dlg.Font.Bold;
        _titleFontItalic = dlg.Font.Italic;
        CommitPreview();
    }

    private void ApplyToColumn()
    {
        _column.Name = txtName.Text.Trim();
        _column.ColumnWidth = (int)nudColumnWidth.Value;
        _column.HeaderColorHex = ColorToHex(_headerColor);
        _column.CanvasColorHex = ColorToHex(_canvasColor);
        _column.TitleFontFamily = _titleFontFamily;
        _column.TitleFontSize = _titleFontSize;
        _column.TitleFontBold = _titleFontBold;
        _column.TitleFontItalic = _titleFontItalic;
        _column.TitleColorHex = _autoTitleColor ? null : ColorToHex(_titleColor);
        _column.IsCompletionColumn = chkIsCompletion.Checked;
    }

    private void CommitPreview()
    {
        if (_loading) return;
        UpdatePreview();
        ApplyToColumn();
        PreviewChanged?.Invoke(this, EventArgs.Empty);
    }

    private void RestoreSnapshot()
    {
        _snapshot.ApplyTo(_column);
        _headerColor = ColorTranslator.FromHtml(_column.HeaderColorHex);
        _canvasColor = _column.GetCanvasColor();
        _titleFontFamily = _column.TitleFontFamily;
        _titleFontSize = _column.TitleFontSize;
        _titleFontBold = _column.TitleFontBold;
        _titleFontItalic = _column.TitleFontItalic;
        _autoTitleColor = string.IsNullOrWhiteSpace(_column.TitleColorHex);
        _titleColor = _autoTitleColor
            ? _column.ResolveTitleColor(_headerColor)
            : ColorTranslator.FromHtml(_column.TitleColorHex!);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (DialogResult != DialogResult.OK)
        {
            RestoreSnapshot();
            PreviewChanged?.Invoke(this, EventArgs.Empty);
        }

        base.OnFormClosing(e);
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtName.Text))
        {
            MessageBox.Show("컬럼 이름을 입력하세요.", "입력 오류",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            txtName.Focus();
            return;
        }

        ApplyToColumn();
        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }

    private static string ColorToHex(Color color)
        => $"#{color.R:X2}{color.G:X2}{color.B:X2}";

    private static Color ResolveAutoTitleColor(Color headerBackground)
    {
        double lum = (0.299 * headerBackground.R + 0.587 * headerBackground.G + 0.114 * headerBackground.B) / 255;
        return lum < 0.5 ? Color.White : Color.Black;
    }

    private readonly record struct ColumnSettingsSnapshot(
        string Name,
        int ColumnWidth,
        string HeaderColorHex,
        string CanvasColorHex,
        string TitleFontFamily,
        float TitleFontSize,
        bool TitleFontBold,
        bool TitleFontItalic,
        string? TitleColorHex,
        bool IsCompletionColumn)
    {
        public static ColumnSettingsSnapshot Capture(KanbanColumn column) => new(
            column.Name,
            column.ColumnWidth,
            column.HeaderColorHex,
            column.CanvasColorHex,
            column.TitleFontFamily,
            column.TitleFontSize,
            column.TitleFontBold,
            column.TitleFontItalic,
            column.TitleColorHex,
            column.IsCompletionColumn);

        public void ApplyTo(KanbanColumn column)
        {
            column.Name = Name;
            column.ColumnWidth = ColumnWidth;
            column.HeaderColorHex = HeaderColorHex;
            column.CanvasColorHex = CanvasColorHex;
            column.TitleFontFamily = TitleFontFamily;
            column.TitleFontSize = TitleFontSize;
            column.TitleFontBold = TitleFontBold;
            column.TitleFontItalic = TitleFontItalic;
            column.TitleColorHex = TitleColorHex;
            column.IsCompletionColumn = IsCompletionColumn;
        }
    }
}
