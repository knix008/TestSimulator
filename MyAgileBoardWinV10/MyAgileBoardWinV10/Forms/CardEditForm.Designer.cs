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
        lblTitle = new Label();
        txtTitle = new TextBox();
        lblDescription = new Label();
        txtDescription = new TextBox();
        lblAssignee = new Label();
        txtAssignee = new TextBox();
        lblTags = new Label();
        txtTags = new TextBox();
        lblPriority = new Label();
        cmbPriority = new ComboBox();
        lblPoints = new Label();
        nudPoints = new NumericUpDown();
        chkDueDate = new CheckBox();
        dtpDueDate = new DateTimePicker();
        lblColor = new Label();
        panelColors = new FlowLayoutPanel();
        btnCustomColor = new Button();
        panelPreview = new Panel();
        lblPreview = new Label();
        btnOk = new Button();
        btnCancel = new Button();
        ((System.ComponentModel.ISupportInitialize)nudPoints).BeginInit();
        SuspendLayout();
        // 
        // lblTitle
        // 
        lblTitle.AutoSize = true;
        lblTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTitle.Location = new Point(12, 12);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(39, 15);
        lblTitle.TabIndex = 0;
        lblTitle.Text = "제목 *";
        // 
        // txtTitle
        // 
        txtTitle.Location = new Point(12, 30);
        txtTitle.Name = "txtTitle";
        txtTitle.Size = new Size(430, 23);
        txtTitle.TabIndex = 0;
        // 
        // lblDescription
        // 
        lblDescription.AutoSize = true;
        lblDescription.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblDescription.Location = new Point(12, 62);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(31, 15);
        lblDescription.TabIndex = 1;
        lblDescription.Text = "설명";
        // 
        // txtDescription
        // 
        txtDescription.Location = new Point(12, 80);
        txtDescription.Multiline = true;
        txtDescription.Name = "txtDescription";
        txtDescription.ScrollBars = ScrollBars.Vertical;
        txtDescription.Size = new Size(430, 70);
        txtDescription.TabIndex = 1;
        // 
        // lblAssignee
        // 
        lblAssignee.AutoSize = true;
        lblAssignee.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblAssignee.Location = new Point(12, 160);
        lblAssignee.Name = "lblAssignee";
        lblAssignee.Size = new Size(43, 15);
        lblAssignee.TabIndex = 2;
        lblAssignee.Text = "담당자";
        // 
        // txtAssignee
        // 
        txtAssignee.Location = new Point(12, 178);
        txtAssignee.Name = "txtAssignee";
        txtAssignee.Size = new Size(183, 23);
        txtAssignee.TabIndex = 2;
        // 
        // lblTags
        // 
        lblTags.AutoSize = true;
        lblTags.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTags.Location = new Point(12, 248);
        lblTags.Name = "lblTags";
        lblTags.Size = new Size(105, 15);
        lblTags.TabIndex = 7;
        lblTags.Text = "태그 (쉼표로 구분)";
        // 
        // txtTags
        // 
        txtTags.Location = new Point(12, 266);
        txtTags.Name = "txtTags";
        txtTags.Size = new Size(430, 23);
        txtTags.TabIndex = 7;
        // 
        // lblPriority
        // 
        lblPriority.AutoSize = true;
        lblPriority.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblPriority.Location = new Point(210, 160);
        lblPriority.Name = "lblPriority";
        lblPriority.Size = new Size(55, 15);
        lblPriority.TabIndex = 3;
        lblPriority.Text = "우선순위";
        // 
        // cmbPriority
        // 
        cmbPriority.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbPriority.Items.AddRange(new object[] { "Low", "Medium", "High", "Critical" });
        cmbPriority.Location = new Point(210, 178);
        cmbPriority.Name = "cmbPriority";
        cmbPriority.Size = new Size(138, 23);
        cmbPriority.TabIndex = 3;
        // 
        // lblPoints
        // 
        lblPoints.AutoSize = true;
        lblPoints.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblPoints.Location = new Point(358, 160);
        lblPoints.Name = "lblPoints";
        lblPoints.Size = new Size(65, 15);
        lblPoints.TabIndex = 4;
        lblPoints.Text = "포인트(SP)";
        // 
        // nudPoints
        // 
        nudPoints.Location = new Point(358, 178);
        nudPoints.Name = "nudPoints";
        nudPoints.Size = new Size(80, 23);
        nudPoints.TabIndex = 4;
        nudPoints.Value = new decimal(new int[] { 1, 0, 0, 0 });
        // 
        // chkDueDate
        // 
        chkDueDate.AutoSize = true;
        chkDueDate.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        chkDueDate.Location = new Point(12, 214);
        chkDueDate.Name = "chkDueDate";
        chkDueDate.Size = new Size(50, 19);
        chkDueDate.TabIndex = 5;
        chkDueDate.Text = "기한";
        chkDueDate.CheckedChanged += chkDueDate_CheckedChanged;
        // 
        // dtpDueDate
        // 
        dtpDueDate.Format = DateTimePickerFormat.Short;
        dtpDueDate.Location = new Point(88, 212);
        dtpDueDate.Name = "dtpDueDate";
        dtpDueDate.Size = new Size(354, 23);
        dtpDueDate.TabIndex = 6;
        // 
        // lblColor
        // 
        lblColor.AutoSize = true;
        lblColor.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblColor.Location = new Point(12, 302);
        lblColor.Name = "lblColor";
        lblColor.Size = new Size(58, 15);
        lblColor.TabIndex = 8;
        lblColor.Text = "카드 색상";
        // 
        // panelColors
        // 
        panelColors.Location = new Point(12, 320);
        panelColors.Name = "panelColors";
        panelColors.Size = new Size(336, 70);
        panelColors.TabIndex = 9;
        // 
        // btnCustomColor
        // 
        btnCustomColor.Location = new Point(356, 320);
        btnCustomColor.Name = "btnCustomColor";
        btnCustomColor.Size = new Size(87, 28);
        btnCustomColor.TabIndex = 8;
        btnCustomColor.Text = "직접 선택...";
        btnCustomColor.Click += btnCustomColor_Click;
        // 
        // panelPreview
        // 
        panelPreview.BackColor = Color.WhiteSmoke;
        panelPreview.BorderStyle = BorderStyle.FixedSingle;
        panelPreview.Location = new Point(356, 356);
        panelPreview.Name = "panelPreview";
        panelPreview.Size = new Size(86, 34);
        panelPreview.TabIndex = 10;
        // 
        // lblPreview
        // 
        lblPreview.AutoSize = true;
        lblPreview.Font = new Font("Segoe UI", 7.5F);
        lblPreview.ForeColor = Color.DimGray;
        lblPreview.Location = new Point(356, 396);
        lblPreview.Name = "lblPreview";
        lblPreview.Size = new Size(45, 12);
        lblPreview.TabIndex = 11;
        lblPreview.Text = "미리보기";
        // 
        // btnOk
        // 
        btnOk.Location = new Point(286, 424);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 30);
        btnOk.TabIndex = 9;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;
        // 
        // btnCancel
        // 
        btnCancel.Location = new Point(368, 424);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 30);
        btnCancel.TabIndex = 10;
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
        ClientSize = new Size(458, 466);
        Controls.Add(lblTitle);
        Controls.Add(txtTitle);
        Controls.Add(lblDescription);
        Controls.Add(txtDescription);
        Controls.Add(lblAssignee);
        Controls.Add(txtAssignee);
        Controls.Add(lblPriority);
        Controls.Add(cmbPriority);
        Controls.Add(lblPoints);
        Controls.Add(nudPoints);
        Controls.Add(chkDueDate);
        Controls.Add(dtpDueDate);
        Controls.Add(lblTags);
        Controls.Add(txtTags);
        Controls.Add(lblColor);
        Controls.Add(panelColors);
        Controls.Add(btnCustomColor);
        Controls.Add(panelPreview);
        Controls.Add(lblPreview);
        Controls.Add(btnOk);
        Controls.Add(btnCancel);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "CardEditForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "카드 편집";
        ((System.ComponentModel.ISupportInitialize)nudPoints).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblTitle = null!;
    private TextBox txtTitle = null!;
    private Label lblDescription = null!;
    private TextBox txtDescription = null!;
    private Label lblAssignee = null!;
    private TextBox txtAssignee = null!;
    private Label lblTags = null!;
    private TextBox txtTags = null!;
    private Label lblPriority = null!;
    private ComboBox cmbPriority = null!;
    private CheckBox chkDueDate = null!;
    private DateTimePicker dtpDueDate = null!;
    private Label lblPoints = null!;
    private NumericUpDown nudPoints = null!;
    private Label lblColor = null!;
    private FlowLayoutPanel panelColors = null!;
    private Button btnCustomColor = null!;
    private Panel panelPreview = null!;
    private Label lblPreview = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;
}
