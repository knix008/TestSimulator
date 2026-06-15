namespace MyAgileBoardWinV10.Forms;

partial class ColumnSettingsForm
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
        lblName = new Label();
        txtName = new TextBox();
        lblColumnWidth = new Label();
        nudColumnWidth = new NumericUpDown();
        chkIsCompletion = new CheckBox();
        lblColor = new Label();
        panelColors = new FlowLayoutPanel();
        btnCustomColor = new Button();
        lblTitleFont = new Label();
        lblTitleFontSample = new Label();
        btnTitleFont = new Button();
        lblTitleColor = new Label();
        chkAutoTitleColor = new CheckBox();
        panelTitleColors = new FlowLayoutPanel();
        btnTitleCustomColor = new Button();
        lblPreviewLabel = new Label();
        panelPreview = new Panel();
        lblPreviewText = new Label();
        btnOk = new Button();
        btnCancel = new Button();

        ((System.ComponentModel.ISupportInitialize)nudColumnWidth).BeginInit();
        panelPreview.SuspendLayout();
        SuspendLayout();

        lblName.AutoSize = true;
        lblName.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblName.Location = new Point(12, 12);
        lblName.Text = "컬럼 이름";

        txtName.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtName.Font = new Font("Segoe UI", 10F);
        txtName.Location = new Point(12, 30);
        txtName.Size = new Size(336, 25);
        txtName.TabIndex = 0;
        txtName.TextChanged += txtName_TextChanged;

        chkIsCompletion.AutoSize = true;
        chkIsCompletion.Location = new Point(12, 110);
        chkIsCompletion.TabIndex = 2;
        chkIsCompletion.Text = "완료 컬럼으로 지정 (번다운 차트용)";

        lblColumnWidth.AutoSize = true;
        lblColumnWidth.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblColumnWidth.Location = new Point(12, 64);
        lblColumnWidth.Text = "너비 비율 (상대값)";

        nudColumnWidth.Location = new Point(12, 82);
        nudColumnWidth.Size = new Size(80, 23);
        nudColumnWidth.TabIndex = 1;
        nudColumnWidth.Minimum = 50;
        nudColumnWidth.Maximum = 2000;

        lblColor.AutoSize = true;
        lblColor.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblColor.Location = new Point(12, 142);
        lblColor.Text = "헤더 배경 색상";

        panelColors.AutoSize = false;
        panelColors.Location = new Point(12, 160);
        panelColors.Size = new Size(336, 76);
        panelColors.WrapContents = true;

        btnCustomColor.Location = new Point(12, 244);
        btnCustomColor.Size = new Size(100, 26);
        btnCustomColor.TabIndex = 2;
        btnCustomColor.Text = "직접 선택...";
        btnCustomColor.Click += btnCustomColor_Click;

        lblTitleFont.AutoSize = true;
        lblTitleFont.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTitleFont.Location = new Point(12, 280);
        lblTitleFont.Text = "제목 글꼴";

        lblTitleFontSample.AutoEllipsis = true;
        lblTitleFontSample.ForeColor = Color.DimGray;
        lblTitleFontSample.Location = new Point(12, 300);
        lblTitleFontSample.Size = new Size(220, 20);
        lblTitleFontSample.Text = "Segoe UI, 9.5pt, Bold";

        btnTitleFont.Location = new Point(248, 296);
        btnTitleFont.Size = new Size(100, 26);
        btnTitleFont.TabIndex = 3;
        btnTitleFont.Text = "글꼴 선택...";
        btnTitleFont.Click += btnTitleFont_Click;

        lblTitleColor.AutoSize = true;
        lblTitleColor.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTitleColor.Location = new Point(12, 332);
        lblTitleColor.Text = "제목 색상";

        chkAutoTitleColor.AutoSize = true;
        chkAutoTitleColor.Checked = true;
        chkAutoTitleColor.Location = new Point(12, 352);
        chkAutoTitleColor.TabIndex = 4;
        chkAutoTitleColor.Text = "헤더 배경에 맞춰 자동";
        chkAutoTitleColor.CheckedChanged += chkAutoTitleColor_CheckedChanged;

        panelTitleColors.AutoSize = false;
        panelTitleColors.Enabled = false;
        panelTitleColors.Location = new Point(12, 374);
        panelTitleColors.Size = new Size(336, 36);
        panelTitleColors.WrapContents = true;

        btnTitleCustomColor.Enabled = false;
        btnTitleCustomColor.Location = new Point(12, 418);
        btnTitleCustomColor.Size = new Size(100, 26);
        btnTitleCustomColor.TabIndex = 5;
        btnTitleCustomColor.Text = "직접 선택...";
        btnTitleCustomColor.Click += btnTitleCustomColor_Click;

        lblPreviewLabel.AutoSize = true;
        lblPreviewLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblPreviewLabel.Location = new Point(12, 454);
        lblPreviewLabel.Text = "미리보기";

        panelPreview.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        panelPreview.BackColor = Color.SteelBlue;
        panelPreview.Controls.Add(lblPreviewText);
        panelPreview.Location = new Point(12, 472);
        panelPreview.Size = new Size(336, 36);

        lblPreviewText.AutoEllipsis = true;
        lblPreviewText.AutoSize = false;
        lblPreviewText.Dock = DockStyle.Fill;
        lblPreviewText.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
        lblPreviewText.ForeColor = Color.White;
        lblPreviewText.Padding = new Padding(6, 0, 6, 0);
        lblPreviewText.Text = "Column Name";
        lblPreviewText.TextAlign = ContentAlignment.MiddleLeft;

        btnOk.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnOk.Location = new Point(189, 524);
        btnOk.Size = new Size(75, 28);
        btnOk.TabIndex = 6;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;

        btnCancel.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnCancel.Location = new Point(273, 524);
        btnCancel.Size = new Size(75, 28);
        btnCancel.TabIndex = 7;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += btnCancel_Click;

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(360, 564);
        Controls.AddRange(new Control[]
        {
            lblName, txtName, lblColumnWidth, nudColumnWidth, chkIsCompletion,
            lblColor, panelColors, btnCustomColor,
            lblTitleFont, lblTitleFontSample, btnTitleFont,
            lblTitleColor, chkAutoTitleColor, panelTitleColors, btnTitleCustomColor,
            lblPreviewLabel, panelPreview,
            btnOk, btnCancel
        });
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "컬럼 설정";

        panelPreview.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)nudColumnWidth).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblName = null!;
    private TextBox txtName = null!;
    private Label lblColumnWidth = null!;
    private NumericUpDown nudColumnWidth = null!;
    private CheckBox chkIsCompletion = null!;
    private Label lblColor = null!;
    private FlowLayoutPanel panelColors = null!;
    private Button btnCustomColor = null!;
    private Label lblTitleFont = null!;
    private Label lblTitleFontSample = null!;
    private Button btnTitleFont = null!;
    private Label lblTitleColor = null!;
    private CheckBox chkAutoTitleColor = null!;
    private FlowLayoutPanel panelTitleColors = null!;
    private Button btnTitleCustomColor = null!;
    private Label lblPreviewLabel = null!;
    private Panel panelPreview = null!;
    private Label lblPreviewText = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;
}
