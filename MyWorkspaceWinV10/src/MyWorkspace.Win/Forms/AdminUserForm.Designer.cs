namespace MyWorkspace.Win.Forms;

partial class AdminUserForm
{
    private void InitializeComponent()
    {
        gridUsers = new DataGridView();
        colId = new DataGridViewTextBoxColumn();
        colUsername = new DataGridViewTextBoxColumn();
        colRole = new DataGridViewTextBoxColumn();
        colCreatedAt = new DataGridViewTextBoxColumn();
        pnlFooter = new Panel();
        tblFooter = new TableLayoutPanel();
        flowActions = new FlowLayoutPanel();
        btnAdd = new ThemedDialogButton();
        btnEdit = new ThemedDialogButton();
        btnDelete = new ThemedDialogButton();
        btnClose = new ThemedDialogButton();
        ((System.ComponentModel.ISupportInitialize)gridUsers).BeginInit();
        pnlFooter.SuspendLayout();
        tblFooter.SuspendLayout();
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

        pnlFooter.Controls.Add(tblFooter);
        pnlFooter.Dock = DockStyle.Bottom;
        pnlFooter.Location = new Point(0, 336);
        pnlFooter.Name = "pnlFooter";
        pnlFooter.Padding = new Padding(12, 8, 12, 8);
        pnlFooter.Size = new Size(584, 52);
        pnlFooter.Tag = "layout";

        tblFooter.ColumnCount = 3;
        tblFooter.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tblFooter.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tblFooter.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tblFooter.Controls.Add(flowActions, 0, 0);
        tblFooter.Controls.Add(btnClose, 2, 0);
        tblFooter.Dock = DockStyle.Fill;
        tblFooter.Location = new Point(12, 8);
        tblFooter.Name = "tblFooter";
        tblFooter.RowCount = 1;
        tblFooter.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblFooter.Size = new Size(560, 36);
        tblFooter.Tag = "layout";

        flowActions.AutoSize = true;
        flowActions.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        flowActions.Controls.Add(btnAdd);
        flowActions.Controls.Add(btnEdit);
        flowActions.Controls.Add(btnDelete);
        flowActions.FlowDirection = FlowDirection.LeftToRight;
        flowActions.Location = new Point(0, 0);
        flowActions.Margin = new Padding(0);
        flowActions.Name = "flowActions";
        flowActions.Size = new Size(260, 32);
        flowActions.Tag = "layout";
        flowActions.WrapContents = false;

        btnAdd.Margin = new Padding(0);
        btnAdd.Name = "btnAdd";
        btnAdd.Size = new Size(84, 32);
        btnAdd.TabIndex = 1;
        btnAdd.Text = "추가";
        btnAdd.UseVisualStyleBackColor = true;
        btnAdd.Click += btnAdd_Click;

        btnEdit.Margin = new Padding(8, 0, 0, 0);
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

        btnClose.DialogResult = DialogResult.Cancel;
        btnClose.Margin = new Padding(0);
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
        pnlFooter.PerformLayout();
        tblFooter.ResumeLayout(false);
        tblFooter.PerformLayout();
        flowActions.ResumeLayout(false);
        flowActions.PerformLayout();
        ResumeLayout(false);
    }

    private DataGridView gridUsers;
    private DataGridViewTextBoxColumn colId;
    private DataGridViewTextBoxColumn colUsername;
    private DataGridViewTextBoxColumn colRole;
    private DataGridViewTextBoxColumn colCreatedAt;
    private Panel pnlFooter;
    private TableLayoutPanel tblFooter;
    private FlowLayoutPanel flowActions;
    private Button btnAdd;
    private Button btnEdit;
    private Button btnDelete;
    private Button btnClose;
}
