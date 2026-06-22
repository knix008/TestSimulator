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
            detailsTextBox = new TextBox();
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
            summaryLabel.Location = new Point(40, 0);
            summaryLabel.Name = "summaryLabel";
            summaryLabel.Size = new Size(496, 48);
            summaryLabel.Text = "An error occurred.";
            //
            // detailsTextBox
            //
            detailsTextBox.BackColor = Color.White;
            detailsTextBox.BorderStyle = BorderStyle.FixedSingle;
            detailsTextBox.Dock = DockStyle.Fill;
            detailsTextBox.Font = new Font("Segoe UI", 9F);
            detailsTextBox.Location = new Point(12, 68);
            detailsTextBox.Multiline = true;
            detailsTextBox.Name = "detailsTextBox";
            detailsTextBox.ReadOnly = true;
            detailsTextBox.ScrollBars = ScrollBars.Vertical;
            detailsTextBox.Size = new Size(536, 292);
            detailsTextBox.TabIndex = 1;
            detailsTextBox.WordWrap = true;
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
            Controls.Add(detailsTextBox);
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
            buttonPanel.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Panel headerPanel;
        private PictureBox iconPictureBox;
        private Label summaryLabel;
        private TextBox detailsTextBox;
        private Panel buttonPanel;
        private Button copyButton;
        private Button okButton;
    }
}
