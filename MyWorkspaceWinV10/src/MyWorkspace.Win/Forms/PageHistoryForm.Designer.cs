namespace MyWorkspace.Win.Forms;

partial class PageHistoryForm
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
        gridVersions = new DataGridView();
        colVersionId = new DataGridViewTextBoxColumn();
        colSavedAt = new DataGridViewTextBoxColumn();
        colSavedBy = new DataGridViewTextBoxColumn();
        colTitle = new DataGridViewTextBoxColumn();
        splitMain = new SplitContainer();
        txtPreview = new TextBox();
        btnRestore = new Button();
        btnClose = new Button();
        lblList = new Label();
        lblPreview = new Label();
        ((System.ComponentModel.ISupportInitialize)gridVersions).BeginInit();
        ((System.ComponentModel.ISupportInitialize)splitMain).BeginInit();
        splitMain.Panel1.SuspendLayout();
        splitMain.Panel2.SuspendLayout();
        splitMain.SuspendLayout();
        SuspendLayout();

        lblList.AutoSize = true;
        lblList.Location = new Point(12, 12);
        lblList.Text = "저장된 버전";

        gridVersions.AllowUserToAddRows = false;
        gridVersions.AllowUserToDeleteRows = false;
        gridVersions.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        gridVersions.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        gridVersions.Columns.AddRange(new DataGridViewColumn[] { colVersionId, colSavedAt, colSavedBy, colTitle });
        gridVersions.Dock = DockStyle.Fill;
        gridVersions.MultiSelect = false;
        gridVersions.ReadOnly = true;
        gridVersions.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        gridVersions.SelectionChanged += gridVersions_SelectionChanged;

        colVersionId.HeaderText = "ID";
        colVersionId.Name = "colVersionId";
        colVersionId.Visible = false;
        colSavedAt.HeaderText = "저장 시각";
        colSavedAt.Name = "colSavedAt";
        colSavedAt.FillWeight = 90;
        colSavedBy.HeaderText = "저장자";
        colSavedBy.Name = "colSavedBy";
        colSavedBy.FillWeight = 70;
        colTitle.HeaderText = "제목";
        colTitle.Name = "colTitle";

        lblPreview.AutoSize = true;
        lblPreview.Dock = DockStyle.Top;
        lblPreview.Padding = new Padding(0, 0, 0, 4);
        lblPreview.Text = "미리보기";

        txtPreview.Dock = DockStyle.Fill;
        txtPreview.Font = new Font("Consolas", 10F);
        txtPreview.Multiline = true;
        txtPreview.ReadOnly = true;
        txtPreview.ScrollBars = ScrollBars.Both;
        txtPreview.WordWrap = false;

        splitMain.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        splitMain.Location = new Point(12, 32);
        splitMain.Size = new Size(760, 380);
        splitMain.SplitterDistance = 360;
        splitMain.Panel1.Controls.Add(gridVersions);
        splitMain.Panel2.Controls.Add(txtPreview);
        splitMain.Panel2.Controls.Add(lblPreview);

        btnRestore.Location = new Point(572, 422);
        btnRestore.Size = new Size(100, 32);
        btnRestore.Text = "복원";
        btnRestore.Enabled = false;
        btnRestore.Click += btnRestore_Click;

        btnClose.Location = new Point(672, 422);
        btnClose.Size = new Size(100, 32);
        btnClose.Text = "닫기";
        btnClose.Click += btnClose_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(784, 466);
        Controls.Add(btnClose);
        Controls.Add(btnRestore);
        Controls.Add(splitMain);
        Controls.Add(lblList);
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimumSize = new Size(640, 400);
        Name = "PageHistoryForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "버전 이력";
        Load += PageHistoryForm_Load;
        ((System.ComponentModel.ISupportInitialize)gridVersions).EndInit();
        splitMain.Panel1.ResumeLayout(false);
        splitMain.Panel2.ResumeLayout(false);
        splitMain.Panel2.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)splitMain).EndInit();
        splitMain.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }

    private DataGridView gridVersions;
    private DataGridViewTextBoxColumn colVersionId;
    private DataGridViewTextBoxColumn colSavedAt;
    private DataGridViewTextBoxColumn colSavedBy;
    private DataGridViewTextBoxColumn colTitle;
    private SplitContainer splitMain;
    private TextBox txtPreview;
    private Button btnRestore;
    private Button btnClose;
    private Label lblList;
    private Label lblPreview;
}
