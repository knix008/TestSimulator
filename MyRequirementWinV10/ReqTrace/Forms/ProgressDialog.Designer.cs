namespace ReqTrace.Forms;

partial class ProgressDialog
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            elapsedTimer?.Stop();
            elapsedTimer?.Dispose();
            if (components != null)
                components.Dispose();
        }
        base.Dispose(disposing);
    }

    private TableLayoutPanel layoutTable;
    private Label lblStep;
    private Label lblDetail;
    private ProgressBar progressBar;
    private Label lblPercent;
    private Label lblElapsed;
    private Button btnCancel;
    private System.Windows.Forms.Timer elapsedTimer = null!;

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        layoutTable = new TableLayoutPanel();
        lblStep = new Label();
        lblDetail = new Label();
        progressBar = new ProgressBar();
        lblPercent = new Label();
        lblElapsed = new Label();
        btnCancel = new Button();
        elapsedTimer = new System.Windows.Forms.Timer(components);
        layoutTable.SuspendLayout();
        SuspendLayout();
        // 
        // layoutTable
        // 
        layoutTable.ColumnCount = 1;
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutTable.Controls.Add(lblStep, 0, 0);
        layoutTable.Controls.Add(lblDetail, 0, 1);
        layoutTable.Controls.Add(progressBar, 0, 2);
        layoutTable.Controls.Add(lblPercent, 0, 3);
        layoutTable.Controls.Add(lblElapsed, 0, 4);
        layoutTable.Controls.Add(btnCancel, 0, 5);
        layoutTable.Dock = DockStyle.Fill;
        layoutTable.Location = new Point(0, 0);
        layoutTable.Name = "layoutTable";
        layoutTable.Padding = new Padding(16, 14, 16, 12);
        layoutTable.RowCount = 6;
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 40F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 28F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        layoutTable.Size = new Size(460, 230);
        layoutTable.TabIndex = 0;
        // 
        // lblStep
        // 
        lblStep.Dock = DockStyle.Fill;
        lblStep.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
        lblStep.Location = new Point(19, 14);
        lblStep.Name = "lblStep";
        lblStep.Size = new Size(422, 36);
        lblStep.TabIndex = 0;
        lblStep.Text = "Working...";
        lblStep.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // lblDetail
        // 
        lblDetail.Dock = DockStyle.Fill;
        lblDetail.Location = new Point(19, 50);
        lblDetail.Name = "lblDetail";
        lblDetail.Size = new Size(422, 40);
        lblDetail.TabIndex = 1;
        lblDetail.Text = "Detail";
        lblDetail.TextAlign = ContentAlignment.TopLeft;
        // 
        // progressBar
        // 
        progressBar.Dock = DockStyle.Fill;
        progressBar.Location = new Point(19, 90);
        progressBar.Name = "progressBar";
        progressBar.Size = new Size(422, 22);
        progressBar.TabIndex = 2;
        // 
        // lblPercent
        // 
        lblPercent.Dock = DockStyle.Fill;
        lblPercent.Location = new Point(19, 112);
        lblPercent.Name = "lblPercent";
        lblPercent.Size = new Size(422, 22);
        lblPercent.TabIndex = 3;
        lblPercent.Text = "0%";
        lblPercent.TextAlign = ContentAlignment.MiddleCenter;
        // 
        // lblElapsed
        // 
        lblElapsed.Dock = DockStyle.Fill;
        lblElapsed.Location = new Point(19, 134);
        lblElapsed.Name = "lblElapsed";
        lblElapsed.Size = new Size(422, 22);
        lblElapsed.TabIndex = 4;
        lblElapsed.Text = "Elapsed";
        lblElapsed.TextAlign = ContentAlignment.MiddleCenter;
        // 
        // btnCancel
        // 
        btnCancel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnCancel.AutoSize = true;
        btnCancel.Location = new Point(366, 158);
        btnCancel.Margin = new Padding(0, 4, 0, 0);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 28);
        btnCancel.TabIndex = 5;
        btnCancel.Text = "Cancel";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += btnCancel_Click;
        // 
        // elapsedTimer
        // 
        elapsedTimer.Interval = 1000;
        elapsedTimer.Tick += elapsedTimer_Tick;
        // 
        // ProgressDialog
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(460, 230);
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
        layoutTable.PerformLayout();
        ResumeLayout(false);
    }
}
