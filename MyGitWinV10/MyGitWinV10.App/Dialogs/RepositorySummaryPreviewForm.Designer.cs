namespace MyGitWinV10.App.Dialogs
{
    partial class RepositorySummaryPreviewForm
    {
        private System.ComponentModel.IContainer components = null;

        private void InitializeComponent()
        {
            headerPanel = new Panel();
            titleLabel = new Label();
            subtitleLabel = new Label();
            contentPanel = new Panel();
            buttonPanel = new Panel();
            exportPdfButton = new Button();
            exportWordButton = new Button();
            exportMarkdownButton = new Button();
            closeButton = new Button();
            headerPanel.SuspendLayout();
            buttonPanel.SuspendLayout();
            SuspendLayout();
            //
            // headerPanel
            //
            headerPanel.BackColor = Color.FromArgb(238, 242, 255);
            headerPanel.Controls.Add(titleLabel);
            headerPanel.Controls.Add(subtitleLabel);
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Location = new Point(0, 0);
            headerPanel.Name = "headerPanel";
            headerPanel.Padding = new Padding(20, 16, 20, 12);
            headerPanel.Size = new Size(884, 72);
            headerPanel.TabIndex = 0;
            //
            // titleLabel
            //
            titleLabel.AutoSize = true;
            titleLabel.Font = new Font("Segoe UI", 13f, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(30, 64, 175);
            titleLabel.Location = new Point(20, 16);
            titleLabel.Name = "titleLabel";
            titleLabel.Size = new Size(130, 25);
            titleLabel.Text = "Report Preview";
            //
            // subtitleLabel
            //
            subtitleLabel.AutoSize = true;
            subtitleLabel.ForeColor = Color.FromArgb(71, 85, 105);
            subtitleLabel.Location = new Point(22, 44);
            subtitleLabel.Name = "subtitleLabel";
            subtitleLabel.Size = new Size(120, 15);
            subtitleLabel.Text = "Preview subtitle";
            //
            // contentPanel
            //
            contentPanel.AutoScroll = true;
            contentPanel.BackColor = Color.White;
            contentPanel.Dock = DockStyle.Fill;
            contentPanel.Location = new Point(0, 72);
            contentPanel.Name = "contentPanel";
            contentPanel.Padding = new Padding(12);
            contentPanel.Size = new Size(884, 489);
            contentPanel.TabIndex = 1;
            //
            // buttonPanel
            //
            buttonPanel.BackColor = Color.FromArgb(245, 246, 248);
            buttonPanel.Controls.Add(exportPdfButton);
            buttonPanel.Controls.Add(exportWordButton);
            buttonPanel.Controls.Add(exportMarkdownButton);
            buttonPanel.Controls.Add(closeButton);
            buttonPanel.Dock = DockStyle.Bottom;
            buttonPanel.Location = new Point(0, 561);
            buttonPanel.Name = "buttonPanel";
            buttonPanel.Padding = new Padding(16, 10, 16, 10);
            buttonPanel.Size = new Size(884, 52);
            buttonPanel.TabIndex = 2;
            //
            // exportPdfButton
            //
            exportPdfButton.BackColor = Color.FromArgb(37, 99, 235);
            exportPdfButton.FlatStyle = FlatStyle.Flat;
            exportPdfButton.ForeColor = Color.White;
            exportPdfButton.Location = new Point(16, 10);
            exportPdfButton.Name = "exportPdfButton";
            exportPdfButton.Size = new Size(110, 30);
            exportPdfButton.TabIndex = 0;
            exportPdfButton.Text = "Export PDF";
            exportPdfButton.UseVisualStyleBackColor = false;
            exportPdfButton.Click += ExportPdfButton_Click;
            //
            // exportWordButton
            //
            exportWordButton.BackColor = Color.FromArgb(37, 99, 235);
            exportWordButton.FlatStyle = FlatStyle.Flat;
            exportWordButton.ForeColor = Color.White;
            exportWordButton.Location = new Point(132, 10);
            exportWordButton.Name = "exportWordButton";
            exportWordButton.Size = new Size(110, 30);
            exportWordButton.TabIndex = 1;
            exportWordButton.Text = "Export Word";
            exportWordButton.UseVisualStyleBackColor = false;
            exportWordButton.Click += ExportWordButton_Click;
            //
            // exportMarkdownButton
            //
            exportMarkdownButton.BackColor = Color.FromArgb(37, 99, 235);
            exportMarkdownButton.FlatStyle = FlatStyle.Flat;
            exportMarkdownButton.ForeColor = Color.White;
            exportMarkdownButton.Location = new Point(248, 10);
            exportMarkdownButton.Name = "exportMarkdownButton";
            exportMarkdownButton.Size = new Size(130, 30);
            exportMarkdownButton.TabIndex = 2;
            exportMarkdownButton.Text = "Export Markdown";
            exportMarkdownButton.UseVisualStyleBackColor = false;
            exportMarkdownButton.Click += ExportMarkdownButton_Click;
            //
            // closeButton
            //
            closeButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            closeButton.DialogResult = DialogResult.Cancel;
            closeButton.FlatStyle = FlatStyle.Flat;
            closeButton.Location = new Point(793, 10);
            closeButton.Name = "closeButton";
            closeButton.Size = new Size(75, 30);
            closeButton.TabIndex = 3;
            closeButton.Text = "Close";
            //
            // RepositorySummaryPreviewForm
            //
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            CancelButton = closeButton;
            ClientSize = new Size(884, 613);
            Controls.Add(contentPanel);
            Controls.Add(buttonPanel);
            Controls.Add(headerPanel);
            Font = new Font("Segoe UI", 9F);
            MinimumSize = new Size(720, 520);
            Name = "RepositorySummaryPreviewForm";
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Report Preview";
            headerPanel.ResumeLayout(false);
            headerPanel.PerformLayout();
            buttonPanel.ResumeLayout(false);
            ResumeLayout(false);
        }

        private Panel headerPanel;
        private Label titleLabel;
        private Label subtitleLabel;
        private Panel contentPanel;
        private Panel buttonPanel;
        private Button exportPdfButton;
        private Button exportWordButton;
        private Button exportMarkdownButton;
        private Button closeButton;
    }
}
