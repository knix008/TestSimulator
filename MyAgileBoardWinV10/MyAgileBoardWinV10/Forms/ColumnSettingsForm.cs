using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Forms;

public partial class ColumnSettingsForm : Form
{
    private readonly KanbanColumn _column;
    private Color _headerColor;

    private static readonly Color[] ColorPalette =
    {
        Color.FromArgb(128, 128, 128), // Gray
        Color.FromArgb(68, 114, 196),  // Blue
        Color.FromArgb(237, 125, 49),  // Orange
        Color.FromArgb(158, 73, 211),  // Purple
        Color.FromArgb(112, 173, 71),  // Green
        Color.FromArgb(231, 76, 60),   // Red
        Color.FromArgb(52, 152, 219),  // LightBlue
        Color.FromArgb(26, 188, 156),  // Teal
        Color.FromArgb(241, 196, 15),  // Yellow
        Color.FromArgb(44, 62, 80),    // DarkGray
        Color.FromArgb(189, 195, 199), // LightGray
        Color.FromArgb(255, 87, 87),   // Coral
    };

    public ColumnSettingsForm(KanbanColumn column)
    {
        _column = column;
        _headerColor = ColorTranslator.FromHtml(column.HeaderColorHex);
        InitializeComponent();
        LoadFromColumn();
    }

    private void LoadFromColumn()
    {
        txtName.Text = _column.Name;
        chkIsCompletion.Checked = _column.IsCompletionColumn;
        BuildColorPalette();
        UpdatePreview();
    }

    private void BuildColorPalette()
    {
        panelColors.Controls.Clear();
        foreach (var color in ColorPalette)
        {
            var btn = new Panel
            {
                Size = new Size(32, 32),
                BackColor = color,
                BorderStyle = BorderStyle.FixedSingle,
                Cursor = Cursors.Hand,
                Margin = new Padding(2),
                Tag = color
            };
            if (color.ToArgb() == _headerColor.ToArgb())
                btn.BorderStyle = BorderStyle.Fixed3D;

            btn.Click += ColorBtn_Click;
            panelColors.Controls.Add(btn);
        }
    }

    private void ColorBtn_Click(object? sender, EventArgs e)
    {
        if (sender is not Panel btn) return;
        _headerColor = (Color)btn.Tag!;

        foreach (Panel p in panelColors.Controls.OfType<Panel>())
            p.BorderStyle = BorderStyle.FixedSingle;
        btn.BorderStyle = BorderStyle.Fixed3D;

        UpdatePreview();
    }

    private void UpdatePreview()
    {
        panelPreview.BackColor = _headerColor;
        double lum = (0.299 * _headerColor.R + 0.587 * _headerColor.G + 0.114 * _headerColor.B) / 255;
        lblPreviewText.ForeColor = lum < 0.5 ? Color.White : Color.Black;
        lblPreviewText.Text = txtName.Text;
    }

    private void txtName_TextChanged(object sender, EventArgs e)
    {
        lblPreviewText.Text = txtName.Text;
    }

    private void btnCustomColor_Click(object sender, EventArgs e)
    {
        using var dlg = new ColorDialog { Color = _headerColor, FullOpen = true };
        if (dlg.ShowDialog() == DialogResult.OK)
        {
            _headerColor = dlg.Color;
            UpdatePreview();
        }
    }

    private void btnOk_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtName.Text))
        {
            MessageBox.Show("컬럼 이름을 입력하세요.", "입력 오류",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            txtName.Focus();
            return;
        }

        _column.Name = txtName.Text.Trim();
        _column.HeaderColorHex = $"#{_headerColor.R:X2}{_headerColor.G:X2}{_headerColor.B:X2}";
        _column.IsCompletionColumn = chkIsCompletion.Checked;

        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }
}
