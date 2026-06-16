using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;
using System.Drawing.Drawing2D;

namespace MyAgileBoardWinV10.Forms;

public partial class CardEditForm : Form
{
    private KanbanCard _card = null!;
    private Color _selectedColor;
    private CardTextStyle _titleStyle = new();
    private Control? _activeTextTarget;
    private bool _suppressToolbarEvents;

    private const int ColorSwatchSize = 28;
    private const int ColorSwatchMargin = 2;
    private const int ColorPaletteColumns = 10;
    private const int ColorPaletteRows = 2;

    private static readonly Color[] ColorPalette =
    {
        Color.FromArgb(240, 240, 240),
        Color.FromArgb(255, 255, 255),
        Color.FromArgb(255, 190, 190),
        Color.FromArgb(255, 140, 140),
        Color.FromArgb(255, 182, 193),
        Color.FromArgb(255, 230, 140),
        Color.FromArgb(255, 210, 80),
        Color.FromArgb(255, 218, 185),
        Color.FromArgb(240, 230, 140),
        Color.FromArgb(255, 200, 155),
        Color.FromArgb(180, 235, 180),
        Color.FromArgb(130, 210, 130),
        Color.FromArgb(144, 238, 144),
        Color.FromArgb(165, 225, 225),
        Color.FromArgb(180, 215, 255),
        Color.FromArgb(130, 185, 255),
        Color.FromArgb(135, 206, 235),
        Color.FromArgb(220, 185, 255),
        Color.FromArgb(221, 160, 221),
        Color.FromArgb(200, 200, 200),
    };

    private static readonly float[] FontSizes = [8f, 9f, 10f, 11f, 12f, 14f, 16f, 18f, 20f];

    public CardEditForm()
    {
        InitializeComponent();
        InitializeFormatToolbarComboBoxes();
        InitializeSizePresetComboBox();
    }

    public CardEditForm(KanbanCard card) : this()
    {
        _card = card;
        _selectedColor = card.CardColor;
        _titleStyle = card.TitleStyle?.Clone() ?? new CardTextStyle();
        LoadFromCard();
    }

    private void InitializeFormatToolbarComboBoxes()
    {
        foreach (var size in FontSizes)
        {
            tscTitleFontSize.Items.Add(size.ToString("0.#"));
            tscDescFontSize.Items.Add(size.ToString("0.#"));
        }
    }

    private void InitializeSizePresetComboBox()
    {
        cmbSizePreset.Items.Clear();
        cmbSizePreset.Items.AddRange(new object[]
        {
            "자동 (내용/컬럼 너비)",
            "작은 메모",
            "중간 메모",
            "큰 메모",
            "넓은 메모 (컬럼 전체)",
            "사용자 지정"
        });
    }

