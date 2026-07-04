namespace MyWorkspace.Win.Forms;

partial class NotificationSettingsForm
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
        lblEmail = new Label();
        txtEmail = new TextBox();
        chkNotifyPageUpdate = new CheckBox();
        chkNotifyWorkspaceChange = new CheckBox();
        lblEmailStatus = new Label();
        btnSave = new ThemedDialogButton();
        btnCancel = new ThemedDialogButton();
        SuspendLayout();

        lblEmail.AutoSize = true;
        lblEmail.Location = new Point(16, 20);
        lblEmail.Text = "이메일";

        txtEmail.Location = new Point(120, 16);
        txtEmail.Size = new Size(280, 23);

        chkNotifyPageUpdate.AutoSize = true;
        chkNotifyPageUpdate.Location = new Point(120, 52);
        chkNotifyPageUpdate.Text = "Page 생성·수정·삭제 알림";

        chkNotifyWorkspaceChange.AutoSize = true;
        chkNotifyWorkspaceChange.Location = new Point(120, 78);
        chkNotifyWorkspaceChange.Text = "Workspace 변경·멤버 변경 알림";

        lblEmailStatus.AutoSize = true;
        lblEmailStatus.Location = new Point(120, 108);
        lblEmailStatus.MaximumSize = new Size(280, 0);
        lblEmailStatus.Text = string.Empty;

        btnSave.Location = new Point(220, 160);
        btnSave.Name = "btnSave";
        btnSave.Size = new Size(96, 32);
        btnSave.Text = "저장";
        btnSave.Click += btnSave_Click;

        btnCancel.Location = new Point(315, 160);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(96, 32);
        btnCancel.Text = "취소";
        btnCancel.Click += btnCancel_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(420, 208);
        Controls.Add(btnCancel);
        Controls.Add(btnSave);
        Controls.Add(lblEmailStatus);
        Controls.Add(chkNotifyWorkspaceChange);
        Controls.Add(chkNotifyPageUpdate);
        Controls.Add(txtEmail);
        Controls.Add(lblEmail);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "NotificationSettingsForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "알림 설정";
        Load += NotificationSettingsForm_Load;
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblEmail;
    private TextBox txtEmail;
    private CheckBox chkNotifyPageUpdate;
    private CheckBox chkNotifyWorkspaceChange;
    private Label lblEmailStatus;
    private Button btnSave;
    private Button btnCancel;
}
