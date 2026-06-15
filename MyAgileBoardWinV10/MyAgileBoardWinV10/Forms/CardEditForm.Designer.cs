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
        rtbDescription = new RichTextBox();
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

        lblTitle.AutoSize = true;
        lblTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTitle.Location = new Point(12, 12);
        lblTitle.Text = "제목 *";

        txtTitle.Location = new Point(12, 58);
        txtTitle.Size = new Size(430, 23);
        txtTitle.TabIndex = 0;
        txtTitle.Enter += TextTarget_Enter;

        lblDescription.AutoSize = true;
        lblDescription.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblDescription.Location = new Point(12, 90);
        lblDescription.Text = "설명";

        rtbDescription.Location = new Point(12, 108);
        rtbDescription.Size = new Size(430, 88);
        rtbDescription.TabIndex = 1;
        rtbDescription.Enter += TextTarget_Enter;
        rtbDescription.SelectionChanged += (_, _) =>
        {
            if (_activeTextTarget == rtbDescription)
                SyncDescriptionToolbar();
        };

        lblAssignee.AutoSize = true;
        lblAssignee.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblAssignee.Location = new Point(12, 206);
        lblAssignee.Text = "담당자";

        txtAssignee.Location = new Point(12, 224);
        txtAssignee.Size = new Size(183, 23);
        txtAssignee.TabIndex = 2;

        lblTags.AutoSize = true;
        lblTags.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTags.Location = new Point(12, 294);
        lblTags.Text = "태그 (쉼표로 구분)";

        txtTags.Location = new Point(12, 312);
        txtTags.Size = new Size(430, 23);
        txtTags.TabIndex = 7;

        lblPriority.AutoSize = true;
        lblPriority.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblPriority.Location = new Point(210, 206);
        lblPriority.Text = "우선순위";

        cmbPriority.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbPriority.Items.AddRange(new object[] { "Low", "Medium", "High", "Critical" });
        cmbPriority.Location = new Point(210, 224);
        cmbPriority.Size = new Size(138, 23);
        cmbPriority.TabIndex = 3;

        lblPoints.AutoSize = true;
        lblPoints.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblPoints.Location = new Point(358, 206);
        lblPoints.Text = "포인트(SP)";

        nudPoints.Location = new Point(358, 224);
        nudPoints.Size = new Size(80, 23);
        nudPoints.TabIndex = 4;
        nudPoints.Value = new decimal(new int[] { 1, 0, 0, 0 });

        chkDueDate.AutoSize = true;
        chkDueDate.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        chkDueDate.Location = new Point(12, 260);
        chkDueDate.TabIndex = 5;
        chkDueDate.Text = "기한";
        chkDueDate.CheckedChanged += chkDueDate_CheckedChanged;

        dtpDueDate.Format = DateTimePickerFormat.Short;
        dtpDueDate.Location = new Point(88, 258);
        dtpDueDate.Size = new Size(354, 23);
        dtpDueDate.TabIndex = 6;

        lblColor.AutoSize = true;
        lblColor.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblColor.Location = new Point(12, 348);
        lblColor.Text = "카드 색상";

        panelColors.Location = new Point(12, 366);
        panelColors.Size = new Size(336, 70);

        btnCustomColor.Location = new Point(356, 366);
        btnCustomColor.Size = new Size(87, 28);
        btnCustomColor.TabIndex = 8;
        btnCustomColor.Text = "직접 선택...";
        btnCustomColor.Click += btnCustomColor_Click;

        panelPreview.BackColor = Color.WhiteSmoke;
        panelPreview.BorderStyle = BorderStyle.FixedSingle;
        panelPreview.Location = new Point(356, 402);
        panelPreview.Size = new Size(86, 34);

        lblPreview.AutoSize = true;
        lblPreview.Font = new Font("Segoe UI", 7.5F);
        lblPreview.ForeColor = Color.DimGray;
        lblPreview.Location = new Point(356, 442);
        lblPreview.Text = "미리보기";

        panelColors.FlowDirection = FlowDirection.LeftToRight;
        panelColors.WrapContents = true;

        btnOk.Size = new Size(75, 30);
        btnOk.TabIndex = 9;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;

        btnCancel.Size = new Size(75, 30);
        btnCancel.TabIndex = 10;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += btnCancel_Click;

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        Controls.AddRange(new Control[]
        {
            lblTitle, txtTitle, lblDescription, rtbDescription,
            lblAssignee, txtAssignee, lblPriority, cmbPriority, lblPoints, nudPoints,
            chkDueDate, dtpDueDate, lblTags, txtTags,
            lblColor, panelColors, btnCustomColor, panelPreview, lblPreview,
            btnOk, btnCancel
        });
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(480, 600);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "카드 편집";

        ((System.ComponentModel.ISupportInitialize)nudPoints).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblTitle = null!;
    private TextBox txtTitle = null!;
    private Label lblDescription = null!;
    private RichTextBox rtbDescription = null!;
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
