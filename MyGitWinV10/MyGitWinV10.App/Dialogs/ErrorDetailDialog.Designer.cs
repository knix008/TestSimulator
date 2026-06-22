namespace MyGitWinV10.App.Dialogs
{
    partial class ErrorDetailDialog
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }

            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            headerPanel = new Panel();
            iconPictureBox = new PictureBox();
            summaryLabel = new Label();
            detailsPanel = new Panel();
            detailsLabel = new Label();
            copyButton = new Button();
            okButton = new Button();
            buttonPanel = new Panel();
            headerPanel.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)iconPictureBox).BeginInit();
            detailsPanel.SuspendLayout();
            buttonPanel.SuspendLayout();
            SuspendLayout();
            //
            // headerPanel
            //
            headerPanel.Controls.Add(summaryLabel);
            headerPanel.Controls.Add(iconPictureBox);
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Location = new Point(12, 12);
            headerPanel.Name = "headerPanel";
            headerPanel.Padding = new Padding(0, 0, 0, 8);
            headerPanel.Size = new Size(536, 56);
            headerPanel.TabIndex = 0;
            //
            // iconPictureBox
            //
            iconPictureBox.Location = new Point(0, 0);
            iconPictureBox.Name = "iconPictureBox";
            iconPictureBox.Size = new Size(32, 32);
            iconPictureBox.TabIndex = 0;
            iconPictureBox.TabStop = false;
            //
            // summaryLabel
            //
            summaryLabel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            summaryLabel.ForeColor = Color.FromArgb(30, 41, 59);
            summaryLabel.Location = new Point(40, 0);
            summaryLabel.Name = "summaryLabel";
            summaryLabel.Size = new Size(496, 48);
            summaryLabel.Text = "An error occurred.";
            //
            // detailsPanel
            //
            detailsPanel.AutoScroll = true;
            detailsPanel.BackColor = Color.FromArgb(250, 250, 251);
            detailsPanel.Controls.Add(detailsLabel);
            detailsPanel.Dock = DockStyle.Fill;
            detailsPanel.Location = new Point(12, 68);
            detailsPanel.Name = "detailsPanel";
            detailsPanel.Padding = new Padding(0, 4, 0, 0);
            detailsPanel.Size = new Size(536, 292);
            detailsPanel.TabIndex = 1;
            //
            // detailsLabel
            //
            detailsLabel.AutoSize = true;
            detailsLabel.Font = new Font("Consolas", 9F);
            detailsLabel.ForeColor = Color.FromArgb(51, 65, 85);
            detailsLabel.Location = new Point(0, 4);
            detailsLabel.Name = "detailsLabel";
            detailsLabel.Size = new Size(0, 14);
            detailsLabel.TabIndex = 0;
            detailsLabel.UseMnemonic = false;
            //
            // copyButton
            //
            copyButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            copyButton.FlatStyle = FlatStyle.Flat;
            copyButton.Location = new Point(334, 8);
            copyButton.Name = "copyButton";
            copyButton.Size = new Size(96, 28);
            copyButton.TabIndex = 0;
            copyButton.Text = "Copy Details";
            copyButton.Click += CopyButton_Click;
            //
            // okButton
            //
            okButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            okButton.BackColor = Color.FromArgb(220, 38, 38);
            okButton.DialogResult = DialogResult.OK;
            okButton.FlatStyle = FlatStyle.Flat;
            okButton.ForeColor = Color.White;
            okButton.Location = new Point(436, 8);
            okButton.Name = "okButton";
            okButton.Size = new Size(96, 28);
            okButton.TabIndex = 1;
            okButton.Text = "OK";
            //
            // buttonPanel
            //
            buttonPanel.Controls.Add(copyButton);
            buttonPanel.Controls.Add(okButton);
            buttonPanel.Dock = DockStyle.Bottom;
            buttonPanel.Location = new Point(12, 360);
            buttonPanel.Name = "buttonPanel";
            buttonPanel.Size = new Size(536, 44);
            buttonPanel.TabIndex = 2;
            //
            // ErrorDetailDialog
            //
            AcceptButton = okButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            ClientSize = new Size(560, 416);
            Controls.Add(detailsPanel);
            Controls.Add(buttonPanel);
            Controls.Add(headerPanel);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = false;
            MinimizeBox = false;
            MinimumSize = new Size(480, 320);
            Name = "ErrorDetailDialog";
            Padding = new Padding(12);
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Error";
            headerPanel.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)iconPictureBox).EndInit();
            detailsPanel.ResumeLayout(false);
            detailsPanel.PerformLayout();
            buttonPanel.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion

        private Panel headerPanel;
        private PictureBox iconPictureBox;
        private Label summaryLabel;
        private Panel detailsPanel;
        private Label detailsLabel;
        private Panel buttonPanel;
        private Button copyButton;
        private Button okButton;
    }
}
