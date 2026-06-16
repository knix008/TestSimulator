using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;
using System.Drawing.Drawing2D;

namespace MyAgileBoardWinV10.Forms;

public partial class CardEditForm : Form
{
    private readonly KanbanCard _card;
    private Color _selectedColor;
    private CardTextStyle _titleStyle = new();
    private Control? _activeTextTarget;
    private bool _suppressToolbarEvents;

    private MenuStrip menuCardEdit = null!;
    private ToolStripMenuItem menuInsert = null!;
    private ToolStripMenuItem menuInsertSymbol = null!;
    private Label lblTitleFormat = null!;
    private ToolStrip toolStripTitleFormat = null!;
    private ToolStripButton tsbTitleFont = null!;
    private ToolStripComboBox tscTitleFontSize = null!;
    private ToolStripButton tsbTitleTextColor = null!;
    private ToolStripButton tsbTitleBackColor = null!;
    private ToolStripButton tsbTitleBold = null!;
    private ToolStripButton tsbTitleItalic = null!;
    private ToolStripButton tsbTitleUnderline = null!;
    private ToolStripButton tsbTitleStrikeout = null!;

    private Label lblDescriptionFormat = null!;
    private ToolStrip toolStripDescFormat = null!;
    private ToolStripButton tsbDescFont = null!;
    private ToolStripComboBox tscDescFontSize = null!;
    private ToolStripButton tsbDescTextColor = null!;
    private ToolStripButton tsbDescBackColor = null!;
    private ToolStripButton tsbDescBold = null!;
    private ToolStripButton tsbDescItalic = null!;
    private ToolStripButton tsbDescUnderline = null!;
    private ToolStripButton tsbDescStrikeout = null!;
    private ToolStripSeparator tsDescSep1 = null!;
    private ToolStripButton tsbDescInsertSymbol = null!;

    private ComboBox cmbSizePreset = null!;
    private NumericUpDown nudCardWidth = null!;
    private NumericUpDown nudCardHeight = null!;
    private NumericUpDown nudRotation = null!;
    private Button btnRotateLeft = null!;
    private Button btnRotateRight = null!;
    private Button btnRotateReset = null!;
    private Panel panelMemoSizePreview = null!;
    private Label lblCardSize = null!;
    private Label lblWidth = null!;
    private Label lblHeight = null!;
    private Label lblRotation = null!;
    private Label lblMemoPreview = null!;

    private const int FormPad = 12;
    private const int RowGap = 8;
    private const int LabelGap = 2;
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

    public CardEditForm(KanbanCard card)
    {
        _card = card;
        _selectedColor = card.CardColor;
        _titleStyle = card.TitleStyle?.Clone() ?? new CardTextStyle();
        InitializeComponent();
        SetupMenuAndFormatToolbar();
        SetupSizeControls();
        LayoutFormContent();
        Load += (_, _) => LayoutFormContent();
        LoadFromCard();
    }

    private void SetupMenuAndFormatToolbar()
    {
        menuCardEdit = new MenuStrip();
        menuInsert = new ToolStripMenuItem("삽입(&I)");
        menuInsertSymbol = new ToolStripMenuItem("특수문자 / 이모티콘(&S)...");
        menuInsertSymbol.Click += (_, _) => InsertSymbol();
        menuInsert.DropDownItems.Add(menuInsertSymbol);
        menuCardEdit.Items.Add(menuInsert);
        menuCardEdit.Dock = DockStyle.Top;
        Controls.Add(menuCardEdit);
        MainMenuStrip = menuCardEdit;

        lblTitleFormat = new Label
        {
            Text = "제목 글꼴",
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            AutoSize = true
        };

        toolStripTitleFormat = CreateTitleFormatToolbar();

        lblDescriptionFormat = new Label
        {
            Text = "설명 글꼴",
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            AutoSize = true
        };

        toolStripDescFormat = CreateDescriptionFormatToolbar();

        Controls.AddRange(new Control[]
        {
            lblTitleFormat, toolStripTitleFormat,
            lblDescriptionFormat, toolStripDescFormat
        });
    }

    private ToolStrip CreateTitleFormatToolbar()
    {
        var strip = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, TabIndex = 1 };

        tsbTitleFont = new ToolStripButton("글꼴") { DisplayStyle = ToolStripItemDisplayStyle.Text, ToolTipText = "제목 글꼴 선택" };
        tsbTitleFont.Click += (_, _) => PickTitleFont();

