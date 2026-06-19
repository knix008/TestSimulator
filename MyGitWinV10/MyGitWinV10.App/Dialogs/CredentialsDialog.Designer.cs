namespace MyGitWinV10.App.Dialogs
{
    partial class CredentialsDialog
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
            infoLabel = new Label();
            usernameLabel = new Label();
            usernameTextBox = new TextBox();
            passwordLabel = new Label();
            passwordTextBox = new TextBox();
            patHintLabel = new Label();
            okButton = new Button();
            cancelButton = new Button();
            SuspendLayout();
            //
            // infoLabel
            //
            infoLabel.AutoSize = true;
            infoLabel.ForeColor = Color.Gray;
            infoLabel.Location = new Point(20, 18);
            infoLabel.Name = "infoLabel";
            infoLabel.Size = new Size(248, 15);
            infoLabel.Text = "This remote requires authentication.";
            //
            // usernameLabel
            //
            usernameLabel.AutoSize = true;
            usernameLabel.Location = new Point(20, 50);
            usernameLabel.Name = "usernameLabel";
            usernameLabel.Size = new Size(63, 15);
            usernameLabel.Text = "Username";
            //
            // usernameTextBox
            //
            usernameTextBox.Location = new Point(20, 68);
            usernameTextBox.Name = "usernameTextBox";
            usernameTextBox.Size = new Size(380, 23);
            usernameTextBox.TabIndex = 0;
            //
            // passwordLabel
            //
            passwordLabel.AutoSize = true;
            passwordLabel.Location = new Point(20, 100);
            passwordLabel.Name = "passwordLabel";
            passwordLabel.Size = new Size(160, 15);
            passwordLabel.Text = "Personal Access Token (PAT)";
            //
            // passwordTextBox
            //
            passwordTextBox.Location = new Point(20, 118);
            passwordTextBox.Name = "passwordTextBox";
            passwordTextBox.PasswordChar = '*';
            passwordTextBox.Size = new Size(380, 23);
            passwordTextBox.TabIndex = 1;
            //
            // patHintLabel
            //
            patHintLabel.AutoSize = true;
            patHintLabel.ForeColor = Color.FromArgb(217, 119, 6);
            patHintLabel.Location = new Point(20, 144);
            patHintLabel.Name = "patHintLabel";
            patHintLabel.Size = new Size(380, 15);
            patHintLabel.Text = "GitHub no longer accepts your account password here — use a PAT\nfrom github.com/settings/tokens (not your login password).";
            //
            // okButton
            //
            okButton.BackColor = Color.FromArgb(37, 99, 235);
            okButton.DialogResult = DialogResult.OK;
            okButton.FlatStyle = FlatStyle.Flat;
            okButton.ForeColor = Color.White;
            okButton.Location = new Point(244, 185);
            okButton.Name = "okButton";
            okButton.Size = new Size(75, 28);
            okButton.TabIndex = 2;
            okButton.Text = "OK";
            okButton.Click += OkButton_Click;
            //
            // cancelButton
            //
            cancelButton.DialogResult = DialogResult.Cancel;
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.Location = new Point(325, 185);
            cancelButton.Name = "cancelButton";
            cancelButton.Size = new Size(75, 28);
            cancelButton.TabIndex = 3;
            cancelButton.Text = "Cancel";
            //
            // CredentialsDialog
            //
            AcceptButton = okButton;
            CancelButton = cancelButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            ClientSize = new Size(420, 235);
            Controls.Add(infoLabel);
            Controls.Add(usernameLabel);
            Controls.Add(usernameTextBox);
            Controls.Add(passwordLabel);
            Controls.Add(passwordTextBox);
            Controls.Add(patHintLabel);
            Controls.Add(okButton);
            Controls.Add(cancelButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "CredentialsDialog";
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Git Credentials";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label infoLabel;
        private Label usernameLabel;
        private TextBox usernameTextBox;
        private Label passwordLabel;
        private TextBox passwordTextBox;
        private Label patHintLabel;
        private Button okButton;
        private Button cancelButton;
    }
}
