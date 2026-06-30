namespace MyWorkspace.Win.Forms;

partial class AccountProfileForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        lblUsername = new Label();
        txtUsername = new TextBox();
        btnSave = new Button();
        btnCancel = new Button();
        SuspendLayout();

        lblUsername.AutoSize = true;
        lblUsername.Location = new Point(16, 24);
        lblUsername.Text = "사용자 ID";

        txtUsername.Location = new Point(120, 20);
        txtUsername.Size = new Size(220, 23);

        btnSave.Location = new Point(120, 64);
        btnSave.Size = new Size(90, 30);
        btnSave.Text = "저장";
        btnSave.Click += btnSave_Click;

        btnCancel.Location = new Point(250, 64);
        btnCancel.Size = new Size(90, 30);
        btnCancel.Text = "취소";
        btnCancel.Click += btnCancel_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(364, 112);
        Controls.Add(btnCancel);
        Controls.Add(btnSave);
        Controls.Add(txtUsername);
        Controls.Add(lblUsername);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "AccountProfileForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "프로필 수정";
        Load += AccountProfileForm_Load;
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblUsername;
    private TextBox txtUsername;
    private Button btnSave;
    private Button btnCancel;
}
