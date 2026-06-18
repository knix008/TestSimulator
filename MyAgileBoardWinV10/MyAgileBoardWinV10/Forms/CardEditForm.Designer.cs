namespace MyAgileBoardWinV10.Forms;

partial class CardEditForm
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        menuCardEdit = new MenuStrip();
        menuInsert = new ToolStripMenuItem();
        menuInsertSymbol = new ToolStripMenuItem();
        lblTitle = new Label();
        txtTitle = new TextBox();
        panelTitleFormat = new Panel();
        toolStripTitleFormat = new ToolStrip();
        tsbTitleFont = new ToolStripButton();
        tscTitleFontSize = new ToolStripComboBox();
        tsbTitleTextColor = new ToolStripButton();
        tsbTitleBackColor = new ToolStripButton();
        tsbTitleBold = new ToolStripButton();
        tsbTitleItalic = new ToolStripButton();
        tsbTitleUnderline = new ToolStripButton();
        tsbTitleStrikeout = new ToolStripButton();
        tsTitleSep1 = new ToolStripSeparator();
        tsbTitleInsertSymbol = new ToolStripButton();
        lblTitleFormat = new Label();
        lblDescription = new Label();
        rtbDescription = new RichTextBox();
        panelDescFormat = new Panel();
        toolStripDescFormat = new ToolStrip();
        tsbDescFont = new ToolStripButton();
        tscDescFontSize = new ToolStripComboBox();
        tsbDescTextColor = new ToolStripButton();
        tsbDescBackColor = new ToolStripButton();
        tsbDescBold = new ToolStripButton();
        tsbDescItalic = new ToolStripButton();
        tsbDescUnderline = new ToolStripButton();
        tsbDescStrikeout = new ToolStripButton();
        tsDescSep1 = new ToolStripSeparator();
        tsbDescInsertSymbol = new ToolStripButton();
        lblDescriptionFormat = new Label();
        lblAssignee = new Label();
        txtAssignee = new TextBox();
        lblPriority = new Label();
        cmbPriority = new ComboBox();
        lblPoints = new Label();
        nudPoints = new NumericUpDown();
        chkDueDate = new CheckBox();
        dtpDueDate = new DateTimePicker();
        lblTags = new Label();
        txtTags = new TextBox();
        lblColor = new Label();
        panelColors = new FlowLayoutPanel();
        btnCustomColor = new Button();
        panelPreview = new Panel();
        lblPreview = new Label();
        lblTopRightFold = new Label();
        rbShowTopRightFold = new RadioButton();
        rbHideTopRightFold = new RadioButton();
        lblCardSize = new Label();
        cmbSizePreset = new ComboBox();
        lblWidth = new Label();
        nudCardWidth = new NumericUpDown();
        lblHeight = new Label();
        nudCardHeight = new NumericUpDown();
        panelMemoSizePreview = new Panel();
        lblMemoPreview = new Label();
        btnOk = new Button();
        btnCancel = new Button();
        menuCardEdit.SuspendLayout();
        panelTitleFormat.SuspendLayout();
        toolStripTitleFormat.SuspendLayout();
        panelDescFormat.SuspendLayout();
        toolStripDescFormat.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)nudPoints).BeginInit();
        ((System.ComponentModel.ISupportInitialize)nudCardWidth).BeginInit();
        ((System.ComponentModel.ISupportInitialize)nudCardHeight).BeginInit();
        SuspendLayout();
        // 
        // menuCardEdit
        // 
        menuCardEdit.Items.AddRange(new ToolStripItem[] { menuInsert });
        menuCardEdit.Location = new Point(0, 0);
        menuCardEdit.Name = "menuCardEdit";
        menuCardEdit.Size = new Size(480, 24);
        menuCardEdit.TabIndex = 0;
        menuCardEdit.Text = "menuCardEdit";
        // 
        // menuInsert
        // 
        menuInsert.DropDownItems.AddRange(new ToolStripItem[] { menuInsertSymbol });
        menuInsert.Name = "menuInsert";
        menuInsert.Size = new Size(54, 20);
        menuInsert.Text = "삽입(&I)";
        // 
        // menuInsertSymbol
        // 
        menuInsertSymbol.Name = "menuInsertSymbol";
        menuInsertSymbol.Size = new Size(207, 22);
        menuInsertSymbol.Text = "특수문자 / 이모티콘(&S)...";
        menuInsertSymbol.Click += menuInsertSymbol_Click;
        // 
        // lblTitle
        // 
        lblTitle.AutoSize = true;
        lblTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTitle.Location = new Point(12, 32);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(39, 15);
        lblTitle.TabIndex = 33;
        lblTitle.Text = "제목 *";
        // 
        // txtTitle
        // 
        txtTitle.Location = new Point(12, 49);
        txtTitle.Name = "txtTitle";
        txtTitle.Size = new Size(456, 23);
        txtTitle.TabIndex = 1;
        txtTitle.Enter += TextTarget_Enter;
        // 
        // panelTitleFormat
        // 
        panelTitleFormat.Controls.Add(toolStripTitleFormat);
        panelTitleFormat.Controls.Add(lblTitleFormat);
        panelTitleFormat.Location = new Point(12, 74);
        panelTitleFormat.Name = "panelTitleFormat";
        panelTitleFormat.Size = new Size(456, 42);
        panelTitleFormat.TabIndex = 2;
        // 
        // toolStripTitleFormat
        // 
        toolStripTitleFormat.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        toolStripTitleFormat.AutoSize = false;
        toolStripTitleFormat.CanOverflow = false;
        toolStripTitleFormat.Dock = DockStyle.None;
        toolStripTitleFormat.GripStyle = ToolStripGripStyle.Hidden;
        toolStripTitleFormat.Items.AddRange(new ToolStripItem[] { tsbTitleFont, tscTitleFontSize, tsbTitleTextColor, tsbTitleBackColor, tsbTitleBold, tsbTitleItalic, tsbTitleUnderline, tsbTitleStrikeout, tsTitleSep1, tsbTitleInsertSymbol });
        toolStripTitleFormat.Location = new Point(0, 17);
        toolStripTitleFormat.Name = "toolStripTitleFormat";
        toolStripTitleFormat.Size = new Size(456, 25);
        toolStripTitleFormat.TabIndex = 1;
        // 
        // tsbTitleFont
        // 
        tsbTitleFont.DisplayStyle = ToolStripItemDisplayStyle.Text;
        tsbTitleFont.Name = "tsbTitleFont";
        tsbTitleFont.Size = new Size(35, 22);
        tsbTitleFont.Text = "글꼴";
        tsbTitleFont.ToolTipText = "제목 글꼴 선택";
        tsbTitleFont.Click += tsbTitleFont_Click;
        // 
        // tscTitleFontSize
        // 
        tscTitleFontSize.DropDownStyle = ComboBoxStyle.DropDownList;
        tscTitleFontSize.Name = "tscTitleFontSize";
        tscTitleFontSize.Size = new Size(75, 25);
        tscTitleFontSize.SelectedIndexChanged += tscTitleFontSize_SelectedIndexChanged;
        // 
        // tsbTitleTextColor
        // 
        tsbTitleTextColor.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        tsbTitleTextColor.ForeColor = Color.Red;
        tsbTitleTextColor.Name = "tsbTitleTextColor";
        tsbTitleTextColor.Size = new Size(23, 22);
        tsbTitleTextColor.Text = "A";
        tsbTitleTextColor.ToolTipText = "제목 글자 색";
        tsbTitleTextColor.Click += tsbTitleTextColor_Click;
        // 
        // tsbTitleBackColor
        // 
        tsbTitleBackColor.Name = "tsbTitleBackColor";
        tsbTitleBackColor.Size = new Size(23, 22);
        tsbTitleBackColor.Text = "▮";
        tsbTitleBackColor.ToolTipText = "제목 글자 배경";
        tsbTitleBackColor.Click += tsbTitleBackColor_Click;
        // 
        // tsbTitleBold
        // 
        tsbTitleBold.CheckOnClick = true;
        tsbTitleBold.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        tsbTitleBold.Name = "tsbTitleBold";
        tsbTitleBold.Size = new Size(23, 22);
        tsbTitleBold.Text = "B";
        tsbTitleBold.ToolTipText = "제목 굵게";
        tsbTitleBold.Click += tsbTitleBold_Click;
        // 
        // tsbTitleItalic
        // 
        tsbTitleItalic.CheckOnClick = true;
        tsbTitleItalic.Font = new Font("Segoe UI", 9F, FontStyle.Italic);
        tsbTitleItalic.Name = "tsbTitleItalic";
        tsbTitleItalic.Size = new Size(23, 22);
        tsbTitleItalic.Text = "I";
        tsbTitleItalic.ToolTipText = "제목 기울임";
        tsbTitleItalic.Click += tsbTitleItalic_Click;
        // 
        // tsbTitleUnderline
        // 
        tsbTitleUnderline.CheckOnClick = true;
        tsbTitleUnderline.Font = new Font("Segoe UI", 9F, FontStyle.Underline);
        tsbTitleUnderline.Name = "tsbTitleUnderline";
        tsbTitleUnderline.Size = new Size(23, 22);
        tsbTitleUnderline.Text = "U";
        tsbTitleUnderline.ToolTipText = "제목 밑줄";
        tsbTitleUnderline.Click += tsbTitleUnderline_Click;
        // 
        // tsbTitleStrikeout
        // 
        tsbTitleStrikeout.CheckOnClick = true;
        tsbTitleStrikeout.Font = new Font("Segoe UI", 9F, FontStyle.Strikeout);
        tsbTitleStrikeout.Name = "tsbTitleStrikeout";
        tsbTitleStrikeout.Size = new Size(23, 22);
        tsbTitleStrikeout.Text = "S";
        tsbTitleStrikeout.ToolTipText = "제목 취소선";
        tsbTitleStrikeout.Click += tsbTitleStrikeout_Click;
        // 
        // tsTitleSep1
        // 
        tsTitleSep1.Name = "tsTitleSep1";
        tsTitleSep1.Size = new Size(6, 25);
        // 
        // tsbTitleInsertSymbol
        // 
        tsbTitleInsertSymbol.Name = "tsbTitleInsertSymbol";
        tsbTitleInsertSymbol.Size = new Size(23, 22);
        tsbTitleInsertSymbol.Text = "Ω";
        tsbTitleInsertSymbol.ToolTipText = "특수문자 / 이모티콘 삽입";
        tsbTitleInsertSymbol.Click += tsbTitleInsertSymbol_Click;
        // 
        // lblTitleFormat
        // 
        lblTitleFormat.AutoSize = true;
        lblTitleFormat.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTitleFormat.Location = new Point(0, 0);
        lblTitleFormat.Name = "lblTitleFormat";
        lblTitleFormat.Size = new Size(58, 15);
        lblTitleFormat.TabIndex = 2;
        lblTitleFormat.Text = "제목 글꼴";
        // 
        // lblDescription
        // 
        lblDescription.AutoSize = true;
        lblDescription.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblDescription.Location = new Point(12, 124);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(31, 15);
        lblDescription.TabIndex = 32;
        lblDescription.Text = "설명";
        // 
        // rtbDescription
        // 
        rtbDescription.Location = new Point(12, 141);
        rtbDescription.Name = "rtbDescription";
        rtbDescription.Size = new Size(456, 88);
        rtbDescription.TabIndex = 3;
        rtbDescription.Text = "";
        rtbDescription.SelectionChanged += rtbDescription_SelectionChanged;
        rtbDescription.Enter += TextTarget_Enter;
        // 
        // panelDescFormat
        // 
        panelDescFormat.Controls.Add(toolStripDescFormat);
        panelDescFormat.Controls.Add(lblDescriptionFormat);
        panelDescFormat.Location = new Point(12, 231);
        panelDescFormat.Name = "panelDescFormat";
        panelDescFormat.Size = new Size(456, 42);
        panelDescFormat.TabIndex = 4;
        // 
        // toolStripDescFormat
        // 
        toolStripDescFormat.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        toolStripDescFormat.AutoSize = false;
        toolStripDescFormat.CanOverflow = false;
        toolStripDescFormat.Dock = DockStyle.None;
        toolStripDescFormat.GripStyle = ToolStripGripStyle.Hidden;
        toolStripDescFormat.Items.AddRange(new ToolStripItem[] { tsbDescFont, tscDescFontSize, tsbDescTextColor, tsbDescBackColor, tsbDescBold, tsbDescItalic, tsbDescUnderline, tsbDescStrikeout, tsDescSep1, tsbDescInsertSymbol });
        toolStripDescFormat.Location = new Point(0, 17);
        toolStripDescFormat.Name = "toolStripDescFormat";
        toolStripDescFormat.Size = new Size(456, 25);
        toolStripDescFormat.TabIndex = 1;
        // 
        // tsbDescFont
        // 
        tsbDescFont.DisplayStyle = ToolStripItemDisplayStyle.Text;
        tsbDescFont.Name = "tsbDescFont";
        tsbDescFont.Size = new Size(35, 22);
        tsbDescFont.Text = "글꼴";
        tsbDescFont.ToolTipText = "설명 글꼴 선택";
        tsbDescFont.Click += tsbDescFont_Click;
        // 
        // tscDescFontSize
        // 
        tscDescFontSize.DropDownStyle = ComboBoxStyle.DropDownList;
        tscDescFontSize.Name = "tscDescFontSize";
        tscDescFontSize.Size = new Size(75, 25);
        tscDescFontSize.SelectedIndexChanged += tscDescFontSize_SelectedIndexChanged;
        // 
        // tsbDescTextColor
        // 
        tsbDescTextColor.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        tsbDescTextColor.ForeColor = Color.Red;
        tsbDescTextColor.Name = "tsbDescTextColor";
        tsbDescTextColor.Size = new Size(23, 22);
        tsbDescTextColor.Text = "A";
        tsbDescTextColor.ToolTipText = "설명 글자 색";
        tsbDescTextColor.Click += tsbDescTextColor_Click;
        // 
        // tsbDescBackColor
        // 
        tsbDescBackColor.Name = "tsbDescBackColor";
        tsbDescBackColor.Size = new Size(23, 22);
        tsbDescBackColor.Text = "▮";
        tsbDescBackColor.ToolTipText = "설명 글자 배경";
        tsbDescBackColor.Click += tsbDescBackColor_Click;
        // 
        // tsbDescBold
        // 
        tsbDescBold.CheckOnClick = true;
        tsbDescBold.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        tsbDescBold.Name = "tsbDescBold";
        tsbDescBold.Size = new Size(23, 22);
        tsbDescBold.Text = "B";
        tsbDescBold.ToolTipText = "설명 굵게";
        tsbDescBold.Click += tsbDescBold_Click;
        // 
        // tsbDescItalic
        // 
        tsbDescItalic.CheckOnClick = true;
        tsbDescItalic.Font = new Font("Segoe UI", 9F, FontStyle.Italic);
        tsbDescItalic.Name = "tsbDescItalic";
        tsbDescItalic.Size = new Size(23, 22);
        tsbDescItalic.Text = "I";
        tsbDescItalic.ToolTipText = "설명 기울임";
        tsbDescItalic.Click += tsbDescItalic_Click;
        // 
        // tsbDescUnderline
        // 
        tsbDescUnderline.CheckOnClick = true;
        tsbDescUnderline.Font = new Font("Segoe UI", 9F, FontStyle.Underline);
        tsbDescUnderline.Name = "tsbDescUnderline";
        tsbDescUnderline.Size = new Size(23, 22);
        tsbDescUnderline.Text = "U";
        tsbDescUnderline.ToolTipText = "설명 밑줄";
        tsbDescUnderline.Click += tsbDescUnderline_Click;
        // 
        // tsbDescStrikeout
        // 
        tsbDescStrikeout.CheckOnClick = true;
        tsbDescStrikeout.Font = new Font("Segoe UI", 9F, FontStyle.Strikeout);
        tsbDescStrikeout.Name = "tsbDescStrikeout";
        tsbDescStrikeout.Size = new Size(23, 22);
        tsbDescStrikeout.Text = "S";
        tsbDescStrikeout.ToolTipText = "설명 취소선";
        tsbDescStrikeout.Click += tsbDescStrikeout_Click;
        // 
        // tsDescSep1
        // 
        tsDescSep1.Name = "tsDescSep1";
        tsDescSep1.Size = new Size(6, 25);
        // 
        // tsbDescInsertSymbol
        // 
        tsbDescInsertSymbol.Name = "tsbDescInsertSymbol";
        tsbDescInsertSymbol.Size = new Size(23, 22);
        tsbDescInsertSymbol.Text = "Ω";
        tsbDescInsertSymbol.ToolTipText = "특수문자 / 이모티콘 삽입";
        tsbDescInsertSymbol.Click += tsbDescInsertSymbol_Click;
        // 
        // lblDescriptionFormat
        // 
        lblDescriptionFormat.AutoSize = true;
        lblDescriptionFormat.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblDescriptionFormat.Location = new Point(0, 0);
        lblDescriptionFormat.Name = "lblDescriptionFormat";
        lblDescriptionFormat.Size = new Size(58, 15);
        lblDescriptionFormat.TabIndex = 2;
        lblDescriptionFormat.Text = "설명 글꼴";
        // 
        // lblAssignee
        // 
        lblAssignee.AutoSize = true;
        lblAssignee.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblAssignee.Location = new Point(12, 281);
        lblAssignee.Name = "lblAssignee";
        lblAssignee.Size = new Size(43, 15);
        lblAssignee.TabIndex = 31;
        lblAssignee.Text = "담당자";
        // 
        // txtAssignee
        // 
        txtAssignee.Location = new Point(12, 298);
        txtAssignee.Name = "txtAssignee";
        txtAssignee.Size = new Size(146, 23);
        txtAssignee.TabIndex = 5;
        // 
        // lblPriority
        // 
        lblPriority.AutoSize = true;
        lblPriority.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblPriority.Location = new Point(166, 281);
        lblPriority.Name = "lblPriority";
        lblPriority.Size = new Size(55, 15);
        lblPriority.TabIndex = 30;
        lblPriority.Text = "우선순위";
        // 
        // cmbPriority
        // 
        cmbPriority.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbPriority.Items.AddRange(new object[] { "Low", "Medium", "High", "Critical" });
        cmbPriority.Location = new Point(166, 298);
        cmbPriority.Name = "cmbPriority";
        cmbPriority.Size = new Size(146, 23);
        cmbPriority.TabIndex = 6;
        // 
        // lblPoints
        // 
        lblPoints.AutoSize = true;
        lblPoints.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblPoints.Location = new Point(320, 281);
        lblPoints.Name = "lblPoints";
        lblPoints.Size = new Size(65, 15);
        lblPoints.TabIndex = 29;
        lblPoints.Text = "포인트(SP)";
        // 
        // nudPoints
        // 
        nudPoints.Location = new Point(320, 298);
        nudPoints.Name = "nudPoints";
        nudPoints.Size = new Size(146, 23);
        nudPoints.TabIndex = 7;
        nudPoints.Value = new decimal(new int[] { 1, 0, 0, 0 });
        // 
        // chkDueDate
        // 
        chkDueDate.AutoSize = true;
        chkDueDate.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        chkDueDate.Location = new Point(12, 331);
        chkDueDate.Name = "chkDueDate";
        chkDueDate.Size = new Size(50, 19);
        chkDueDate.TabIndex = 8;
        chkDueDate.Text = "기한";
        chkDueDate.CheckedChanged += chkDueDate_CheckedChanged;
        // 
        // dtpDueDate
        // 
        dtpDueDate.Format = DateTimePickerFormat.Short;
        dtpDueDate.Location = new Point(60, 329);
        dtpDueDate.Name = "dtpDueDate";
        dtpDueDate.Size = new Size(408, 23);
        dtpDueDate.TabIndex = 9;
        // 
        // lblTags
        // 
        lblTags.AutoSize = true;
        lblTags.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTags.Location = new Point(12, 360);
        lblTags.Name = "lblTags";
        lblTags.Size = new Size(105, 15);
        lblTags.TabIndex = 28;
        lblTags.Text = "태그 (쉼표로 구분)";
        // 
        // txtTags
        // 
        txtTags.Location = new Point(12, 377);
        txtTags.Name = "txtTags";
        txtTags.Size = new Size(456, 23);
        txtTags.TabIndex = 10;
        // 
        // lblColor
        // 
        lblColor.AutoSize = true;
        lblColor.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblColor.Location = new Point(12, 408);
        lblColor.Name = "lblColor";
        lblColor.Size = new Size(58, 15);
        lblColor.TabIndex = 27;
        lblColor.Text = "카드 색상";
        // 
        // panelColors
        // 
        panelColors.Location = new Point(12, 425);
        panelColors.Name = "panelColors";
        panelColors.Size = new Size(456, 68);
        panelColors.TabIndex = 11;
        // 
        // btnCustomColor
        // 
        btnCustomColor.Location = new Point(12, 500);
        btnCustomColor.Name = "btnCustomColor";
        btnCustomColor.Size = new Size(100, 28);
        btnCustomColor.TabIndex = 12;
        btnCustomColor.Text = "직접 선택...";
        btnCustomColor.UseVisualStyleBackColor = true;
        btnCustomColor.Click += btnCustomColor_Click;
        // 
        // panelPreview
        // 
        panelPreview.BackColor = Color.WhiteSmoke;
        panelPreview.BorderStyle = BorderStyle.FixedSingle;
        panelPreview.Location = new Point(120, 498);
        panelPreview.Name = "panelPreview";
        panelPreview.Size = new Size(80, 36);
        panelPreview.TabIndex = 13;
        panelPreview.Paint += PanelPreview_Paint;
        // 
        // lblPreview
        // 
        lblPreview.AutoSize = true;
        lblPreview.Font = new Font("Segoe UI", 7.5F);
        lblPreview.ForeColor = Color.DimGray;
        lblPreview.Location = new Point(120, 538);
        lblPreview.Name = "lblPreview";
        lblPreview.Size = new Size(45, 12);
        lblPreview.TabIndex = 26;
        lblPreview.Text = "색상 미리보기";
        // 
        // lblTopRightFold
        // 
        lblTopRightFold.AutoSize = true;
        lblTopRightFold.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTopRightFold.Location = new Point(220, 498);
        lblTopRightFold.Name = "lblTopRightFold";
        lblTopRightFold.Size = new Size(67, 15);
        lblTopRightFold.TabIndex = 34;
        lblTopRightFold.Text = "우측 상단";
        // 
        // rbShowTopRightFold
        // 
        rbShowTopRightFold.AutoSize = true;
        rbShowTopRightFold.Checked = true;
        rbShowTopRightFold.Location = new Point(220, 518);
        rbShowTopRightFold.Name = "rbShowTopRightFold";
        rbShowTopRightFold.Size = new Size(49, 19);
        rbShowTopRightFold.TabIndex = 17;
        rbShowTopRightFold.TabStop = true;
        rbShowTopRightFold.Text = "접힘";
        rbShowTopRightFold.UseVisualStyleBackColor = true;
        rbShowTopRightFold.CheckedChanged += FoldOption_CheckedChanged;
        // 
        // rbHideTopRightFold
        // 
        rbHideTopRightFold.AutoSize = true;
        rbHideTopRightFold.Location = new Point(280, 518);
        rbHideTopRightFold.Name = "rbHideTopRightFold";
        rbHideTopRightFold.Size = new Size(73, 19);
        rbHideTopRightFold.TabIndex = 19;
        rbHideTopRightFold.Text = "접힘 없음";
        rbHideTopRightFold.UseVisualStyleBackColor = true;
        rbHideTopRightFold.CheckedChanged += FoldOption_CheckedChanged;
        // 
        // lblCardSize
        // 
        lblCardSize.AutoSize = true;
        lblCardSize.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblCardSize.Location = new Point(12, 558);
        lblCardSize.Name = "lblCardSize";
        lblCardSize.Size = new Size(58, 15);
        lblCardSize.TabIndex = 25;
        lblCardSize.Text = "메모 크기";
        // 
        // cmbSizePreset
        // 
        cmbSizePreset.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbSizePreset.Location = new Point(12, 575);
        cmbSizePreset.Name = "cmbSizePreset";
        cmbSizePreset.Size = new Size(250, 23);
        cmbSizePreset.TabIndex = 14;
        cmbSizePreset.SelectedIndexChanged += cmbSizePreset_SelectedIndexChanged;
        // 
        // lblWidth
        // 
        lblWidth.AutoSize = true;
        lblWidth.Location = new Point(272, 558);
        lblWidth.Name = "lblWidth";
        lblWidth.Size = new Size(31, 15);
        lblWidth.TabIndex = 24;
        lblWidth.Text = "너비";
        // 
        // nudCardWidth
        // 
        nudCardWidth.Location = new Point(272, 575);
        nudCardWidth.Maximum = new decimal(new int[] { 400, 0, 0, 0 });
        nudCardWidth.Minimum = new decimal(new int[] { 80, 0, 0, 0 });
        nudCardWidth.Name = "nudCardWidth";
        nudCardWidth.Size = new Size(58, 23);
        nudCardWidth.TabIndex = 15;
        nudCardWidth.Value = new decimal(new int[] { 150, 0, 0, 0 });
        nudCardWidth.ValueChanged += nudCardSize_ValueChanged;
        // 
        // lblHeight
        // 
        lblHeight.AutoSize = true;
        lblHeight.Location = new Point(340, 558);
        lblHeight.Name = "lblHeight";
        lblHeight.Size = new Size(31, 15);
        lblHeight.TabIndex = 23;
        lblHeight.Text = "높이";
        // 
        // nudCardHeight
        // 
        nudCardHeight.Location = new Point(340, 575);
        nudCardHeight.Maximum = new decimal(new int[] { 300, 0, 0, 0 });
        nudCardHeight.Minimum = new decimal(new int[] { 56, 0, 0, 0 });
        nudCardHeight.Name = "nudCardHeight";
        nudCardHeight.Size = new Size(58, 23);
        nudCardHeight.TabIndex = 16;
        nudCardHeight.Value = new decimal(new int[] { 90, 0, 0, 0 });
        nudCardHeight.ValueChanged += nudCardSize_ValueChanged;
        // 
        // panelMemoSizePreview
        // 
        panelMemoSizePreview.BackColor = Color.WhiteSmoke;
        panelMemoSizePreview.BorderStyle = BorderStyle.FixedSingle;
        panelMemoSizePreview.Location = new Point(12, 608);
        panelMemoSizePreview.Name = "panelMemoSizePreview";
        panelMemoSizePreview.Size = new Size(100, 40);
        panelMemoSizePreview.TabIndex = 18;
        panelMemoSizePreview.Paint += PanelMemoSizePreview_Paint;
        // 
        // lblMemoPreview
        // 
        lblMemoPreview.AutoSize = true;
        lblMemoPreview.Font = new Font("Segoe UI", 7.5F);
        lblMemoPreview.ForeColor = Color.DimGray;
        lblMemoPreview.Location = new Point(12, 652);
        lblMemoPreview.Name = "lblMemoPreview";
        lblMemoPreview.Size = new Size(68, 12);
        lblMemoPreview.TabIndex = 0;
        lblMemoPreview.Text = "크기 미리보기";
        // 
        // btnOk
        // 
        btnOk.Location = new Point(310, 668);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 30);
        btnOk.TabIndex = 22;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;
        // 
        // btnCancel
        // 
        btnCancel.Location = new Point(393, 668);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 30);
        btnCancel.TabIndex = 23;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += btnCancel_Click;
        // 
        // CardEditForm
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(480, 710);
        Controls.Add(lblMemoPreview);
        Controls.Add(panelMemoSizePreview);
        Controls.Add(rbHideTopRightFold);
        Controls.Add(rbShowTopRightFold);
        Controls.Add(lblTopRightFold);
        Controls.Add(nudCardHeight);
        Controls.Add(lblHeight);
        Controls.Add(nudCardWidth);
        Controls.Add(lblWidth);
        Controls.Add(cmbSizePreset);
        Controls.Add(lblCardSize);
        Controls.Add(lblPreview);
        Controls.Add(panelPreview);
        Controls.Add(btnCustomColor);
        Controls.Add(panelColors);
        Controls.Add(lblColor);
        Controls.Add(txtTags);
        Controls.Add(lblTags);
        Controls.Add(dtpDueDate);
        Controls.Add(chkDueDate);
        Controls.Add(nudPoints);
        Controls.Add(lblPoints);
        Controls.Add(cmbPriority);
        Controls.Add(lblPriority);
        Controls.Add(txtAssignee);
        Controls.Add(lblAssignee);
        Controls.Add(panelDescFormat);
        Controls.Add(rtbDescription);
        Controls.Add(lblDescription);
        Controls.Add(panelTitleFormat);
        Controls.Add(txtTitle);
        Controls.Add(lblTitle);
        Controls.Add(menuCardEdit);
        Controls.Add(btnOk);
        Controls.Add(btnCancel);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        AutoScroll = true;
        MainMenuStrip = menuCardEdit;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "CardEditForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "카드 편집";
        menuCardEdit.ResumeLayout(false);
        menuCardEdit.PerformLayout();
        panelTitleFormat.ResumeLayout(false);
        panelTitleFormat.PerformLayout();
        toolStripTitleFormat.ResumeLayout(false);
        toolStripTitleFormat.PerformLayout();
        panelDescFormat.ResumeLayout(false);
        panelDescFormat.PerformLayout();
        toolStripDescFormat.ResumeLayout(false);
        toolStripDescFormat.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)nudPoints).EndInit();
        ((System.ComponentModel.ISupportInitialize)nudCardWidth).EndInit();
        ((System.ComponentModel.ISupportInitialize)nudCardHeight).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private MenuStrip menuCardEdit = null!;
    private ToolStripMenuItem menuInsert = null!;
    private ToolStripMenuItem menuInsertSymbol = null!;
    private Label lblTitle = null!;
    private TextBox txtTitle = null!;
    private Panel panelTitleFormat = null!;
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
    private ToolStripSeparator tsTitleSep1 = null!;
    private ToolStripButton tsbTitleInsertSymbol = null!;
    private Label lblDescription = null!;
    private RichTextBox rtbDescription = null!;
    private Panel panelDescFormat = null!;
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
    private Label lblAssignee = null!;
    private TextBox txtAssignee = null!;
    private Label lblPriority = null!;
    private ComboBox cmbPriority = null!;
    private Label lblPoints = null!;
    private NumericUpDown nudPoints = null!;
    private CheckBox chkDueDate = null!;
    private DateTimePicker dtpDueDate = null!;
    private Label lblTags = null!;
    private TextBox txtTags = null!;
    private Label lblColor = null!;
    private FlowLayoutPanel panelColors = null!;
    private Button btnCustomColor = null!;
    private Panel panelPreview = null!;
    private Label lblPreview = null!;
    private Label lblTopRightFold = null!;
    private RadioButton rbShowTopRightFold = null!;
    private RadioButton rbHideTopRightFold = null!;
    private Label lblCardSize = null!;
    private ComboBox cmbSizePreset = null!;
    private Label lblWidth = null!;
    private NumericUpDown nudCardWidth = null!;
    private Label lblHeight = null!;
    private NumericUpDown nudCardHeight = null!;
    private Panel panelMemoSizePreview = null!;
    private Label lblMemoPreview = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;
}
