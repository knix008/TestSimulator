namespace MyGitWinV10.App.Dialogs
{
    partial class CloneRepositoryForm
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
            destinationLabel = new Label();
            destinationTextBox = new TextBox();
            browseButton = new Button();
            progressBar = new ProgressBar();
            progressPercentLabel = new Label();
            statusLabel = new Label();
            cloneButton = new Button();
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
            // destinationLabel
            //
            destinationLabel.AutoSize = true;
            destinationLabel.Location = new Point(20, 74);
            destinationLabel.Name = "destinationLabel";
            destinationLabel.Size = new Size(120, 15);
            destinationLabel.Text = "Destination Folder";
            //
            // destinationTextBox
            //
            destinationTextBox.Location = new Point(20, 92);
            destinationTextBox.Name = "destinationTextBox";
            destinationTextBox.Size = new Size(370, 23);
            destinationTextBox.TabIndex = 1;
            //
            // browseButton
            //
            browseButton.FlatStyle = FlatStyle.Flat;
            browseButton.Location = new Point(396, 91);
            browseButton.Name = "browseButton";
            browseButton.Size = new Size(84, 25);
            browseButton.TabIndex = 2;
            browseButton.Text = "Browse...";
            browseButton.Click += BrowseButton_Click;
            //
            // progressBar
            //
            progressBar.Location = new Point(20, 135);
            progressBar.Maximum = 100;
            progressBar.Name = "progressBar";
            progressBar.Size = new Size(410, 18);
            progressBar.TabIndex = 3;
            //
            // progressPercentLabel
            //
            progressPercentLabel.AutoSize = true;
            progressPercentLabel.Location = new Point(438, 135);
            progressPercentLabel.Name = "progressPercentLabel";
            progressPercentLabel.Size = new Size(25, 15);
            progressPercentLabel.TabIndex = 6;
            progressPercentLabel.Text = "0%";
            progressPercentLabel.TextAlign = ContentAlignment.MiddleRight;
            //
            // statusLabel
            //
            statusLabel.AutoSize = true;
            statusLabel.ForeColor = Color.Gray;
            statusLabel.Location = new Point(20, 160);
            statusLabel.Name = "statusLabel";
            statusLabel.Size = new Size(38, 15);
            statusLabel.Text = "Ready";
            //
            // cloneButton
            //
            cloneButton.BackColor = Color.FromArgb(37, 99, 235);
            cloneButton.FlatStyle = FlatStyle.Flat;
            cloneButton.ForeColor = Color.White;
            cloneButton.Location = new Point(324, 195);
            cloneButton.Name = "cloneButton";
            cloneButton.Size = new Size(75, 28);
            cloneButton.MinimumSize = new Size(75, 28);
            cloneButton.MaximumSize = new Size(75, 28);
            cloneButton.AutoSize = false;
            cloneButton.TabIndex = 4;
            cloneButton.Text = "Clone";
            cloneButton.TextAlign = ContentAlignment.MiddleCenter;
            cloneButton.Click += CloneButton_Click;
            //
            // cancelButton
            //
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.Location = new Point(405, 195);
            cancelButton.Name = "cancelButton";
            cancelButton.Size = new Size(75, 28);
            cancelButton.MinimumSize = new Size(75, 28);
            cancelButton.MaximumSize = new Size(75, 28);
            cancelButton.AutoSize = false;
            cancelButton.TabIndex = 5;
            cancelButton.Text = "Cancel";
            cancelButton.TextAlign = ContentAlignment.MiddleCenter;
            cancelButton.Click += CancelButton_Click;
            //
            // CloneRepositoryForm
            //
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            CancelButton = cancelButton;
            ClientSize = new Size(500, 240);
            Controls.Add(urlLabel);
            Controls.Add(urlTextBox);
            Controls.Add(destinationLabel);
            Controls.Add(destinationTextBox);
            Controls.Add(browseButton);
            Controls.Add(progressBar);
            Controls.Add(progressPercentLabel);
            Controls.Add(statusLabel);
            Controls.Add(cloneButton);
            Controls.Add(cancelButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "CloneRepositoryForm";
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Clone Repository";
            FormClosing += CloneRepositoryForm_FormClosing;
            ResumeLayout(false);
        }

        #endregion

        private Label urlLabel;
        private ComboBox urlTextBox;
        private Label destinationLabel;
        private TextBox destinationTextBox;
        private Button browseButton;
        private ProgressBar progressBar;
        private Label progressPercentLabel;
        private Label statusLabel;
        private Button cloneButton;
        private Button cancelButton;
    }
}
