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
            hintLabel = new Label();
            copyButton = new Button();
            okButton = new Button();
            buttonPanel = new Panel();
            headerPanel.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)iconPictureBox).BeginInit();
            buttonPanel.SuspendLayout();
            SuspendLayout();
            //
            // headerPanel
            //
            headerPanel.Controls.Add(hintLabel);
            headerPanel.Controls.Add(summaryLabel);
            headerPanel.Controls.Add(iconPictureBox);
            headerPanel.Dock = DockStyle.Fill;
            headerPanel.Location = new Point(12, 12);
            headerPanel.Name = "headerPanel";
            headerPanel.Padding = new Padding(0, 0, 0, 8);
            headerPanel.Size = new Size(536, 96);
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
            summaryLabel.AutoSize = true;
            summaryLabel.ForeColor = Color.FromArgb(30, 41, 59);
            summaryLabel.Location = new Point(40, 0);
            summaryLabel.MaximumSize = new Size(496, 0);
            summaryLabel.Name = "summaryLabel";
            summaryLabel.Size = new Size(0, 15);
            summaryLabel.Text = "An error occurred.";
            //
            // hintLabel
            //
            hintLabel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            hintLabel.AutoSize = true;
            hintLabel.ForeColor = Color.FromArgb(100, 116, 139);
            hintLabel.Location = new Point(40, 24);
            hintLabel.MaximumSize = new Size(496, 0);
            hintLabel.Name = "hintLabel";
            hintLabel.Size = new Size(0, 15);
            hintLabel.TabIndex = 2;
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
            buttonPanel.Location = new Point(12, 108);
            buttonPanel.Name = "buttonPanel";
            buttonPanel.Size = new Size(536, 44);
            buttonPanel.TabIndex = 1;
            //
            // ErrorDetailDialog
            //
            AcceptButton = okButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            ClientSize = new Size(560, 164);
            Controls.Add(headerPanel);
            Controls.Add(buttonPanel);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = false;
            MinimizeBox = false;
            MinimumSize = new Size(480, 140);
            Name = "ErrorDetailDialog";
            Padding = new Padding(12);
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Error";
            headerPanel.ResumeLayout(false);
            headerPanel.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)iconPictureBox).EndInit();
            buttonPanel.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion

        private Panel headerPanel;
        private PictureBox iconPictureBox;
        private Label summaryLabel;
        private Label hintLabel;
        private Panel buttonPanel;
        private Button copyButton;
        private Button okButton;
    }
}
