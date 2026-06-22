namespace MyGitWinV10.App.Dialogs
{
    partial class OperationCompleteDetailDialog
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
            summaryLabel = new Label();
            detailsTextBox = new TextBox();
            copyButton = new Button();
            okButton = new Button();
            buttonPanel = new Panel();
            buttonPanel.SuspendLayout();
            SuspendLayout();
            //
            // summaryLabel
            //
            summaryLabel.Dock = DockStyle.Top;
            summaryLabel.Location = new Point(12, 12);
            summaryLabel.Name = "summaryLabel";
            summaryLabel.Padding = new Padding(0, 0, 0, 8);
            summaryLabel.Size = new Size(536, 48);
            summaryLabel.Text = "The operation completed successfully.";
            //
            // detailsTextBox
            //
            detailsTextBox.BackColor = Color.White;
            detailsTextBox.Dock = DockStyle.Fill;
            detailsTextBox.Font = new Font("Consolas", 9F);
            detailsTextBox.Location = new Point(12, 60);
            detailsTextBox.Multiline = true;
            detailsTextBox.Name = "detailsTextBox";
            detailsTextBox.ReadOnly = true;
            detailsTextBox.ScrollBars = ScrollBars.Vertical;
            detailsTextBox.Size = new Size(536, 300);
            detailsTextBox.TabIndex = 0;
            detailsTextBox.WordWrap = false;
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
            okButton.BackColor = Color.FromArgb(37, 99, 235);
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
            buttonPanel.TabIndex = 1;
            //
            // OperationCompleteDetailDialog
            //
            AcceptButton = okButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            ClientSize = new Size(560, 416);
            Controls.Add(detailsTextBox);
            Controls.Add(buttonPanel);
            Controls.Add(summaryLabel);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = false;
            MinimizeBox = false;
            MinimumSize = new Size(480, 320);
            Name = "OperationCompleteDetailDialog";
            Padding = new Padding(12);
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Complete";
            buttonPanel.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label summaryLabel;
        private TextBox detailsTextBox;
        private Panel buttonPanel;
        private Button copyButton;
        private Button okButton;
    }
}
