namespace MyGitWinV10.App.Dialogs
{
    partial class AboutDialog
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
            titleLabel = new Label();
            versionLabel = new Label();
            descriptionLabel = new Label();
            okButton = new Button();
            SuspendLayout();
            //
            // titleLabel
            //
            titleLabel.AutoSize = true;
            titleLabel.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(37, 99, 235);
            titleLabel.Location = new Point(20, 20);
            titleLabel.Name = "titleLabel";
            titleLabel.Size = new Size(100, 32);
            titleLabel.Text = "MyGit V1.0.0";
            //
            // versionLabel
            //
            versionLabel.AutoSize = true;
            versionLabel.ForeColor = Color.Gray;
            versionLabel.Location = new Point(22, 58);
            versionLabel.Name = "versionLabel";
            versionLabel.Size = new Size(80, 15);
            versionLabel.Text = "Version 1.0.0";
            //
            // descriptionLabel
            //
            descriptionLabel.Location = new Point(20, 90);
            descriptionLabel.Name = "descriptionLabel";
            descriptionLabel.Size = new Size(340, 60);
            descriptionLabel.Text = "A Git history, branch, and GitHub Release viewer.\nBrowse commit graphs, inspect diffs, and explore releases.";
            //
            // okButton
            //
            okButton.BackColor = Color.FromArgb(37, 99, 235);
            okButton.DialogResult = DialogResult.OK;
            okButton.FlatStyle = FlatStyle.Flat;
            okButton.ForeColor = Color.White;
            okButton.Location = new Point(285, 155);
            okButton.Name = "okButton";
            okButton.Size = new Size(75, 28);
            okButton.TabIndex = 0;
            okButton.Text = "OK";
            //
            // AboutDialog
            //
            AcceptButton = okButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            ClientSize = new Size(380, 200);
            Controls.Add(titleLabel);
            Controls.Add(versionLabel);
            Controls.Add(descriptionLabel);
            Controls.Add(okButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "AboutDialog";
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "About MyGit V1.0.0";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label titleLabel;
        private Label versionLabel;
        private Label descriptionLabel;
        private Button okButton;
    }
}
