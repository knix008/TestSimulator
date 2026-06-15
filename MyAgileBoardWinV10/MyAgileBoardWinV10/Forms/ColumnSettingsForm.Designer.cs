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
        chkIsCompletion = new CheckBox();
        lblColor = new Label();
        panelColors = new FlowLayoutPanel();
        btnCustomColor = new Button();
        lblPreviewLabel = new Label();
        panelPreview = new Panel();
        lblPreviewText = new Label();
        btnOk = new Button();
        btnCancel = new Button();

        panelPreview.SuspendLayout();
        SuspendLayout();

        // lblName
        lblName.AutoSize = true;
        lblName.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblName.Location = new Point(12, 12);
        lblName.Name = "lblName";
        lblName.Text = "컬럼 이름";

        // txtName
        txtName.Font = new Font("Segoe UI", 10F);
        txtName.Location = new Point(12, 30);
        txtName.Name = "txtName";
        txtName.Size = new Size(320, 25);
        txtName.TabIndex = 0;
        txtName.TextChanged += new EventHandler(txtName_TextChanged);

        // chkIsCompletion
        chkIsCompletion.AutoSize = true;
        chkIsCompletion.Location = new Point(12, 64);
        chkIsCompletion.Name = "chkIsCompletion";
        chkIsCompletion.Size = new Size(200, 19);
        chkIsCompletion.TabIndex = 1;
        chkIsCompletion.Text = "완료 컬럼으로 지정 (번다운 차트용)";

        // lblColor
        lblColor.AutoSize = true;
        lblColor.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblColor.Location = new Point(12, 96);
        lblColor.Name = "lblColor";
        lblColor.Text = "헤더 색상";

        // panelColors
        panelColors.AutoSize = true;
        panelColors.Location = new Point(12, 114);
        panelColors.Name = "panelColors";
        panelColors.Size = new Size(320, 72);
        panelColors.WrapContents = true;

        // btnCustomColor
        btnCustomColor.Location = new Point(12, 192);
        btnCustomColor.Name = "btnCustomColor";
        btnCustomColor.Size = new Size(100, 26);
        btnCustomColor.TabIndex = 2;
        btnCustomColor.Text = "직접 선택...";
        btnCustomColor.Click += new EventHandler(btnCustomColor_Click);

        // lblPreviewLabel
        lblPreviewLabel.AutoSize = true;
        lblPreviewLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblPreviewLabel.Location = new Point(12, 232);
        lblPreviewLabel.Name = "lblPreviewLabel";
        lblPreviewLabel.Text = "미리보기";

        // panelPreview
        panelPreview.BackColor = Color.SteelBlue;
        panelPreview.Controls.Add(lblPreviewText);
        panelPreview.Location = new Point(12, 250);
        panelPreview.Name = "panelPreview";
        panelPreview.Size = new Size(320, 36);

        // lblPreviewText
        lblPreviewText.AutoSize = false;
        lblPreviewText.Dock = DockStyle.Fill;
        lblPreviewText.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
        lblPreviewText.ForeColor = Color.White;
        lblPreviewText.Name = "lblPreviewText";
        lblPreviewText.Padding = new Padding(6, 0, 0, 0);
        lblPreviewText.Text = "Column Name";
        lblPreviewText.TextAlign = ContentAlignment.MiddleLeft;

        // btnOk
        btnOk.Location = new Point(176, 304);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 28);
        btnOk.TabIndex = 3;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += new EventHandler(btnOk_Click);

        // btnCancel
        btnCancel.Location = new Point(257, 304);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 28);
        btnCancel.TabIndex = 4;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += new EventHandler(btnCancel_Click);

        // ColumnSettingsForm
        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(344, 344);
        Controls.AddRange(new Control[]
        {
            lblName, txtName,
            chkIsCompletion,
            lblColor, panelColors,
            btnCustomColor,
            lblPreviewLabel, panelPreview,
            btnOk, btnCancel
        });
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ColumnSettingsForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "컬럼 설정";

        panelPreview.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblName = null!;
    private TextBox txtName = null!;
    private CheckBox chkIsCompletion = null!;
    private Label lblColor = null!;
    private FlowLayoutPanel panelColors = null!;
    private Button btnCustomColor = null!;
    private Label lblPreviewLabel = null!;
    private Panel panelPreview = null!;
    private Label lblPreviewText = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;
}