        tscTitleFontSize = new ToolStripComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 52 };
        foreach (var size in FontSizes)
            tscTitleFontSize.Items.Add(size.ToString("0.#"));
        tscTitleFontSize.SelectedIndexChanged += (_, _) => ApplyTitleFontSizeFromCombo();

        tsbTitleTextColor = new ToolStripButton("A") { Font = new Font("Segoe UI", 9f, FontStyle.Bold), ForeColor = Color.Red, ToolTipText = "제목 글자 색" };
        tsbTitleTextColor.Click += (_, _) => PickTitleTextColor();

        tsbTitleBackColor = new ToolStripButton("▮") { ToolTipText = "제목 글자 배경" };
        tsbTitleBackColor.Click += (_, _) => PickTitleBackColor();

        tsbTitleBold = new ToolStripButton("B") { Font = new Font("Segoe UI", 9f, FontStyle.Bold), ToolTipText = "제목 굵게", CheckOnClick = true };
        tsbTitleBold.Click += (_, _) => ToggleTitleBold();

        tsbTitleItalic = new ToolStripButton("I") { Font = new Font("Segoe UI", 9f, FontStyle.Italic), ToolTipText = "제목 기울임", CheckOnClick = true };
        tsbTitleItalic.Click += (_, _) => ToggleTitleItalic();

        tsbTitleUnderline = new ToolStripButton("U") { Font = new Font("Segoe UI", 9f, FontStyle.Underline), ToolTipText = "제목 밑줄", CheckOnClick = true };
        tsbTitleUnderline.Click += (_, _) => ToggleTitleUnderline();

        tsbTitleStrikeout = new ToolStripButton("S") { Font = new Font("Segoe UI", 9f, FontStyle.Strikeout), ToolTipText = "제목 취소선", CheckOnClick = true };
        tsbTitleStrikeout.Click += (_, _) => ToggleTitleStrikeout();

        strip.Items.AddRange(new ToolStripItem[]
        {
            tsbTitleFont, tscTitleFontSize, tsbTitleTextColor, tsbTitleBackColor,
            tsbTitleBold, tsbTitleItalic, tsbTitleUnderline, tsbTitleStrikeout
        });

        return strip;
    }

    private ToolStrip CreateDescriptionFormatToolbar()
    {
        var strip = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, TabIndex = 3 };

        tsbDescFont = new ToolStripButton("글꼴") { DisplayStyle = ToolStripItemDisplayStyle.Text, ToolTipText = "설명 글꼴 선택" };
        tsbDescFont.Click += (_, _) => PickDescriptionFont();

        tscDescFontSize = new ToolStripComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 52 };
        foreach (var size in FontSizes)
            tscDescFontSize.Items.Add(size.ToString("0.#"));
        tscDescFontSize.SelectedIndexChanged += (_, _) => ApplyDescriptionFontSizeFromCombo();

        tsbDescTextColor = new ToolStripButton("A") { Font = new Font("Segoe UI", 9f, FontStyle.Bold), ForeColor = Color.Red, ToolTipText = "설명 글자 색" };
        tsbDescTextColor.Click += (_, _) => PickDescriptionTextColor();

        tsbDescBackColor = new ToolStripButton("▮") { ToolTipText = "설명 글자 배경" };
        tsbDescBackColor.Click += (_, _) => PickDescriptionBackColor();

        tsbDescBold = new ToolStripButton("B") { Font = new Font("Segoe UI", 9f, FontStyle.Bold), ToolTipText = "설명 굵게", CheckOnClick = true };
        tsbDescBold.Click += (_, _) => ToggleDescriptionBold();

        tsbDescItalic = new ToolStripButton("I") { Font = new Font("Segoe UI", 9f, FontStyle.Italic), ToolTipText = "설명 기울임", CheckOnClick = true };
        tsbDescItalic.Click += (_, _) => ToggleDescriptionItalic();

        tsbDescUnderline = new ToolStripButton("U") { Font = new Font("Segoe UI", 9f, FontStyle.Underline), ToolTipText = "설명 밑줄", CheckOnClick = true };
        tsbDescUnderline.Click += (_, _) => ToggleDescriptionUnderline();

        tsbDescStrikeout = new ToolStripButton("S") { Font = new Font("Segoe UI", 9f, FontStyle.Strikeout), ToolTipText = "설명 취소선", CheckOnClick = true };
        tsbDescStrikeout.Click += (_, _) => ToggleDescriptionStrikeout();

        tsDescSep1 = new ToolStripSeparator();

        tsbDescInsertSymbol = new ToolStripButton("Ω") { ToolTipText = "특수문자 / 이모티콘 삽입" };
        tsbDescInsertSymbol.Click += (_, _) => InsertSymbolIntoDescription();

        strip.Items.AddRange(new ToolStripItem[]
        {
            tsbDescFont, tscDescFontSize, tsbDescTextColor, tsbDescBackColor,
            tsbDescBold, tsbDescItalic, tsbDescUnderline, tsbDescStrikeout,
            tsDescSep1, tsbDescInsertSymbol
        });

        return strip;
    }

    private void SetupSizeControls()
    {
        lblCardSize = new Label
        {
            Text = "메모 크기",
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            AutoSize = true
        };

        cmbSizePreset = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            TabIndex = 12
        };
        cmbSizePreset.Items.AddRange(new object[]
        {
            "자동 (내용/컬럼 너비)",
            "작은 메모",
            "중간 메모",
            "큰 메모",
            "넓은 메모 (컬럼 전체)",
            "사용자 지정"
        });
        cmbSizePreset.SelectedIndexChanged += (_, _) => OnSizePresetChanged();

        lblWidth = new Label { Text = "너비", AutoSize = true };
        nudCardWidth = new NumericUpDown
        {
            Minimum = CardSizeDefaults.MinWidth,
            Maximum = 400,
            Value = 150,
            TabIndex = 13
        };
        nudCardWidth.ValueChanged += (_, _) => UpdateMemoSizePreview();

        lblHeight = new Label { Text = "높이", AutoSize = true };
        nudCardHeight = new NumericUpDown
        {
            Minimum = CardSizeDefaults.MinHeight,
            Maximum = 300,
            Value = 90,
            TabIndex = 14
        };
        nudCardHeight.ValueChanged += (_, _) => UpdateMemoSizePreview();

        lblRotation = new Label { Text = "회전(°)", AutoSize = true };
        nudRotation = new NumericUpDown
        {
            Minimum = (decimal)CardCanvasHelper.MinRotation,
            Maximum = (decimal)CardCanvasHelper.MaxRotation,
            DecimalPlaces = 0,
            Value = 0,
            TabIndex = 15
        };
        nudRotation.ValueChanged += (_, _) => UpdateMemoSizePreview();

        btnRotateLeft = new Button
        {
            Text = "↺",
            Size = new Size(28, 23),
            TabIndex = 16,
            FlatStyle = FlatStyle.System
        };
        btnRotateLeft.Click += (_, _) => AdjustRotationInForm(-CardCanvasHelper.RotationStep);

        btnRotateRight = new Button
        {
            Text = "↻",
            Size = new Size(28, 23),
            TabIndex = 17,
            FlatStyle = FlatStyle.System
        };
        btnRotateRight.Click += (_, _) => AdjustRotationInForm(CardCanvasHelper.RotationStep);

        btnRotateReset = new Button
        {
            Text = "0°",
            Size = new Size(32, 23),
            TabIndex = 18,
            FlatStyle = FlatStyle.System
        };
        btnRotateReset.Click += (_, _) =>
        {
            nudRotation.Value = 0;
            UpdateMemoSizePreview();
        };

        panelMemoSizePreview = new Panel
        {
            BackColor = Color.WhiteSmoke,
            BorderStyle = BorderStyle.FixedSingle,
            Size = new Size(80, 36)
        };
        panelMemoSizePreview.Paint += PanelMemoSizePreview_Paint;

        lblMemoPreview = new Label
        {
            Text = "크기 미리보기",
            Font = new Font("Segoe UI", 7.5f),
            ForeColor = Color.DimGray,
            AutoSize = true
        };

        Controls.AddRange(new Control[]
        {
            lblCardSize, cmbSizePreset, lblWidth, nudCardWidth, lblHeight, nudCardHeight,
            lblRotation, nudRotation, btnRotateLeft, btnRotateRight, btnRotateReset,
            panelMemoSizePreview, lblMemoPreview
        });
    }

    private void LayoutFormContent()
    {
        const int inputH = 23;
        const int descH = 88;
        const int sideColW = 92;
        int swatchCell = ColorSwatchSize + ColorSwatchMargin * 2;
        int paletteW = ColorPaletteColumns * swatchCell;
        int colorPanelH = ColorPaletteRows * swatchCell + 4;

        menuCardEdit.PerformLayout();
        PerformLayout();

        int formW = 480;
        int contentW = formW - FormPad * 2;
        int y = menuCardEdit.Bottom + RowGap;

        lblTitle.Location = new Point(FormPad, y);
        y += lblTitle.Height + LabelGap;

        lblTitleFormat.Location = new Point(FormPad, y);
        y += lblTitleFormat.Height + LabelGap;

        toolStripTitleFormat.Location = new Point(FormPad, y);
        toolStripTitleFormat.Width = contentW;
        y += toolStripTitleFormat.Height + LabelGap;

        txtTitle.Location = new Point(FormPad, y);
        txtTitle.Size = new Size(contentW, inputH);
        y += inputH + RowGap;

        lblDescription.Location = new Point(FormPad, y);
        y += lblDescription.Height + LabelGap;

        lblDescriptionFormat.Location = new Point(FormPad, y);
        y += lblDescriptionFormat.Height + LabelGap;

        toolStripDescFormat.Location = new Point(FormPad, y);
        toolStripDescFormat.Width = contentW;
        y += toolStripDescFormat.Height + LabelGap;

        rtbDescription.Location = new Point(FormPad, y);
        rtbDescription.Size = new Size(contentW, descH);
        y += descH + RowGap;

        int colGap = 8;
        int colW = (contentW - colGap * 2) / 3;
        lblAssignee.Location = new Point(FormPad, y);
        lblPriority.Location = new Point(FormPad + colW + colGap, y);
        lblPoints.Location = new Point(FormPad + (colW + colGap) * 2, y);
        y += lblAssignee.Height + LabelGap;

        txtAssignee.Location = new Point(FormPad, y);
        txtAssignee.Size = new Size(colW, inputH);
        cmbPriority.Location = new Point(FormPad + colW + colGap, y);
        cmbPriority.Size = new Size(colW, inputH);
        nudPoints.Location = new Point(FormPad + (colW + colGap) * 2, y);
        nudPoints.Size = new Size(colW, inputH);
        y += inputH + RowGap;

        chkDueDate.Location = new Point(FormPad, y + 2);
        dtpDueDate.Location = new Point(FormPad + chkDueDate.Width + colGap, y);
        dtpDueDate.Size = new Size(contentW - chkDueDate.Width - colGap, inputH);
        y += inputH + RowGap;

        lblTags.Location = new Point(FormPad, y);
        y += lblTags.Height + LabelGap;

        txtTags.Location = new Point(FormPad, y);
        txtTags.Size = new Size(contentW, inputH);
        y += inputH + RowGap;

        lblColor.Location = new Point(FormPad, y);
        y += lblColor.Height + LabelGap;

        panelColors.Location = new Point(FormPad, y);
        panelColors.Size = new Size(paletteW, colorPanelH);
        panelColors.FlowDirection = FlowDirection.LeftToRight;
        panelColors.WrapContents = true;

        int sideX = FormPad + paletteW + colGap;
        btnCustomColor.Location = new Point(sideX, y);
        btnCustomColor.Size = new Size(sideColW, 28);
        panelPreview.Location = new Point(sideX, y + btnCustomColor.Height + 6);
        panelPreview.Size = new Size(sideColW, 34);
        lblPreview.Location = new Point(sideX, panelPreview.Bottom + 2);
        y += colorPanelH + RowGap;

        lblCardSize.Location = new Point(FormPad, y);
        y += lblCardSize.Height + LabelGap;

        int numW = 58;
        int numStartX = formW - FormPad - (numW * 3 + colGap * 2);
        lblWidth.Location = new Point(numStartX, y);
        lblHeight.Location = new Point(numStartX + numW + colGap, y);
        lblRotation.Location = new Point(numStartX + (numW + colGap) * 2, y);
        y += lblWidth.Height + LabelGap;

        cmbSizePreset.Location = new Point(FormPad, y);
        cmbSizePreset.Size = new Size(Math.Max(140, numStartX - FormPad - colGap), inputH);
        nudCardWidth.Location = new Point(numStartX, y);
        nudCardWidth.Size = new Size(numW, inputH);
        nudCardHeight.Location = new Point(numStartX + numW + colGap, y);
        nudCardHeight.Size = new Size(numW, inputH);
        nudRotation.Location = new Point(numStartX + (numW + colGap) * 2, y);
        nudRotation.Size = new Size(numW, inputH);
        y += inputH + RowGap;

        panelMemoSizePreview.Location = new Point(FormPad, y);
        int rotateBtnY = y + (panelMemoSizePreview.Height - btnRotateLeft.Height) / 2;
        btnRotateLeft.Location = new Point(panelMemoSizePreview.Right + colGap, rotateBtnY);
        btnRotateRight.Location = new Point(btnRotateLeft.Right + 4, rotateBtnY);
        btnRotateReset.Location = new Point(btnRotateRight.Right + 4, rotateBtnY);
        lblMemoPreview.Location = new Point(FormPad, y + panelMemoSizePreview.Height + 2);
        PositionFooterButtons();
        menuCardEdit.BringToFront();
    }

    private void PositionFooterButtons()
    {
        int y = lblMemoPreview.Bottom + RowGap + 4;
        btnCancel.Location = new Point(480 - FormPad - btnCancel.Width, y);
        btnOk.Location = new Point(btnCancel.Left - btnOk.Width - 8, y);
        ClientSize = new Size(480, y + btnOk.Height + FormPad);
        AutoScroll = false;
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
        PositionFooterButtons();
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
