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
            summaryLabel = new Label();
            copyButton = new Button();
            okButton = new Button();
            SuspendLayout();
            //
            // summaryLabel
            //
            summaryLabel.Location = new Point(20, 20);
            summaryLabel.Name = "summaryLabel";
            summaryLabel.Size = new Size(440, 48);
            summaryLabel.Text = "An error occurred.";
            //
            // copyButton
            //
            copyButton.FlatStyle = FlatStyle.Flat;
            copyButton.Location = new Point(270, 82);
            copyButton.Name = "copyButton";
            copyButton.Size = new Size(90, 28);
            copyButton.MinimumSize = new Size(90, 28);
            copyButton.MaximumSize = new Size(90, 28);
            copyButton.AutoSize = false;
            copyButton.TextAlign = ContentAlignment.MiddleCenter;
            copyButton.TabIndex = 0;
            copyButton.Text = "Copy Details";
            copyButton.Click += CopyButton_Click;
            //
            // okButton
            //
            okButton.BackColor = Color.FromArgb(37, 99, 235);
            okButton.DialogResult = DialogResult.OK;
            okButton.FlatStyle = FlatStyle.Flat;
            okButton.ForeColor = Color.White;
            okButton.Location = new Point(370, 82);
            okButton.Name = "okButton";
            okButton.Size = new Size(90, 28);
            okButton.MinimumSize = new Size(90, 28);
            okButton.MaximumSize = new Size(90, 28);
            okButton.AutoSize = false;
            okButton.TextAlign = ContentAlignment.MiddleCenter;
            okButton.TabIndex = 1;
            okButton.Text = "OK";
            //
            // ErrorDetailDialog
            //
            AcceptButton = okButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            ClientSize = new Size(480, 130);
            Controls.Add(summaryLabel);
            Controls.Add(copyButton);
            Controls.Add(okButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "ErrorDetailDialog";
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Error";
            ResumeLayout(false);
        }

        #endregion

        private Label summaryLabel;
        private Button copyButton;
        private Button okButton;
    }
}
