namespace MyGitWinV10.App.Dialogs
{
    partial class BrowseRemoteRepositoryForm
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
            urlLabel = new Label();
            urlTextBox = new ComboBox();
            infoLabel = new Label();
            progressBar = new ProgressBar();
            progressPercentLabel = new Label();
            statusLabel = new Label();
            browseButton = new Button();
            cancelButton = new Button();
            SuspendLayout();
            //
            // urlLabel
            //
            urlLabel.AutoSize = true;
            urlLabel.Location = new Point(20, 20);
            urlLabel.Name = "urlLabel";
            urlLabel.Size = new Size(116, 15);
            urlLabel.Text = "Repository URL";
            //
            // urlTextBox
            //
            urlTextBox.DropDownStyle = ComboBoxStyle.DropDown;
            urlTextBox.Location = new Point(20, 38);
            urlTextBox.Name = "urlTextBox";
            urlTextBox.Size = new Size(460, 23);
            urlTextBox.TabIndex = 0;
            //
            // infoLabel
            //
            infoLabel.ForeColor = Color.Gray;
            infoLabel.Location = new Point(20, 68);
            infoLabel.Name = "infoLabel";
            infoLabel.Size = new Size(460, 34);
            infoLabel.Text = "Downloads commit history to a temporary cache so you can browse logs and diffs without choosing a local folder.";
            //
            // progressPercentLabel
            //
            progressPercentLabel.Location = new Point(20, 108);
            progressPercentLabel.Name = "progressPercentLabel";
            progressPercentLabel.Size = new Size(460, 16);
            progressPercentLabel.TabIndex = 4;
            progressPercentLabel.Text = "0%";
            progressPercentLabel.TextAlign = ContentAlignment.MiddleCenter;
            //
            // progressBar
            //
            progressBar.Location = new Point(20, 126);
            progressBar.Maximum = 100;
            progressBar.Name = "progressBar";
            progressBar.Size = new Size(460, 18);
            progressBar.TabIndex = 1;
            //
            // statusLabel
            //
            statusLabel.AutoSize = true;
            statusLabel.ForeColor = Color.Gray;
            statusLabel.Location = new Point(20, 151);
            statusLabel.Name = "statusLabel";
            statusLabel.Size = new Size(38, 15);
            statusLabel.Text = "Ready";
            //
            // browseButton
            //
            browseButton.BackColor = Color.FromArgb(37, 99, 235);
            browseButton.FlatStyle = FlatStyle.Flat;
            browseButton.ForeColor = Color.White;
            browseButton.Location = new Point(324, 172);
            browseButton.Name = "browseButton";
            browseButton.Size = new Size(75, 28);
            browseButton.MinimumSize = new Size(75, 28);
            browseButton.MaximumSize = new Size(75, 28);
            browseButton.AutoSize = false;
            browseButton.TabIndex = 2;
            browseButton.Text = "Browse";
            browseButton.TextAlign = ContentAlignment.MiddleCenter;
            browseButton.Click += BrowseButton_Click;
            //
            // cancelButton
            //
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.Location = new Point(405, 172);
            cancelButton.Name = "cancelButton";
            cancelButton.Size = new Size(75, 28);
            cancelButton.MinimumSize = new Size(75, 28);
            cancelButton.MaximumSize = new Size(75, 28);
            cancelButton.AutoSize = false;
            cancelButton.TabIndex = 3;
            cancelButton.Text = "Cancel";
            cancelButton.TextAlign = ContentAlignment.MiddleCenter;
            cancelButton.Click += CancelButton_Click;
            //
            // BrowseRemoteRepositoryForm
            //
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            CancelButton = cancelButton;
            ClientSize = new Size(500, 217);
            Controls.Add(urlLabel);
            Controls.Add(urlTextBox);
            Controls.Add(infoLabel);
            Controls.Add(progressBar);
            Controls.Add(progressPercentLabel);
            Controls.Add(statusLabel);
            Controls.Add(browseButton);
            Controls.Add(cancelButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "BrowseRemoteRepositoryForm";
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Browse Remote Repository";
            FormClosing += BrowseRemoteRepositoryForm_FormClosing;
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label urlLabel;
        private ComboBox urlTextBox;
        private Label infoLabel;
        private ProgressBar progressBar;
        private Label progressPercentLabel;
        private Label statusLabel;
        private Button browseButton;
        private Button cancelButton;
    }
}
