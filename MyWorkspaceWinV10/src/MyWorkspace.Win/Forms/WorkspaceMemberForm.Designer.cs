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
        pnlAddMember = new Panel();
        tblAddMember = new TableLayoutPanel();
        lblAddUser = new Label();
        cboUser = new ThemedComboBox();
        btnAdd = new Button();
        lblRole = new Label();
        cboRole = new ThemedComboBox();
        btnRemove = new Button();
        pnlFooter = new Panel();
        btnSave = new Button();
        btnCancel = new Button();
        pnlAddMember.SuspendLayout();
        tblAddMember.SuspendLayout();
        pnlFooter.SuspendLayout();
        SuspendLayout();

        lblMembers.AutoSize = true;
        lblMembers.Location = new Point(16, 12);
        lblMembers.Name = "lblMembers";
        lblMembers.Text = "등록된 멤버";

        lstMembers.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        lstMembers.FormattingEnabled = true;
        lstMembers.ItemHeight = 15;
        lstMembers.Location = new Point(16, 32);
        lstMembers.Name = "lstMembers";
        lstMembers.Size = new Size(408, 148);
        lstMembers.SelectedIndexChanged += lstMembers_SelectedIndexChanged;

        pnlAddMember.Controls.Add(tblAddMember);
        pnlAddMember.Dock = DockStyle.Bottom;
        pnlAddMember.Location = new Point(0, 188);
        pnlAddMember.Name = "pnlAddMember";
        pnlAddMember.Padding = new Padding(12, 8, 12, 8);
        pnlAddMember.Size = new Size(440, 88);

        tblAddMember.ColumnCount = 3;
        tblAddMember.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72F));
        tblAddMember.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tblAddMember.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tblAddMember.Controls.Add(lblAddUser, 0, 0);
        tblAddMember.Controls.Add(cboUser, 1, 0);
        tblAddMember.Controls.Add(btnAdd, 2, 0);
        tblAddMember.Controls.Add(lblRole, 0, 1);
        tblAddMember.Controls.Add(cboRole, 1, 1);
        tblAddMember.Controls.Add(btnRemove, 2, 1);
        tblAddMember.Dock = DockStyle.Fill;
        tblAddMember.Name = "tblAddMember";
        tblAddMember.RowCount = 2;
        tblAddMember.RowStyles.Add(new RowStyle(SizeType.Percent, 50F));
        tblAddMember.RowStyles.Add(new RowStyle(SizeType.Percent, 50F));

        lblAddUser.AutoSize = false;
        lblAddUser.Dock = DockStyle.Fill;
        lblAddUser.Name = "lblAddUser";
        lblAddUser.Text = "사용자";
        lblAddUser.TextAlign = ContentAlignment.MiddleLeft;

        cboUser.Dock = DockStyle.Fill;
        cboUser.DropDownStyle = ComboBoxStyle.DropDownList;
        cboUser.Margin = new Padding(0, 4, 8, 4);
        cboUser.Name = "cboUser";

        btnAdd.AutoSize = true;
        btnAdd.Margin = new Padding(0, 2, 0, 2);
        btnAdd.MinimumSize = new Size(96, 32);
        btnAdd.Name = "btnAdd";
        btnAdd.TabIndex = 4;
        btnAdd.Text = "멤버 추가";
        btnAdd.UseVisualStyleBackColor = true;
        btnAdd.Click += btnAdd_Click;

        lblRole.AutoSize = false;
        lblRole.Dock = DockStyle.Fill;
        lblRole.Name = "lblRole";
        lblRole.Text = "역할";
        lblRole.TextAlign = ContentAlignment.MiddleLeft;

        cboRole.Dock = DockStyle.Fill;
        cboRole.DropDownStyle = ComboBoxStyle.DropDownList;
        cboRole.Margin = new Padding(0, 4, 8, 4);
        cboRole.Name = "cboRole";
        cboRole.SelectedIndexChanged += cboRole_SelectedIndexChanged;

        btnRemove.AutoSize = true;
        btnRemove.Margin = new Padding(0, 2, 0, 2);
        btnRemove.MinimumSize = new Size(96, 32);
        btnRemove.Name = "btnRemove";
        btnRemove.TabIndex = 5;
        btnRemove.Text = "멤버 제거";
        btnRemove.UseVisualStyleBackColor = true;
        btnRemove.Click += btnRemove_Click;

        pnlFooter.Controls.Add(btnCancel);
        pnlFooter.Controls.Add(btnSave);
        pnlFooter.Dock = DockStyle.Bottom;
        pnlFooter.Location = new Point(0, 276);
        pnlFooter.Name = "pnlFooter";
        pnlFooter.Padding = new Padding(12, 8, 12, 8);
        pnlFooter.Size = new Size(440, 48);

        btnSave.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnSave.Location = new Point(220, 8);
        btnSave.Name = "btnOk";
        btnSave.Size = new Size(100, 32);
        btnSave.TabIndex = 6;
        btnSave.Text = "저장";
        btnSave.UseVisualStyleBackColor = true;
        btnSave.Click += btnSave_Click;

        btnCancel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(328, 8);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(100, 32);
        btnCancel.TabIndex = 7;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += btnCancel_Click;

        AcceptButton = btnSave;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(440, 324);
        Controls.Add(lstMembers);
        Controls.Add(lblMembers);
        Controls.Add(pnlAddMember);
        Controls.Add(pnlFooter);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(456, 363);
        Name = "WorkspaceMemberForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Workspace 멤버";
        FormClosing += WorkspaceMemberForm_FormClosing;
        Load += WorkspaceMemberForm_Load;
        pnlAddMember.ResumeLayout(false);
        tblAddMember.ResumeLayout(false);
        pnlFooter.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }

    private ListBox lstMembers;
    private Label lblMembers;
    private Panel pnlAddMember;
    private TableLayoutPanel tblAddMember;
    private Label lblAddUser;
    private ThemedComboBox cboUser;
    private Button btnAdd;
    private Label lblRole;
    private ThemedComboBox cboRole;
    private Button btnRemove;
    private Panel pnlFooter;
    private Button btnSave;
    private Button btnCancel;
}
