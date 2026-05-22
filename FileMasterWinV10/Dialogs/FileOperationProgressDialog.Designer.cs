namespace FileMasterWinV10.Dialogs;

partial class FileOperationProgressDialog
{
    private System.ComponentModel.IContainer components = null!;

    private TableLayoutPanel layoutPanel;
    private Label currentLabel;
    private ProgressBar progressBar;
    private Label countLabel;
    private Button cancelButton;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            components?.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        layoutPanel = new TableLayoutPanel();
        currentLabel = new Label();
        progressBar = new ProgressBar();
        countLabel = new Label();
        cancelButton = new Button();
        layoutPanel.SuspendLayout();
        SuspendLayout();
        //
        // layoutPanel
        //
        layoutPanel.ColumnCount = 1;
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutPanel.Controls.Add(currentLabel, 0, 0);
        layoutPanel.Controls.Add(progressBar, 0, 1);
        layoutPanel.Controls.Add(countLabel, 0, 2);
        layoutPanel.Controls.Add(cancelButton, 0, 3);
        layoutPanel.Dock = DockStyle.Fill;
        layoutPanel.Location = new Point(0, 0);
        layoutPanel.Name = "layoutPanel";
        layoutPanel.Padding = new Padding(20);
        layoutPanel.RowCount = 4;
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layoutPanel.Size = new Size(484, 180);
        layoutPanel.TabIndex = 0;
        //
        // currentLabel
        //
        currentLabel.AutoEllipsis = true;
        currentLabel.Dock = DockStyle.Fill;
        currentLabel.Location = new Point(20, 20);
        currentLabel.Margin = new Padding(0, 0, 0, 12);
        currentLabel.Name = "currentLabel";
        currentLabel.Size = new Size(444, 15);
        currentLabel.TabIndex = 0;
        currentLabel.Text = "준비 중...";
        //
        // progressBar
        //
        progressBar.Dock = DockStyle.Fill;
        progressBar.Location = new Point(20, 47);
        progressBar.Margin = new Padding(0, 0, 0, 8);
        progressBar.Name = "progressBar";
        progressBar.Size = new Size(444, 24);
        progressBar.Style = ProgressBarStyle.Continuous;
        progressBar.TabIndex = 1;
        //
        // countLabel
        //
        countLabel.AutoSize = true;
        countLabel.Dock = DockStyle.Fill;
        countLabel.Location = new Point(20, 79);
        countLabel.Margin = new Padding(0, 0, 0, 16);
        countLabel.Name = "countLabel";
        countLabel.Size = new Size(33, 15);
        countLabel.TabIndex = 2;
        countLabel.Text = "0 / 0";
        //
        // cancelButton
        //
        cancelButton.Anchor = AnchorStyles.Right;
        cancelButton.Location = new Point(376, 110);
        cancelButton.Margin = new Padding(0);
        cancelButton.Name = "cancelButton";
        cancelButton.Size = new Size(88, 32);
        cancelButton.TabIndex = 3;
        cancelButton.Text = "취소";
        cancelButton.UseVisualStyleBackColor = true;
        //
        // FileOperationProgressDialog
        //
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        CancelButton = cancelButton;
        ClientSize = new Size(484, 180);
        ControlBox = false;
        Controls.Add(layoutPanel);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "FileOperationProgressDialog";
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "작업 진행";
        layoutPanel.ResumeLayout(false);
        layoutPanel.PerformLayout();
        ResumeLayout(false);
    }
}
