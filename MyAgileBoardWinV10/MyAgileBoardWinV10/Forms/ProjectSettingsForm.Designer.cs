namespace MyAgileBoardWinV10.Forms;

partial class ProjectSettingsForm
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
        txtProjectName = new TextBox();
        lblCreatedLabel = new Label();
        lblCreated = new Label();
        lblFilePathLabel = new Label();
        lblFilePath = new Label();
        btnOk = new Button();
        btnCancel = new Button();

        SuspendLayout();

        lblName.AutoSize = true;
        lblName.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblName.Location = new Point(12, 16);
        lblName.Name = "lblName";
        lblName.Text = "프로젝트 이름";

        txtProjectName.Font = new Font("Segoe UI", 11F);
        txtProjectName.Location = new Point(12, 36);
        txtProjectName.Name = "txtProjectName";
        txtProjectName.Size = new Size(360, 27);
        txtProjectName.TabIndex = 0;

        lblCreatedLabel.AutoSize = true;
        lblCreatedLabel.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
        lblCreatedLabel.ForeColor = Color.DimGray;
        lblCreatedLabel.Location = new Point(12, 74);
        lblCreatedLabel.Name = "lblCreatedLabel";
        lblCreatedLabel.Text = "프로젝트 정보";

        lblCreated.AutoSize = true;
        lblCreated.Font = new Font("Segoe UI", 8.5F);
        lblCreated.ForeColor = Color.DimGray;
        lblCreated.Location = new Point(12, 92);
        lblCreated.Name = "lblCreated";
        lblCreated.Text = "생성일: -";

        lblFilePathLabel.AutoSize = true;
        lblFilePathLabel.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
        lblFilePathLabel.ForeColor = Color.DimGray;
        lblFilePathLabel.Location = new Point(12, 114);
        lblFilePathLabel.Name = "lblFilePathLabel";
        lblFilePathLabel.Text = "파일 경로:";

        lblFilePath.AutoSize = false;
        lblFilePath.Font = new Font("Segoe UI", 8F);
        lblFilePath.ForeColor = Color.DimGray;
        lblFilePath.Location = new Point(12, 132);
        lblFilePath.Name = "lblFilePath";
        lblFilePath.Size = new Size(360, 32);
        lblFilePath.Text = "저장되지 않음";

        btnOk.Location = new Point(216, 176);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 28);
        btnOk.TabIndex = 1;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += new EventHandler(btnOk_Click);

        btnCancel.Location = new Point(297, 176);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 28);
        btnCancel.TabIndex = 2;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += new EventHandler(btnCancel_Click);

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(384, 216);
        Controls.AddRange(new Control[]
        {
            lblName, txtProjectName,
            lblCreatedLabel, lblCreated,
            lblFilePathLabel, lblFilePath,
            btnOk, btnCancel
        });
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ProjectSettingsForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "프로젝트 설정";

        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblName = null!;
    private TextBox txtProjectName = null!;
    private Label lblCreatedLabel = null!;
    private Label lblCreated = null!;
    private Label lblFilePathLabel = null!;
    private Label lblFilePath = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;
}
