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
        btnAdd = new Button();
        btnEdit = new Button();
        btnDelete = new Button();
        btnClose = new Button();
        ((System.ComponentModel.ISupportInitialize)gridUsers).BeginInit();
        SuspendLayout();

        gridUsers.AllowUserToAddRows = false;
        gridUsers.AllowUserToDeleteRows = false;
        gridUsers.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        gridUsers.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        gridUsers.Columns.AddRange(new DataGridViewColumn[] { colId, colUsername, colRole, colCreatedAt });
        gridUsers.Location = new Point(12, 12);
        gridUsers.MultiSelect = false;
        gridUsers.Name = "gridUsers";
        gridUsers.ReadOnly = true;
        gridUsers.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        gridUsers.Size = new Size(560, 320);
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

        btnAdd.Location = new Point(12, 344);
        btnAdd.Name = "btnAdd";
        btnAdd.Size = new Size(90, 30);
        btnAdd.Text = "추가";
        btnAdd.Click += btnAdd_Click;

        btnEdit.Location = new Point(108, 344);
        btnEdit.Name = "btnEdit";
        btnEdit.Size = new Size(90, 30);
        btnEdit.Text = "수정";
        btnEdit.Click += btnEdit_Click;

        btnDelete.Location = new Point(204, 344);
        btnDelete.Name = "btnDelete";
        btnDelete.Size = new Size(90, 30);
        btnDelete.Text = "삭제";
        btnDelete.Click += btnDelete_Click;

        btnClose.Location = new Point(482, 344);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(90, 30);
        btnClose.Text = "닫기";
        btnClose.Click += btnClose_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(584, 386);
        Controls.Add(btnClose);
        Controls.Add(btnDelete);
        Controls.Add(btnEdit);
        Controls.Add(btnAdd);
        Controls.Add(gridUsers);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "AdminUserForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "사용자 관리";
        Load += AdminUserForm_Load;
        ((System.ComponentModel.ISupportInitialize)gridUsers).EndInit();
        ResumeLayout(false);
    }

    private DataGridView gridUsers;
    private DataGridViewTextBoxColumn colId;
    private DataGridViewTextBoxColumn colUsername;
    private DataGridViewTextBoxColumn colRole;
    private DataGridViewTextBoxColumn colCreatedAt;
    private Button btnAdd;
    private Button btnEdit;
    private Button btnDelete;
    private Button btnClose;
}
