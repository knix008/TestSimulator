namespace MyWorkspace.Win.Forms;

partial class PageLogForm
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
        gridLogs = new DataGridView();
        colLogId = new DataGridViewTextBoxColumn();
        colChangedAt = new DataGridViewTextBoxColumn();
        colChangedBy = new DataGridViewTextBoxColumn();
        colChange = new DataGridViewTextBoxColumn();
        btnClose = new ThemedDialogButton();
        lblList = new Label();
        ((System.ComponentModel.ISupportInitialize)gridLogs).BeginInit();
        SuspendLayout();

        lblList.AutoSize = true;
        lblList.Location = new Point(12, 12);
        lblList.Text = "변경 Log";

        gridLogs.AllowUserToAddRows = false;
        gridLogs.AllowUserToDeleteRows = false;
        gridLogs.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        gridLogs.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        gridLogs.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        gridLogs.Columns.AddRange(new DataGridViewColumn[] { colLogId, colChangedAt, colChangedBy, colChange });
        gridLogs.Location = new Point(12, 32);
        gridLogs.MultiSelect = false;
        gridLogs.ReadOnly = true;
        gridLogs.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        gridLogs.Size = new Size(760, 380);

        colLogId.HeaderText = "ID";
        colLogId.Name = "colLogId";
        colLogId.Visible = false;
        colChangedAt.HeaderText = "변경 시각";
        colChangedAt.Name = "colChangedAt";
        colChangedAt.FillWeight = 90;
        colChangedBy.HeaderText = "변경자";
        colChangedBy.Name = "colChangedBy";
        colChangedBy.FillWeight = 70;
        colChange.HeaderText = "변경 내용";
        colChange.Name = "colChange";
        colChange.FillWeight = 180;

        btnClose.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnClose.Location = new Point(672, 422);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(100, 32);
        btnClose.Text = "닫기";
        btnClose.Click += btnClose_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(784, 466);
        Controls.Add(btnClose);
        Controls.Add(gridLogs);
        Controls.Add(lblList);
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimumSize = new Size(640, 400);
        Name = "PageLogForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Page 변경 Log";
        Load += PageLogForm_Load;
        ((System.ComponentModel.ISupportInitialize)gridLogs).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private DataGridView gridLogs;
    private DataGridViewTextBoxColumn colLogId;
    private DataGridViewTextBoxColumn colChangedAt;
    private DataGridViewTextBoxColumn colChangedBy;
    private DataGridViewTextBoxColumn colChange;
    private Button btnClose;
    private Label lblList;
}