    private void menuInsertSymbol_Click(object? sender, EventArgs e) => InsertSymbol();
    private void tsbTitleFont_Click(object? sender, EventArgs e) => PickTitleFont();
    private void tscTitleFontSize_SelectedIndexChanged(object? sender, EventArgs e) => ApplyTitleFontSizeFromCombo();
    private void tsbTitleTextColor_Click(object? sender, EventArgs e) => PickTitleTextColor();
    private void tsbTitleBackColor_Click(object? sender, EventArgs e) => PickTitleBackColor();
    private void tsbTitleBold_Click(object? sender, EventArgs e) => ToggleTitleBold();
    private void tsbTitleItalic_Click(object? sender, EventArgs e) => ToggleTitleItalic();
    private void tsbTitleUnderline_Click(object? sender, EventArgs e) => ToggleTitleUnderline();
    private void tsbTitleStrikeout_Click(object? sender, EventArgs e) => ToggleTitleStrikeout();
    private void tsbTitleInsertSymbol_Click(object? sender, EventArgs e) => InsertSymbolIntoTitle();
    private void tsbDescFont_Click(object? sender, EventArgs e) => PickDescriptionFont();
    private void tscDescFontSize_SelectedIndexChanged(object? sender, EventArgs e) => ApplyDescriptionFontSizeFromCombo();
    private void tsbDescTextColor_Click(object? sender, EventArgs e) => PickDescriptionTextColor();
    private void tsbDescBackColor_Click(object? sender, EventArgs e) => PickDescriptionBackColor();
    private void tsbDescBold_Click(object? sender, EventArgs e) => ToggleDescriptionBold();
    private void tsbDescItalic_Click(object? sender, EventArgs e) => ToggleDescriptionItalic();
    private void tsbDescUnderline_Click(object? sender, EventArgs e) => ToggleDescriptionUnderline();
    private void tsbDescStrikeout_Click(object? sender, EventArgs e) => ToggleDescriptionStrikeout();
    private void tsbDescInsertSymbol_Click(object? sender, EventArgs e) => InsertSymbolIntoDescription();
    private void cmbSizePreset_SelectedIndexChanged(object? sender, EventArgs e) => OnSizePresetChanged();
    private void nudCardSize_ValueChanged(object? sender, EventArgs e) => UpdateMemoSizePreview();
    private void btnRotateLeft_Click(object? sender, EventArgs e) => AdjustRotationInForm(-CardCanvasHelper.RotationStep);
    private void btnRotateRight_Click(object? sender, EventArgs e) => AdjustRotationInForm(CardCanvasHelper.RotationStep);
    private void btnRotateReset_Click(object? sender, EventArgs e)
    {
        nudRotation.Value = 0;
        UpdateMemoSizePreview();
    }

    private void rtbDescription_SelectionChanged(object? sender, EventArgs e)
    {
        if (_activeTextTarget == rtbDescription)
            SyncDescriptionToolbar();
    }

    private void OnSizePresetChanged()
    {
        var preset = (CardSizePreset)cmbSizePreset.SelectedIndex;
        if (preset != CardSizePreset.Custom && preset != CardSizePreset.Auto)
        {
            var (w, h) = CardSizeDefaults.GetPresetSize(preset);
            if (w > 0) nudCardWidth.Value = w;
            if (h > 0) nudCardHeight.Value = h;
        }

        bool custom = preset == CardSizePreset.Custom;
        nudCardWidth.Enabled = custom;
        nudCardHeight.Enabled = custom || preset == CardSizePreset.Wide;

        UpdateMemoSizePreview();
    }

    private void UpdateMemoSizePreview()
    {
        var preset = (CardSizePreset)cmbSizePreset.SelectedIndex;
        int w = preset == CardSizePreset.Auto || preset == CardSizePreset.Wide
            ? 100
            : (int)nudCardWidth.Value;
        int h = preset == CardSizePreset.Auto ? 56 : (int)nudCardHeight.Value;
        float scale = Math.Min(100f / Math.Max(w, 1), 30f / Math.Max(h, 1));
        int pw = Math.Max(24, (int)(w * scale));
        int ph = Math.Max(16, (int)(h * scale));
        panelMemoSizePreview.Size = new Size(pw + 2, ph + 2);
        panelMemoSizePreview.Invalidate();
        lblMemoPreview.Location = new Point(panelMemoSizePreview.Left, panelMemoSizePreview.Bottom + 2);
    }

    private void AdjustRotationInForm(float delta)
    {
        var next = (float)nudRotation.Value + delta;
        nudRotation.Value = (decimal)Math.Clamp(next, CardCanvasHelper.MinRotation, CardCanvasHelper.MaxRotation);
    }

    private void PanelMemoSizePreview_Paint(object? sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(panelMemoSizePreview.BackColor);

        var inner = panelMemoSizePreview.ClientRectangle;
        inner.Inflate(-3, -3);
        if (inner.Width <= 4 || inner.Height <= 4) return;

        float angle = (float)nudRotation.Value;
        g.TranslateTransform(inner.X + inner.Width / 2f, inner.Y + inner.Height / 2f);
        g.RotateTransform(angle);
        var rect = new Rectangle(-inner.Width / 2, -inner.Height / 2, inner.Width, inner.Height);
        using var fill = new SolidBrush(_selectedColor);
        using var border = new Pen(Color.FromArgb(120, 80, 80, 80));
        g.FillRectangle(fill, rect);
        g.DrawRectangle(border, rect);
        g.ResetTransform();
    }

