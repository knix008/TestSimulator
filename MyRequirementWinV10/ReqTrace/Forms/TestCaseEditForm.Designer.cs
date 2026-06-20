namespace ReqTrace.Forms;

partial class TestCaseEditForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private TableLayoutPanel layoutTable;
    private Label lblCode;
    private TextBox txtCode;
    private Label lblTitle;
    private TextBox txtTitle;
    private Label lblPreconditions;
    private TextBox txtPreconditions;
    private Label lblExpectedResult;
    private TextBox txtExpectedResult;
    private Label lblSteps;
    private DataGridView stepsGrid;
    private Panel panelButtons;
    private Button btnOk;
    private Button btnCancel;

    private void InitializeComponent()
    {
        layoutTable = new TableLayoutPanel();
        lblCode = new Label();
        txtCode = new TextBox();
        lblTitle = new Label();
        txtTitle = new TextBox();
        lblPreconditions = new Label();
        txtPreconditions = new TextBox();
        lblExpectedResult = new Label();
        txtExpectedResult = new TextBox();
        lblSteps = new Label();
        stepsGrid = new DataGridView();
        panelButtons = new Panel();
        btnOk = new Button();
        btnCancel = new Button();
        layoutTable.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)stepsGrid).BeginInit();
        panelButtons.SuspendLayout();
        SuspendLayout();
        // 
        // layoutTable
        // 
        layoutTable.ColumnCount = 2;
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110F));
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutTable.Controls.Add(lblCode, 0, 0);
        layoutTable.Controls.Add(txtCode, 1, 0);
        layoutTable.Controls.Add(lblTitle, 0, 1);
        layoutTable.Controls.Add(txtTitle, 1, 1);
        layoutTable.Controls.Add(lblPreconditions, 0, 2);
        layoutTable.Controls.Add(txtPreconditions, 1, 2);
        layoutTable.Controls.Add(lblExpectedResult, 0, 3);
        layoutTable.Controls.Add(txtExpectedResult, 1, 3);
        layoutTable.Controls.Add(lblSteps, 0, 4);
        layoutTable.Controls.Add(stepsGrid, 0, 5);
        layoutTable.Dock = DockStyle.Fill;
        layoutTable.Location = new Point(0, 0);
        layoutTable.Name = "layoutTable";
        layoutTable.Padding = new Padding(12);
        layoutTable.RowCount = 6;
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 60F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 60F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layoutTable.Size = new Size(560, 432);
        layoutTable.TabIndex = 0;
        layoutTable.SetColumnSpan(lblSteps, 2);
        layoutTable.SetColumnSpan(stepsGrid, 2);
        // 
        // lblCode
        // 
        lblCode.Anchor = AnchorStyles.Left;
        lblCode.AutoSize = true;
        lblCode.Location = new Point(15, 20);
        lblCode.Margin = new Padding(3, 8, 3, 3);
        lblCode.Name = "lblCode";
        lblCode.Size = new Size(38, 15);
        lblCode.TabIndex = 0;
        lblCode.Text = "Code:";
        // 
        // txtCode
        // 
        txtCode.Dock = DockStyle.Fill;
        txtCode.Location = new Point(125, 15);
        txtCode.Name = "txtCode";
        txtCode.Size = new Size(420, 23);
        txtCode.TabIndex = 1;
        // 
        // lblTitle
        // 
        lblTitle.Anchor = AnchorStyles.Left;
        lblTitle.AutoSize = true;
        lblTitle.Location = new Point(15, 50);
        lblTitle.Margin = new Padding(3, 8, 3, 3);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(32, 15);
        lblTitle.TabIndex = 2;
        lblTitle.Text = "Title:";
        // 
        // txtTitle
        // 
        txtTitle.Dock = DockStyle.Fill;
        txtTitle.Location = new Point(125, 45);
        txtTitle.Name = "txtTitle";
        txtTitle.Size = new Size(420, 23);
        txtTitle.TabIndex = 3;
        // 
        // lblPreconditions
        // 
        lblPreconditions.Anchor = AnchorStyles.Left;
        lblPreconditions.AutoSize = true;
        lblPreconditions.Location = new Point(15, 80);
        lblPreconditions.Margin = new Padding(3, 8, 3, 3);
        lblPreconditions.Name = "lblPreconditions";
        lblPreconditions.Size = new Size(84, 15);
        lblPreconditions.TabIndex = 4;
        lblPreconditions.Text = "Preconditions:";
        // 
        // txtPreconditions
        // 
        txtPreconditions.Dock = DockStyle.Fill;
        txtPreconditions.Location = new Point(125, 75);
        txtPreconditions.Multiline = true;
        txtPreconditions.Name = "txtPreconditions";
        txtPreconditions.ScrollBars = ScrollBars.Vertical;
        txtPreconditions.Size = new Size(420, 54);
        txtPreconditions.TabIndex = 5;
        // 
        // lblExpectedResult
        // 
        lblExpectedResult.Anchor = AnchorStyles.Left;
        lblExpectedResult.AutoSize = true;
        lblExpectedResult.Location = new Point(15, 140);
        lblExpectedResult.Margin = new Padding(3, 8, 3, 3);
        lblExpectedResult.Name = "lblExpectedResult";
        lblExpectedResult.Size = new Size(92, 15);
        lblExpectedResult.TabIndex = 6;
        lblExpectedResult.Text = "Expected Result:";
        // 
        // txtExpectedResult
        // 
        txtExpectedResult.Dock = DockStyle.Fill;
        txtExpectedResult.Location = new Point(125, 135);
        txtExpectedResult.Multiline = true;
        txtExpectedResult.Name = "txtExpectedResult";
        txtExpectedResult.ScrollBars = ScrollBars.Vertical;
        txtExpectedResult.Size = new Size(420, 54);
        txtExpectedResult.TabIndex = 7;
        // 
        // lblSteps
        // 
        lblSteps.Anchor = AnchorStyles.Left;
        lblSteps.AutoSize = true;
        lblSteps.Location = new Point(15, 195);
        lblSteps.Margin = new Padding(3, 8, 3, 3);
        lblSteps.Name = "lblSteps";
        lblSteps.Size = new Size(38, 15);
        lblSteps.TabIndex = 8;
        lblSteps.Text = "Steps:";
        // 
        // stepsGrid
        // 
        stepsGrid.AllowUserToAddRows = true;
        stepsGrid.AllowUserToDeleteRows = true;
        stepsGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        stepsGrid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        stepsGrid.Dock = DockStyle.Fill;
        stepsGrid.Location = new Point(15, 217);
        stepsGrid.Name = "stepsGrid";
        stepsGrid.RowHeadersVisible = false;
        stepsGrid.Size = new Size(530, 203);
        stepsGrid.TabIndex = 9;
        // 
        // panelButtons
        // 
        panelButtons.Controls.Add(btnOk);
        panelButtons.Controls.Add(btnCancel);
        panelButtons.Dock = DockStyle.Bottom;
        panelButtons.Location = new Point(0, 432);
        panelButtons.Name = "panelButtons";
        panelButtons.Size = new Size(560, 48);
        panelButtons.TabIndex = 1;
        // 
        // btnOk
        // 
        btnOk.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnOk.DialogResult = DialogResult.OK;
        btnOk.Location = new Point(386, 10);
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
        btnCancel.Location = new Point(473, 10);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 25);
        btnCancel.TabIndex = 1;
        btnCancel.Text = "Cancel";
        btnCancel.UseVisualStyleBackColor = true;
        // 
        // TestCaseEditForm
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(560, 480);
        Controls.Add(layoutTable);
        Controls.Add(panelButtons);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(480, 400);
        Name = "TestCaseEditForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Test Case";
        layoutTable.ResumeLayout(false);
        layoutTable.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)stepsGrid).EndInit();
        panelButtons.ResumeLayout(false);
        ResumeLayout(false);
    }
}
