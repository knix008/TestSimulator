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
        chkShowGrid = new CheckBox();
        lblCreatedLabel = new Label();
        lblCreated = new Label();
        lblFilePathLabel = new Label();
        lblFilePath = new Label();
        btnOk = new Button();
        btnCancel = new Button();

        SuspendLayout();

        // lblName
        lblName.AutoSize = true;
        lblName.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblName.Location = new Point(12, 16);
        lblName.Name = "lblName";
        lblName.Text = "프로젝트 이름";

        // txtProjectName
        txtProjectName.Font = new Font("Segoe UI", 11F);
        txtProjectName.Location = new Point(12, 36);
        txtProjectName.Name = "txtProjectName";
        txtProjectName.Size = new Size(360, 27);
        txtProjectName.TabIndex = 0;

        // chkShowGrid
        chkShowGrid.AutoSize = true;
        chkShowGrid.Font = new Font("Segoe UI", 9F);
        chkShowGrid.Location = new Point(12, 74);
        chkShowGrid.Name = "chkShowGrid";
        chkShowGrid.Text = "배경 눈금 표시";
        chkShowGrid.TabIndex = 1;

        // lblCreatedLabel
        lblCreatedLabel.AutoSize = true;
        lblCreatedLabel.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
        lblCreatedLabel.ForeColor = Color.DimGray;
        lblCreatedLabel.Location = new Point(12, 104);
        lblCreatedLabel.Name = "lblCreatedLabel";
        lblCreatedLabel.Text = "프로젝트 정보";

        // lblCreated
        lblCreated.AutoSize = true;
        lblCreated.Font = new Font("Segoe UI", 8.5F);
        lblCreated.ForeColor = Color.DimGray;
        lblCreated.Location = new Point(12, 122);
        lblCreated.Name = "lblCreated";
        lblCreated.Text = "생성일: -";

        // lblFilePathLabel
        lblFilePathLabel.AutoSize = true;
        lblFilePathLabel.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
        lblFilePathLabel.ForeColor = Color.DimGray;
        lblFilePathLabel.Location = new Point(12, 144);
        lblFilePathLabel.Name = "lblFilePathLabel";
        lblFilePathLabel.Text = "파일 경로:";

        // lblFilePath
        lblFilePath.AutoSize = false;
        lblFilePath.Font = new Font("Segoe UI", 8F);
        lblFilePath.ForeColor = Color.DimGray;
        lblFilePath.Location = new Point(12, 162);
        lblFilePath.Name = "lblFilePath";
        lblFilePath.Size = new Size(360, 32);
        lblFilePath.Text = "저장되지 않음";

        // btnOk
        btnOk.Location = new Point(216, 206);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 28);
        btnOk.TabIndex = 2;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += new EventHandler(btnOk_Click);

        // btnCancel
        btnCancel.Location = new Point(297, 206);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 28);
        btnCancel.TabIndex = 3;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += new EventHandler(btnCancel_Click);

        // ProjectSettingsForm
        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(384, 246);
        Controls.AddRange(new Control[]
        {
            lblName, txtProjectName,
            chkShowGrid,
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
    private CheckBox chkShowGrid = null!;
    private Label lblCreatedLabel = null!;
    private Label lblCreated = null!;
    private Label lblFilePathLabel = null!;
    private Label lblFilePath = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;
}