    protected override bool ProcessDialogKey(Keys keyData)
    {
        if (keyData == Keys.Enter && rtbDescription.Focused)
            return false;
        return base.ProcessDialogKey(keyData);
    }

    private void LoadFromCard()
    {
        txtTitle.Text = _card.Title;
        txtAssignee.Text = _card.Assignee;
        txtTags.Text = _card.Tags;
        cmbPriority.SelectedItem = _card.Priority.ToString();
        nudPoints.Value = Math.Clamp(_card.Points, 0, 100);

        if (!string.IsNullOrWhiteSpace(_card.DescriptionRtf))
        {
            try { rtbDescription.Rtf = _card.DescriptionRtf; }
            catch (ArgumentException) { rtbDescription.Text = _card.Description; }
        }
        else
        {
            rtbDescription.Text = _card.Description;
        }

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

        ApplyTitleStyleToTextBox();
        SyncTitleToolbar();
        SyncDescriptionToolbar();
        BuildColorPalette();

        cmbSizePreset.SelectedIndex = Math.Clamp((int)_card.SizePreset, 0, cmbSizePreset.Items.Count - 1);
        nudCardWidth.Value = Math.Clamp(_card.CustomWidth > 0 ? _card.CustomWidth : 150, nudCardWidth.Minimum, nudCardWidth.Maximum);
        nudCardHeight.Value = Math.Clamp(_card.CustomHeight > 0 ? _card.CustomHeight : 90, nudCardHeight.Minimum, nudCardHeight.Maximum);
        nudRotation.Value = (decimal)Math.Clamp(_card.Rotation, CardCanvasHelper.MinRotation, CardCanvasHelper.MaxRotation);
        OnSizePresetChanged();

        _activeTextTarget = txtTitle;
    }

    private void TextTarget_Enter(object? sender, EventArgs e)
    {
        _activeTextTarget = sender as Control;
        if (_activeTextTarget == txtTitle)
            SyncTitleToolbar();
        else if (_activeTextTarget == rtbDescription)
            SyncDescriptionToolbar();
    }

    private void SyncTitleToolbar()
    {
        _suppressToolbarEvents = true;
        try
        {
            tscTitleFontSize.SelectedItem = _titleStyle.FontSize.ToString("0.#");
            tsbTitleBold.Checked = _titleStyle.Bold;
            tsbTitleItalic.Checked = _titleStyle.Italic;
            tsbTitleUnderline.Checked = _titleStyle.Underline;
            tsbTitleStrikeout.Checked = _titleStyle.Strikeout;
            tsbTitleTextColor.ForeColor = _titleStyle.GetTextColor();
            tsbTitleBackColor.BackColor = _titleStyle.GetBackgroundColor() ?? Color.White;
        }
        finally
        {
            _suppressToolbarEvents = false;
        }
    }

    private void SyncDescriptionToolbar()
    {
        _suppressToolbarEvents = true;
        try
        {
            var font = rtbDescription.SelectionFont ?? rtbDescription.Font;
            tscDescFontSize.SelectedItem = font.Size.ToString("0.#");
            tsbDescBold.Checked = font.Bold;
            tsbDescItalic.Checked = font.Italic;
            tsbDescUnderline.Checked = font.Underline;
            tsbDescStrikeout.Checked = font.Strikeout;
            tsbDescTextColor.ForeColor = rtbDescription.SelectionColor;
            tsbDescBackColor.BackColor = rtbDescription.SelectionBackColor;
        }
        finally
        {
            _suppressToolbarEvents = false;
        }
    }

    private void ApplyTitleStyleToTextBox()
    {
        txtTitle.Font = _titleStyle.CreateFont();
        txtTitle.ForeColor = _titleStyle.GetTextColor();
        var bg = _titleStyle.GetBackgroundColor();
        txtTitle.BackColor = bg ?? SystemColors.Window;
    }

