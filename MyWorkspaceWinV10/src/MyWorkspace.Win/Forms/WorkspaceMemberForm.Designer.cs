namespace MyWorkspace.Win.Forms;

partial class WorkspaceMemberForm
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
        lstMembers = new ListBox();
        lblMembers = new Label();
        lblAddUser = new Label();
        cboUser = new ComboBox();
        lblRole = new Label();
        cboRole = new ComboBox();
        btnAdd = new Button();
        btnRemove = new Button();
        btnClose = new Button();
        SuspendLayout();

        lblMembers.AutoSize = true;
        lblMembers.Location = new Point(12, 12);
        lblMembers.Text = "등록된 멤버";

        lstMembers.FormattingEnabled = true;
        lstMembers.ItemHeight = 15;
        lstMembers.Location = new Point(12, 32);
        lstMembers.Size = new Size(360, 169);

        lblAddUser.AutoSize = true;
        lblAddUser.Location = new Point(12, 216);
        lblAddUser.Text = "사용자";

        cboUser.DropDownStyle = ComboBoxStyle.DropDownList;
        cboUser.Location = new Point(72, 212);
        cboUser.Size = new Size(180, 23);

        lblRole.AutoSize = true;
        lblRole.Location = new Point(12, 248);
        lblRole.Text = "역할";

        cboRole.DropDownStyle = ComboBoxStyle.DropDownList;
        cboRole.Location = new Point(72, 244);
        cboRole.Size = new Size(180, 23);

        btnAdd.Location = new Point(268, 212);
        btnAdd.Size = new Size(104, 28);
        btnAdd.Text = "멤버 추가";
        btnAdd.Click += btnAdd_Click;

        btnRemove.Location = new Point(268, 244);
        btnRemove.Size = new Size(104, 28);
        btnRemove.Text = "멤버 제거";
        btnRemove.Click += btnRemove_Click;

        btnClose.Location = new Point(272, 284);
        btnClose.Size = new Size(100, 30);
        btnClose.Text = "닫기";
        btnClose.Click += btnClose_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(384, 326);
        Controls.Add(btnClose);
        Controls.Add(btnRemove);
        Controls.Add(btnAdd);
        Controls.Add(cboRole);
        Controls.Add(lblRole);
        Controls.Add(cboUser);
        Controls.Add(lblAddUser);
        Controls.Add(lstMembers);
        Controls.Add(lblMembers);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "WorkspaceMemberForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Workspace 멤버";
        Load += WorkspaceMemberForm_Load;
        ResumeLayout(false);
        PerformLayout();
    }

    private ListBox lstMembers;
    private Label lblMembers;
    private Label lblAddUser;
    private ComboBox cboUser;
    private Label lblRole;
    private ComboBox cboRole;
    private Button btnAdd;
    private Button btnRemove;
    private Button btnClose;
}
