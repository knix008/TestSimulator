using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Forms;

public partial class CardEditForm : Form
{
    private readonly KanbanCard _card;
    private Color _selectedColor;

    private static readonly Color[] ColorPalette =
    {
        Color.FromArgb(240, 240, 240), // 기본 (회색)
        Color.FromArgb(255, 190, 190), // 빨강 파스텔
        Color.FromArgb(255, 230, 140), // 노랑 파스텔
        Color.FromArgb(180, 235, 180), // 초록 파스텔
        Color.FromArgb(180, 215, 255), // 파랑 파스텔
        Color.FromArgb(220, 185, 255), // 보라 파스텔
        Color.FromArgb(255, 200, 155), // 주황 파스텔
        Color.FromArgb(165, 225, 225), // 청록 파스텔
        Color.FromArgb(255, 140, 140), // 진빨강
        Color.FromArgb(255, 210, 80),  // 진노랑
        Color.FromArgb(130, 210, 130), // 진초록
        Color.FromArgb(130, 185, 255), // 진파랑
    };

    public CardEditForm(KanbanCard card)
    {
        _card = card;
        _selectedColor = card.CardColor;
        InitializeComponent();
        LoadFromCard();
    }

    private void LoadFromCard()
    {
        txtTitle.Text = _card.Title;
        txtDescription.Text = _card.Description;
        txtAssignee.Text = _card.Assignee;
        txtTags.Text = _card.Tags;
        cmbPriority.SelectedItem = _card.Priority.ToString();

        nudPoints.Value = Math.Clamp(_card.Points, 0, 100);

        if (_card.DueDate.HasValue)
        {
            chkDueDate.Checked = true;
            dtpDueDate.Value = _card.DueDate.Value;
        }
        else
        {
            chkDueDate.Checked = false;
            dtpDueDate.Enabled = false;
        }

        BuildColorPalette();
    }

    private void BuildColorPalette()
    {
        panelColors.Controls.Clear();
        foreach (var color in ColorPalette)
        {
            var btn = new Panel
            {
                Size = new Size(28, 28),
                BackColor = color,
                BorderStyle = BorderStyle.FixedSingle,
                Cursor = Cursors.Hand,
                Margin = new Padding(2),
                Tag = color
            };

            if (color.ToArgb() == _selectedColor.ToArgb())
                MarkSelected(btn);

            btn.Click += ColorBtn_Click;
            panelColors.Controls.Add(btn);
        }
    }

    private void ColorBtn_Click(object? sender, EventArgs e)
    {
        if (sender is not Panel btn) return;
        _selectedColor = (Color)btn.Tag!;

        foreach (Panel p in panelColors.Controls.OfType<Panel>())
            p.BorderStyle = BorderStyle.FixedSingle;

        MarkSelected(btn);
        panelPreview.BackColor = _selectedColor;
    }

    private static void MarkSelected(Panel btn)
    {
        btn.BorderStyle = BorderStyle.Fixed3D;
    }

    private void chkDueDate_CheckedChanged(object sender, EventArgs e)
    {
        dtpDueDate.Enabled = chkDueDate.Checked;
    }

    private void btnOk_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtTitle.Text))
        {
            MessageBox.Show("제목을 입력하세요.", "입력 오류",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            txtTitle.Focus();
            return;
        }

        _card.Title = txtTitle.Text.Trim();
        _card.Description = txtDescription.Text.Trim();
        _card.Assignee = txtAssignee.Text.Trim();
        _card.Tags = txtTags.Text.Trim();
        _card.Priority = Enum.Parse<Priority>(cmbPriority.SelectedItem!.ToString()!);
        _card.Points = (int)nudPoints.Value;
        _card.DueDate = chkDueDate.Checked ? dtpDueDate.Value.Date : null;
        _card.CardColor = _selectedColor;

        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }

    private void btnCustomColor_Click(object sender, EventArgs e)
    {
        using var dlg = new ColorDialog { Color = _selectedColor, FullOpen = true };
        if (dlg.ShowDialog() == DialogResult.OK)
        {
            _selectedColor = dlg.Color;
            panelPreview.BackColor = _selectedColor;
        }
    }
}
