namespace ReqTrace.Forms;

partial class ProgressDialog
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private TableLayoutPanel layoutTable;
    private Label lblMessage;
    private ProgressBar progressBar;
    private Label lblPercent;

    private void InitializeComponent()
    {
        layoutTable = new TableLayoutPanel();
        lblMessage = new Label();
        progressBar = new ProgressBar();
        lblPercent = new Label();
        layoutTable.SuspendLayout();
        SuspendLayout();
        // 
        // layoutTable
        // 
        layoutTable.ColumnCount = 1;
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutTable.Controls.Add(lblMessage, 0, 0);
        layoutTable.Controls.Add(progressBar, 0, 1);
        layoutTable.Controls.Add(lblPercent, 0, 2);
        layoutTable.Dock = DockStyle.Fill;
        layoutTable.Location = new Point(0, 0);
        layoutTable.Name = "layoutTable";
        layoutTable.Padding = new Padding(16, 14, 16, 12);
        layoutTable.RowCount = 3;
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 28F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 24F));
        layoutTable.Size = new Size(420, 130);
        layoutTable.TabIndex = 0;
        // 
        // lblMessage
        // 
        lblMessage.Dock = DockStyle.Fill;
        lblMessage.Location = new Point(19, 14);
        lblMessage.Name = "lblMessage";
        lblMessage.Size = new Size(382, 30);
        lblMessage.TabIndex = 0;
        lblMessage.Text = "Working...";
        lblMessage.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // progressBar
        // 
        progressBar.Dock = DockStyle.Fill;
        progressBar.Location = new Point(19, 47);
        progressBar.Name = "progressBar";
        progressBar.Size = new Size(382, 22);
        progressBar.TabIndex = 1;
        // 
        // lblPercent
        // 
        lblPercent.Dock = DockStyle.Fill;
        lblPercent.Location = new Point(19, 72);
        lblPercent.Name = "lblPercent";
        lblPercent.Size = new Size(382, 24);
        lblPercent.TabIndex = 2;
        lblPercent.Text = "0%";
        lblPercent.TextAlign = ContentAlignment.MiddleCenter;
        // 
        // ProgressDialog
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(420, 130);
        ControlBox = false;
        Controls.Add(layoutTable);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ProgressDialog";
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "Progress";
        layoutTable.ResumeLayout(false);
        ResumeLayout(false);
    }
}