    private void PickTitleFont()
    {
        using var dlg = new FontDialog { Font = _titleStyle.CreateFont(), ShowEffects = true };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        _titleStyle.FontFamily = dlg.Font.FontFamily.Name;
        _titleStyle.FontSize = dlg.Font.Size;
        _titleStyle.Bold = dlg.Font.Bold;
        _titleStyle.Italic = dlg.Font.Italic;
        _titleStyle.Underline = dlg.Font.Underline;
        _titleStyle.Strikeout = dlg.Font.Strikeout;
        ApplyTitleStyleToTextBox();
        SyncTitleToolbar();
    }

    private void ApplyTitleFontSizeFromCombo()
    {
        if (_suppressToolbarEvents) return;
        if (tscTitleFontSize.SelectedItem is not string s || !float.TryParse(s, out var size)) return;
        _titleStyle.FontSize = size;
        ApplyTitleStyleToTextBox();
    }

    private void PickTitleTextColor()
    {
        using var dlg = new ColorDialog { FullOpen = true, Color = _titleStyle.GetTextColor() };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        _titleStyle.ColorHex = CardTextHelper.ColorToHex(dlg.Color);
        ApplyTitleStyleToTextBox();
        SyncTitleToolbar();
    }

    private void PickTitleBackColor()
    {
        using var dlg = new ColorDialog { FullOpen = true, Color = _titleStyle.GetBackgroundColor() ?? Color.White };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        _titleStyle.BackgroundColorHex = CardTextHelper.ColorToHex(dlg.Color);
        ApplyTitleStyleToTextBox();
        SyncTitleToolbar();
    }

    private void ToggleTitleBold()
    {
        _titleStyle.Bold = !_titleStyle.Bold;
        ApplyTitleStyleToTextBox();
        SyncTitleToolbar();
    }

    private void ToggleTitleItalic()
    {
        _titleStyle.Italic = !_titleStyle.Italic;
        ApplyTitleStyleToTextBox();
        SyncTitleToolbar();
    }

    private void ToggleTitleUnderline()
    {
        _titleStyle.Underline = !_titleStyle.Underline;
        ApplyTitleStyleToTextBox();
        SyncTitleToolbar();
    }

    private void ToggleTitleStrikeout()
    {
        _titleStyle.Strikeout = !_titleStyle.Strikeout;
        ApplyTitleStyleToTextBox();
        SyncTitleToolbar();
    }

    private void PickDescriptionFont()
    {
        using var dlg = new FontDialog { Font = rtbDescription.SelectionFont ?? rtbDescription.Font, ShowEffects = true };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        CardTextHelper.ApplySelectionStyle(rtbDescription, dlg.Font.FontFamily.Name, dlg.Font.Size,
            null, null, dlg.Font.Bold, dlg.Font.Italic, dlg.Font.Underline, dlg.Font.Strikeout);
        SyncDescriptionToolbar();
    }

    private void ApplyDescriptionFontSizeFromCombo()
    {
        if (_suppressToolbarEvents) return;
        if (tscDescFontSize.SelectedItem is not string s || !float.TryParse(s, out var size)) return;
        CardTextHelper.ApplySelectionStyle(rtbDescription, null, size, null, null, null, null, null, null);
    }

    private void PickDescriptionTextColor()
    {
        using var dlg = new ColorDialog { FullOpen = true, Color = rtbDescription.SelectionColor };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        CardTextHelper.ApplySelectionStyle(rtbDescription, null, null, dlg.Color, null, null, null, null, null);
        SyncDescriptionToolbar();
    }

    private void PickDescriptionBackColor()
    {
        using var dlg = new ColorDialog { FullOpen = true, Color = rtbDescription.SelectionBackColor };
        if (dlg.ShowDialog() != DialogResult.OK) return;
        CardTextHelper.ApplySelectionStyle(rtbDescription, null, null, null, dlg.Color, null, null, null, null);
        SyncDescriptionToolbar();
    }

