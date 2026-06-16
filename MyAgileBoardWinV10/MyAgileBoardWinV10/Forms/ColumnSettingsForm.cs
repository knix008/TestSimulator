using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Forms;

public partial class ColumnSettingsForm : Form
{
    private KanbanColumn _column = null!;
    private Color _headerColor;
    private Color _titleColor;
    private string _titleFontFamily = "Segoe UI";
    private float _titleFontSize;
    private bool _titleFontBold;
    private bool _titleFontItalic;
    private bool _autoTitleColor;

    private static readonly Color[] HeaderColorPalette =
    {
        Color.FromArgb(128, 128, 128),
        Color.FromArgb(68, 114, 196),
        Color.FromArgb(237, 125, 49),
        Color.FromArgb(158, 73, 211),
        Color.FromArgb(112, 173, 71),
        Color.FromArgb(231, 76, 60),
        Color.FromArgb(52, 152, 219),
        Color.FromArgb(26, 188, 156),
        Color.FromArgb(241, 196, 15),
        Color.FromArgb(44, 62, 80),
        Color.FromArgb(189, 195, 199),
        Color.FromArgb(255, 87, 87),
    };

    private static readonly Color[] TitleColorPalette =
    {
        Color.Black,
        Color.White,
        Color.FromArgb(51, 51, 51),
        Color.FromArgb(68, 114, 196),
        Color.FromArgb(220, 60, 60),
        Color.FromArgb(46, 125, 50),
        Color.FromArgb(237, 125, 49),
        Color.FromArgb(158, 73, 211),
    };

    public ColumnSettingsForm()
    {
        InitializeComponent();
    }

    public ColumnSettingsForm(KanbanColumn column) : this()
    {
        _column = column;
        _headerColor = ColorTranslator.FromHtml(column.HeaderColorHex);
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

    private void LoadFromColumn()
    {
        txtName.Text = _column.Name;
        nudColumnWidth.Value = Math.Clamp(_column.ColumnWidth > 0 ? _column.ColumnWidth : ColumnWidthDefaults.Default, 50, 2000);
        chkIsCompletion.Checked = _column.IsCompletionColumn;
        chkAutoTitleColor.Checked = _autoTitleColor;
        BuildHeaderColorPalette();
        BuildTitleColorPalette();
        UpdateTitleColorControlsEnabled();
        UpdatePreview();
    }

    private void BuildHeaderColorPalette()
    {
        BuildColorPalette(panelColors, HeaderColorPalette, _headerColor, ColorBtn_Click);
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
                Size = new Size(28, 28),
                BackColor = color,
                BorderStyle = BorderStyle.FixedSingle,
                Cursor = Cursors.Hand,
                Margin = new Padding(3),
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
        UpdatePreview();
    }

    private void TitleColorBtn_Click(object? sender, EventArgs e)
    {
        if (sender is not Panel btn) return;
        _titleColor = (Color)btn.Tag!;
        MarkSelectedPanel(panelTitleColors, btn);
        UpdatePreview();
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

    private void txtName_TextChanged(object? sender, EventArgs e) => UpdatePreview();

    private void chkAutoTitleColor_CheckedChanged(object? sender, EventArgs e)
    {
        _autoTitleColor = chkAutoTitleColor.Checked;
        UpdateTitleColorControlsEnabled();
        UpdatePreview();
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
        UpdatePreview();
    }

    private void btnTitleCustomColor_Click(object? sender, EventArgs e)
    {
        using var dlg = new ColorDialog { Color = _titleColor, FullOpen = true };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        _titleColor = dlg.Color;
        BuildTitleColorPalette();
        UpdatePreview();
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
        UpdatePreview();
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

        _column.Name = txtName.Text.Trim();
        _column.ColumnWidth = (int)nudColumnWidth.Value;
        _column.HeaderColorHex = ColorToHex(_headerColor);
        _column.TitleFontFamily = _titleFontFamily;
        _column.TitleFontSize = _titleFontSize;
        _column.TitleFontBold = _titleFontBold;
        _column.TitleFontItalic = _titleFontItalic;
        _column.TitleColorHex = _autoTitleColor ? null : ColorToHex(_titleColor);
        _column.IsCompletionColumn = chkIsCompletion.Checked;

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
}
