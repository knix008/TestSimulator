namespace ReqTrace.Forms;

partial class TestRunEntryForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private TableLayoutPanel layoutTable;
    private Label lblStatus;
    private ComboBox cboStatus;
    private Label lblExecutedBy;
    private TextBox txtExecutedBy;
    private Label lblExecutedAt;
    private DateTimePicker dtExecuted;
    private Label lblBuild;
    private TextBox txtBuild;
    private Label lblNotes;
    private TextBox txtNotes;
    private Label lblRunHistory;
    private ListBox historyList;
    private Panel panelButtons;
    private Button btnOk;
    private Button btnCancel;

    private void InitializeComponent()
    {
        layoutTable = new TableLayoutPanel();
        lblStatus = new Label();
        cboStatus = new ComboBox();
        lblExecutedBy = new Label();
        txtExecutedBy = new TextBox();
        lblExecutedAt = new Label();
        dtExecuted = new DateTimePicker();
        lblBuild = new Label();
        txtBuild = new TextBox();
        lblNotes = new Label();
        txtNotes = new TextBox();
        lblRunHistory = new Label();
        historyList = new ListBox();
        panelButtons = new Panel();
        btnOk = new Button();
        btnCancel = new Button();
        layoutTable.SuspendLayout();
        panelButtons.SuspendLayout();
        SuspendLayout();
        // 
        // layoutTable
        // 
        layoutTable.ColumnCount = 2;
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110F));
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutTable.Controls.Add(lblStatus, 0, 0);
        layoutTable.Controls.Add(cboStatus, 1, 0);
        layoutTable.Controls.Add(lblExecutedBy, 0, 1);
        layoutTable.Controls.Add(txtExecutedBy, 1, 1);
        layoutTable.Controls.Add(lblExecutedAt, 0, 2);
        layoutTable.Controls.Add(dtExecuted, 1, 2);
        layoutTable.Controls.Add(lblBuild, 0, 3);
        layoutTable.Controls.Add(txtBuild, 1, 3);
        layoutTable.Controls.Add(lblNotes, 0, 4);
        layoutTable.Controls.Add(txtNotes, 1, 4);
        layoutTable.Controls.Add(lblRunHistory, 0, 5);
        layoutTable.Controls.Add(historyList, 0, 6);
        layoutTable.Dock = DockStyle.Fill;
        layoutTable.Location = new Point(0, 0);
        layoutTable.Name = "layoutTable";
        layoutTable.Padding = new Padding(12);
        layoutTable.RowCount = 7;
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 60F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layoutTable.Size = new Size(520, 412);
        layoutTable.TabIndex = 0;
        layoutTable.SetColumnSpan(lblRunHistory, 2);
        layoutTable.SetColumnSpan(historyList, 2);
        // 
        // lblStatus
        // 
        lblStatus.Anchor = AnchorStyles.Left;
        lblStatus.AutoSize = true;
        lblStatus.Location = new Point(15, 20);
        lblStatus.Margin = new Padding(3, 8, 3, 3);
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(43, 15);
        lblStatus.TabIndex = 0;
        lblStatus.Text = "Status:";
        // 
        // cboStatus
        // 
        cboStatus.Dock = DockStyle.Fill;
        cboStatus.DropDownStyle = ComboBoxStyle.DropDownList;
        cboStatus.Location = new Point(125, 15);
        cboStatus.Name = "cboStatus";
        cboStatus.Size = new Size(380, 23);
        cboStatus.TabIndex = 1;
        // 
        // lblExecutedBy
        // 
        lblExecutedBy.Anchor = AnchorStyles.Left;
        lblExecutedBy.AutoSize = true;
        lblExecutedBy.Location = new Point(15, 50);
        lblExecutedBy.Margin = new Padding(3, 8, 3, 3);
        lblExecutedBy.Name = "lblExecutedBy";
        lblExecutedBy.Size = new Size(74, 15);
        lblExecutedBy.TabIndex = 2;
        lblExecutedBy.Text = "Executed By:";
        // 
        // txtExecutedBy
        // 
        txtExecutedBy.Dock = DockStyle.Fill;
        txtExecutedBy.Location = new Point(125, 45);
        txtExecutedBy.Name = "txtExecutedBy";
        txtExecutedBy.Size = new Size(380, 23);
        txtExecutedBy.TabIndex = 3;
        // 
        // lblExecutedAt
        // 
        lblExecutedAt.Anchor = AnchorStyles.Left;
        lblExecutedAt.AutoSize = true;
        lblExecutedAt.Location = new Point(15, 80);
        lblExecutedAt.Margin = new Padding(3, 8, 3, 3);
        lblExecutedAt.Name = "lblExecutedAt";
        lblExecutedAt.Size = new Size(74, 15);
        lblExecutedAt.TabIndex = 4;
        lblExecutedAt.Text = "Executed At:";
        // 
        // dtExecuted
        // 
        dtExecuted.CustomFormat = "yyyy-MM-dd HH:mm";
        dtExecuted.Dock = DockStyle.Fill;
        dtExecuted.Format = DateTimePickerFormat.Custom;
        dtExecuted.Location = new Point(125, 75);
        dtExecuted.Name = "dtExecuted";
        dtExecuted.Size = new Size(380, 23);
        dtExecuted.TabIndex = 5;
        // 
        // lblBuild
        // 
        lblBuild.Anchor = AnchorStyles.Left;
        lblBuild.AutoSize = true;
        lblBuild.Location = new Point(15, 110);
        lblBuild.Margin = new Padding(3, 8, 3, 3);
        lblBuild.Name = "lblBuild";
        lblBuild.Size = new Size(87, 15);
        lblBuild.TabIndex = 6;
        lblBuild.Text = "Build/Version:";
        // 
        // txtBuild
        // 
        txtBuild.Dock = DockStyle.Fill;
        txtBuild.Location = new Point(125, 105);
        txtBuild.Name = "txtBuild";
        txtBuild.Size = new Size(380, 23);
        txtBuild.TabIndex = 7;
        // 
        // lblNotes
        // 
        lblNotes.Anchor = AnchorStyles.Left;
        lblNotes.AutoSize = true;
        lblNotes.Location = new Point(15, 140);
        lblNotes.Margin = new Padding(3, 8, 3, 3);
        lblNotes.Name = "lblNotes";
        lblNotes.Size = new Size(41, 15);
        lblNotes.TabIndex = 8;
        lblNotes.Text = "Notes:";
        // 
        // txtNotes
        // 
        txtNotes.Dock = DockStyle.Fill;
        txtNotes.Location = new Point(125, 135);
        txtNotes.Multiline = true;
        txtNotes.Name = "txtNotes";
        txtNotes.ScrollBars = ScrollBars.Vertical;
        txtNotes.Size = new Size(380, 54);
        txtNotes.TabIndex = 9;
        // 
        // lblRunHistory
        // 
        lblRunHistory.Anchor = AnchorStyles.Left;
        lblRunHistory.AutoSize = true;
        lblRunHistory.Location = new Point(15, 195);
        lblRunHistory.Margin = new Padding(3, 8, 3, 3);
        lblRunHistory.Name = "lblRunHistory";
        lblRunHistory.Size = new Size(72, 15);
        lblRunHistory.TabIndex = 10;
        lblRunHistory.Text = "Run History:";
        // 
        // historyList
        // 
        historyList.Dock = DockStyle.Fill;
        historyList.FormattingEnabled = true;
        historyList.ItemHeight = 15;
        historyList.Location = new Point(15, 217);
        historyList.Name = "historyList";
        historyList.Size = new Size(490, 184);
        historyList.TabIndex = 11;
        // 
        // panelButtons
        // 
        panelButtons.Controls.Add(btnOk);
        panelButtons.Controls.Add(btnCancel);
        panelButtons.Dock = DockStyle.Bottom;
        panelButtons.Location = new Point(0, 412);
        panelButtons.Name = "panelButtons";
        panelButtons.Size = new Size(520, 48);
        panelButtons.TabIndex = 1;
        // 
        // btnOk
        // 
        btnOk.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnOk.DialogResult = DialogResult.OK;
        btnOk.Location = new Point(346, 10);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 25);
        btnOk.TabIndex = 0;
        btnOk.Text = "OK";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;
        // 
        // btnCancel
        // 
        btnCancel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(433, 10);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 25);
        btnCancel.TabIndex = 1;
        btnCancel.Text = "Cancel";
        btnCancel.UseVisualStyleBackColor = true;
        // 
        // TestRunEntryForm
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(520, 460);
        Controls.Add(layoutTable);
        Controls.Add(panelButtons);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(440, 400);
        Name = "TestRunEntryForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Record Test Run";
        layoutTable.ResumeLayout(false);
        layoutTable.PerformLayout();
        panelButtons.ResumeLayout(false);
        ResumeLayout(false);
    }
}
