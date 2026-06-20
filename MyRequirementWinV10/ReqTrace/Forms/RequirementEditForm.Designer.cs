namespace ReqTrace.Forms;

partial class RequirementEditForm
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
    private Label lblDescription;
    private TextBox txtDescription;
    private Label lblCategory;
    private ComboBox cboCategory;
    private Label lblPriority;
    private ComboBox cboPriority;
    private Label lblStatus;
    private ComboBox cboStatus;
    private Label lblSource;
    private TextBox txtSource;
    private Label lblParent;
    private ComboBox cboParent;
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
        lblDescription = new Label();
        txtDescription = new TextBox();
        lblCategory = new Label();
        cboCategory = new ComboBox();
        lblPriority = new Label();
        cboPriority = new ComboBox();
        lblStatus = new Label();
        cboStatus = new ComboBox();
        lblSource = new Label();
        txtSource = new TextBox();
        lblParent = new Label();
        cboParent = new ComboBox();
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
        layoutTable.Controls.Add(lblCode, 0, 0);
        layoutTable.Controls.Add(txtCode, 1, 0);
        layoutTable.Controls.Add(lblTitle, 0, 1);
        layoutTable.Controls.Add(txtTitle, 1, 1);
        layoutTable.Controls.Add(lblDescription, 0, 2);
        layoutTable.Controls.Add(txtDescription, 1, 2);
        layoutTable.Controls.Add(lblCategory, 0, 3);
        layoutTable.Controls.Add(cboCategory, 1, 3);
        layoutTable.Controls.Add(lblPriority, 0, 4);
        layoutTable.Controls.Add(cboPriority, 1, 4);
        layoutTable.Controls.Add(lblStatus, 0, 5);
        layoutTable.Controls.Add(cboStatus, 1, 5);
        layoutTable.Controls.Add(lblSource, 0, 6);
        layoutTable.Controls.Add(txtSource, 1, 6);
        layoutTable.Controls.Add(lblParent, 0, 7);
        layoutTable.Controls.Add(cboParent, 1, 7);
        layoutTable.Dock = DockStyle.Fill;
        layoutTable.Location = new Point(0, 0);
        layoutTable.Name = "layoutTable";
        layoutTable.Padding = new Padding(12);
        layoutTable.RowCount = 8;
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.Size = new Size(560, 412);
        layoutTable.TabIndex = 0;
        // 
        // lblCode
        // 
        lblCode.Anchor = AnchorStyles.Left;
        lblCode.AutoSize = true;
        lblCode.Location = new Point(15, 22);
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
        lblTitle.Location = new Point(15, 52);
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
        // lblDescription
        // 
        lblDescription.Anchor = AnchorStyles.Left;
        lblDescription.AutoSize = true;
        lblDescription.Location = new Point(15, 156);
        lblDescription.Margin = new Padding(3, 8, 3, 3);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(71, 15);
        lblDescription.TabIndex = 4;
        lblDescription.Text = "Description:";
        // 
        // txtDescription
        // 
        txtDescription.Dock = DockStyle.Fill;
        txtDescription.Location = new Point(125, 75);
        txtDescription.Multiline = true;
        txtDescription.Name = "txtDescription";
        txtDescription.ScrollBars = ScrollBars.Vertical;
        txtDescription.Size = new Size(420, 172);
        txtDescription.TabIndex = 5;
        // 
        // lblCategory
        // 
        lblCategory.Anchor = AnchorStyles.Left;
        lblCategory.AutoSize = true;
        lblCategory.Location = new Point(15, 260);
        lblCategory.Margin = new Padding(3, 8, 3, 3);
        lblCategory.Name = "lblCategory";
        lblCategory.Size = new Size(58, 15);
        lblCategory.TabIndex = 6;
        lblCategory.Text = "Category:";
        // 
        // cboCategory
        // 
        cboCategory.Dock = DockStyle.Fill;
        cboCategory.Location = new Point(125, 253);
        cboCategory.Name = "cboCategory";
        cboCategory.Size = new Size(420, 23);
        cboCategory.TabIndex = 7;
        // 
        // lblPriority
        // 
        lblPriority.Anchor = AnchorStyles.Left;
        lblPriority.AutoSize = true;
        lblPriority.Location = new Point(15, 290);
        lblPriority.Margin = new Padding(3, 8, 3, 3);
        lblPriority.Name = "lblPriority";
        lblPriority.Size = new Size(48, 15);
        lblPriority.TabIndex = 8;
        lblPriority.Text = "Priority:";
        // 
        // cboPriority
        // 
        cboPriority.Dock = DockStyle.Fill;
        cboPriority.DropDownStyle = ComboBoxStyle.DropDownList;
        cboPriority.Location = new Point(125, 283);
        cboPriority.Name = "cboPriority";
        cboPriority.Size = new Size(420, 23);
        cboPriority.TabIndex = 9;
        // 
        // lblStatus
        // 
        lblStatus.Anchor = AnchorStyles.Left;
        lblStatus.AutoSize = true;
        lblStatus.Location = new Point(15, 320);
        lblStatus.Margin = new Padding(3, 8, 3, 3);
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(43, 15);
        lblStatus.TabIndex = 10;
        lblStatus.Text = "Status:";
        // 
        // cboStatus
        // 
        cboStatus.Dock = DockStyle.Fill;
        cboStatus.DropDownStyle = ComboBoxStyle.DropDownList;
        cboStatus.Location = new Point(125, 313);
        cboStatus.Name = "cboStatus";
        cboStatus.Size = new Size(420, 23);
        cboStatus.TabIndex = 11;
        // 
        // lblSource
        // 
        lblSource.Anchor = AnchorStyles.Left;
        lblSource.AutoSize = true;
        lblSource.Location = new Point(15, 350);
        lblSource.Margin = new Padding(3, 8, 3, 3);
        lblSource.Name = "lblSource";
        lblSource.Size = new Size(47, 15);
        lblSource.TabIndex = 12;
        lblSource.Text = "Source:";
        // 
        // txtSource
        // 
        txtSource.Dock = DockStyle.Fill;
        txtSource.Location = new Point(125, 343);
        txtSource.Name = "txtSource";
        txtSource.Size = new Size(420, 23);
        txtSource.TabIndex = 13;
        // 
        // lblParent
        // 
        lblParent.Anchor = AnchorStyles.Left;
        lblParent.AutoSize = true;
        lblParent.Location = new Point(15, 380);
        lblParent.Margin = new Padding(3, 8, 3, 3);
        lblParent.Name = "lblParent";
        lblParent.Size = new Size(44, 15);
        lblParent.TabIndex = 14;
        lblParent.Text = "Parent:";
        // 
        // cboParent
        // 
        cboParent.Dock = DockStyle.Fill;
        cboParent.DropDownStyle = ComboBoxStyle.DropDownList;
        cboParent.Location = new Point(125, 373);
        cboParent.Name = "cboParent";
        cboParent.Size = new Size(420, 23);
        cboParent.TabIndex = 15;
        // 
        // panelButtons
        // 
        panelButtons.Controls.Add(btnOk);
        panelButtons.Controls.Add(btnCancel);
        panelButtons.Dock = DockStyle.Bottom;
        panelButtons.Location = new Point(0, 412);
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
        // RequirementEditForm
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(560, 460);
        Controls.Add(layoutTable);
        Controls.Add(panelButtons);
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(480, 420);
        Name = "RequirementEditForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Requirement";
        layoutTable.ResumeLayout(false);
        layoutTable.PerformLayout();
        panelButtons.ResumeLayout(false);
        ResumeLayout(false);
    }
}