    private void ToggleDescriptionBold()
    {
        var font = rtbDescription.SelectionFont ?? rtbDescription.Font;
        CardTextHelper.ApplySelectionStyle(rtbDescription, null, null, null, null, !font.Bold, null, null, null);
        SyncDescriptionToolbar();
    }

    private void ToggleDescriptionItalic()
    {
        var font = rtbDescription.SelectionFont ?? rtbDescription.Font;
        CardTextHelper.ApplySelectionStyle(rtbDescription, null, null, null, null, null, !font.Italic, null, null);
        SyncDescriptionToolbar();
    }

    private void ToggleDescriptionUnderline()
    {
        var font = rtbDescription.SelectionFont ?? rtbDescription.Font;
        CardTextHelper.ApplySelectionStyle(rtbDescription, null, null, null, null, null, null, !font.Underline, null);
        SyncDescriptionToolbar();
    }

    private void ToggleDescriptionStrikeout()
    {
        var font = rtbDescription.SelectionFont ?? rtbDescription.Font;
        CardTextHelper.ApplySelectionStyle(rtbDescription, null, null, null, null, null, null, null, !font.Strikeout);
        SyncDescriptionToolbar();
    }

    private void InsertSymbol()
    {
        var target = _activeTextTarget ?? txtTitle;
        using var picker = new SymbolPickerForm();
        if (picker.ShowDialog(this) != DialogResult.OK || string.IsNullOrEmpty(picker.SelectedSymbol)) return;
        CardTextHelper.InsertText(target, picker.SelectedSymbol);
    }

    private void InsertSymbolIntoTitle()
    {
        _activeTextTarget = txtTitle;
        InsertSymbol();
    }

    private void InsertSymbolIntoDescription()
    {
        _activeTextTarget = rtbDescription;
        InsertSymbol();
    }

    private void BuildColorPalette()
    {
        panelColors.Controls.Clear();
        foreach (var color in ColorPalette)
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
            if (color.ToArgb() == _selectedColor.ToArgb())
                btn.BorderStyle = BorderStyle.Fixed3D;
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
        btn.BorderStyle = BorderStyle.Fixed3D;
        panelPreview.BackColor = _selectedColor;
        UpdateMemoSizePreview();
    }

    private void chkDueDate_CheckedChanged(object? sender, EventArgs e)
        => dtpDueDate.Enabled = chkDueDate.Checked;

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtTitle.Text))
        {
            MessageBox.Show("제목을 입력하세요.", "입력 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            txtTitle.Focus();
            return;
        }

        _card.Title = txtTitle.Text.Trim();
        _card.TitleStyle = _titleStyle.Clone();
        _card.Description = CardTextHelper.ExtractPlainText(rtbDescription.Rtf, rtbDescription.Text).Trim();
        _card.DescriptionRtf = string.IsNullOrWhiteSpace(rtbDescription.Text) ? null : rtbDescription.Rtf;
        _card.Assignee = txtAssignee.Text.Trim();
        _card.Tags = txtTags.Text.Trim();
        _card.Priority = Enum.Parse<Priority>(cmbPriority.SelectedItem!.ToString()!);
        _card.Points = (int)nudPoints.Value;
        _card.DueDate = chkDueDate.Checked ? dtpDueDate.Value.Date : null;
        _card.CardColor = _selectedColor;
        _card.SizePreset = (CardSizePreset)cmbSizePreset.SelectedIndex;
        _card.CustomWidth = (int)nudCardWidth.Value;
        _card.CustomHeight = (int)nudCardHeight.Value;
        _card.Rotation = (float)nudRotation.Value;

        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }

    private void btnCustomColor_Click(object? sender, EventArgs e)
    {
        using var dlg = new ColorDialog { Color = _selectedColor, FullOpen = true };
        if (dlg.ShowDialog() == DialogResult.OK)
        {
            _selectedColor = dlg.Color;
            panelPreview.BackColor = _selectedColor;
            UpdateMemoSizePreview();
        }
    }
}
