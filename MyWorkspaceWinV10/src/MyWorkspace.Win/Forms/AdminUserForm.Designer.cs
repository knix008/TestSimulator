namespace MyWorkspace.Win.Forms;

partial class AdminUserForm
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
        gridUsers = new DataGridView();
        colId = new DataGridViewTextBoxColumn();
        colUsername = new DataGridViewTextBoxColumn();
        colRole = new DataGridViewTextBoxColumn();
        colCreatedAt = new DataGridViewTextBoxColumn();
        pnlFooter = new Panel();
        flowActions = new FlowLayoutPanel();
        btnAdd = new Button();
        btnEdit = new Button();
        btnDelete = new Button();
        btnClose = new Button();
        ((System.ComponentModel.ISupportInitialize)gridUsers).BeginInit();
        pnlFooter.SuspendLayout();
        flowActions.SuspendLayout();
        SuspendLayout();

        gridUsers.AllowUserToAddRows = false;
        gridUsers.AllowUserToDeleteRows = false;
        gridUsers.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        gridUsers.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        gridUsers.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        gridUsers.Columns.AddRange(new DataGridViewColumn[] { colId, colUsername, colRole, colCreatedAt });
        gridUsers.Location = new Point(16, 12);
        gridUsers.MultiSelect = false;
        gridUsers.Name = "gridUsers";
        gridUsers.ReadOnly = true;
        gridUsers.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        gridUsers.Size = new Size(552, 312);
        gridUsers.TabIndex = 0;

        colId.HeaderText = "ID";
        colId.Name = "colId";
        colId.Visible = false;
        colUsername.HeaderText = "사용자 ID";
        colUsername.Name = "colUsername";
        colRole.HeaderText = "역할";
        colRole.Name = "colRole";
        colCreatedAt.HeaderText = "생성일";
        colCreatedAt.Name = "colCreatedAt";

        pnlFooter.Controls.Add(btnClose);
        pnlFooter.Controls.Add(flowActions);
        pnlFooter.Dock = DockStyle.Bottom;
        pnlFooter.Location = new Point(0, 336);
        pnlFooter.Name = "pnlFooter";
        pnlFooter.Padding = new Padding(12, 8, 12, 8);
        pnlFooter.Size = new Size(584, 52);

        flowActions.Controls.Add(btnAdd);
        flowActions.Controls.Add(btnEdit);
        flowActions.Controls.Add(btnDelete);
        flowActions.Dock = DockStyle.Left;
        flowActions.FlowDirection = FlowDirection.LeftToRight;
        flowActions.Location = new Point(12, 8);
        flowActions.Name = "flowActions";
        flowActions.Size = new Size(320, 36);
        flowActions.WrapContents = false;

        btnAdd.Name = "btnAdd";
        btnAdd.Size = new Size(84, 32);
        btnAdd.TabIndex = 1;
        btnAdd.Text = "추가";
        btnAdd.UseVisualStyleBackColor = true;
        btnAdd.Click += btnAdd_Click;

        btnEdit.Name = "btnEdit";
        btnEdit.Size = new Size(84, 32);
        btnEdit.TabIndex = 2;
        btnEdit.Text = "수정";
        btnEdit.UseVisualStyleBackColor = true;
        btnEdit.Click += btnEdit_Click;

        btnDelete.Margin = new Padding(8, 0, 0, 0);
        btnDelete.Name = "btnDelete";
        btnDelete.Size = new Size(84, 32);
        btnDelete.TabIndex = 3;
        btnDelete.Text = "삭제";
        btnDelete.UseVisualStyleBackColor = true;
        btnDelete.Click += btnDelete_Click;

        btnClose.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnClose.DialogResult = DialogResult.Cancel;
        btnClose.Location = new Point(480, 8);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(92, 32);
        btnClose.TabIndex = 4;
        btnClose.Text = "닫기";
        btnClose.UseVisualStyleBackColor = true;
        btnClose.Click += btnClose_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnClose;
        ClientSize = new Size(584, 388);
        Controls.Add(gridUsers);
        Controls.Add(pnlFooter);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(600, 427);
        Name = "AdminUserForm";
        Padding = new Padding(0, 0, 0, 0);
        StartPosition = FormStartPosition.CenterParent;
        Text = "사용자 관리";
        Load += AdminUserForm_Load;
        ((System.ComponentModel.ISupportInitialize)gridUsers).EndInit();
        pnlFooter.ResumeLayout(false);
        flowActions.ResumeLayout(false);
        ResumeLayout(false);
    }

    private DataGridView gridUsers;
    private DataGridViewTextBoxColumn colId;
    private DataGridViewTextBoxColumn colUsername;
    private DataGridViewTextBoxColumn colRole;
    private DataGridViewTextBoxColumn colCreatedAt;
    private Panel pnlFooter;
    private FlowLayoutPanel flowActions;
    private Button btnAdd;
    private Button btnEdit;
    private Button btnDelete;
    private Button btnClose;
}
