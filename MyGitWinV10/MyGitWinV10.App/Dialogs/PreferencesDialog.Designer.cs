namespace MyGitWinV10.App.Dialogs
{
    partial class PreferencesDialog
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
            diffToolGroupBox = new GroupBox();
            diffToolPathLabel = new Label();
            diffToolPathTextBox = new TextBox();
            browseButton = new Button();
            diffToolArgumentsLabel = new Label();
            diffToolArgumentsTextBox = new TextBox();
            diffToolHintLabel = new Label();
            mergeToolGroupBox = new GroupBox();
            mergeToolPathLabel = new Label();
            mergeToolPathTextBox = new TextBox();
            mergeToolBrowseButton = new Button();
            mergeToolArgumentsLabel = new Label();
            mergeToolArgumentsTextBox = new TextBox();
            mergeToolHintLabel = new Label();
            languageGroupBox = new GroupBox();
            languageComboBox = new ComboBox();
            okButton = new Button();
            cancelButton = new Button();
            diffToolGroupBox.SuspendLayout();
            mergeToolGroupBox.SuspendLayout();
            languageGroupBox.SuspendLayout();
            SuspendLayout();
            //
            // diffToolGroupBox
            //
            diffToolGroupBox.Controls.Add(diffToolPathLabel);
            diffToolGroupBox.Controls.Add(diffToolPathTextBox);
            diffToolGroupBox.Controls.Add(browseButton);
            diffToolGroupBox.Controls.Add(diffToolArgumentsLabel);
            diffToolGroupBox.Controls.Add(diffToolArgumentsTextBox);
            diffToolGroupBox.Controls.Add(diffToolHintLabel);
            diffToolGroupBox.Location = new Point(20, 15);
            diffToolGroupBox.Name = "diffToolGroupBox";
            diffToolGroupBox.Size = new Size(400, 150);
            diffToolGroupBox.TabIndex = 0;
            diffToolGroupBox.Text = "External Diff Tool";
            //
            // diffToolPathLabel
            //
            diffToolPathLabel.AutoSize = true;
            diffToolPathLabel.Location = new Point(15, 25);
            diffToolPathLabel.Name = "diffToolPathLabel";
            diffToolPathLabel.Size = new Size(63, 15);
            diffToolPathLabel.Text = "Tool Path";
            //
            // diffToolPathTextBox
            //
            diffToolPathTextBox.Location = new Point(15, 44);
            diffToolPathTextBox.Name = "diffToolPathTextBox";
            diffToolPathTextBox.Size = new Size(290, 23);
            diffToolPathTextBox.TabIndex = 0;
            //
            // browseButton
            //
            browseButton.FlatStyle = FlatStyle.Flat;
            browseButton.Location = new Point(312, 43);
            browseButton.Name = "browseButton";
            browseButton.Size = new Size(73, 25);
            browseButton.TabIndex = 1;
            browseButton.Text = "Browse...";
            browseButton.Click += BrowseButton_Click;
            //
            // diffToolArgumentsLabel
            //
            diffToolArgumentsLabel.AutoSize = true;
            diffToolArgumentsLabel.Location = new Point(15, 78);
            diffToolArgumentsLabel.Name = "diffToolArgumentsLabel";
            diffToolArgumentsLabel.Size = new Size(60, 15);
            diffToolArgumentsLabel.Text = "Arguments";
            //
            // diffToolArgumentsTextBox
            //
            diffToolArgumentsTextBox.Location = new Point(15, 97);
            diffToolArgumentsTextBox.Name = "diffToolArgumentsTextBox";
            diffToolArgumentsTextBox.Size = new Size(370, 23);
            diffToolArgumentsTextBox.TabIndex = 2;
            //
            // diffToolHintLabel
            //
            diffToolHintLabel.AutoSize = true;
            diffToolHintLabel.ForeColor = Color.Gray;
            diffToolHintLabel.Location = new Point(15, 124);
            diffToolHintLabel.Name = "diffToolHintLabel";
            diffToolHintLabel.Size = new Size(370, 15);
            diffToolHintLabel.Text = "{left} and {right} are replaced with the two temp file paths to compare.";
            //
            // mergeToolGroupBox
            //
            mergeToolGroupBox.Controls.Add(mergeToolPathLabel);
            mergeToolGroupBox.Controls.Add(mergeToolPathTextBox);
            mergeToolGroupBox.Controls.Add(mergeToolBrowseButton);
            mergeToolGroupBox.Controls.Add(mergeToolArgumentsLabel);
            mergeToolGroupBox.Controls.Add(mergeToolArgumentsTextBox);
            mergeToolGroupBox.Controls.Add(mergeToolHintLabel);
            mergeToolGroupBox.Location = new Point(20, 175);
            mergeToolGroupBox.Name = "mergeToolGroupBox";
            mergeToolGroupBox.Size = new Size(400, 150);
            mergeToolGroupBox.TabIndex = 1;
            mergeToolGroupBox.Text = "External Merge Tool";
            //
            // mergeToolPathLabel
            //
            mergeToolPathLabel.AutoSize = true;
            mergeToolPathLabel.Location = new Point(15, 25);
            mergeToolPathLabel.Name = "mergeToolPathLabel";
            mergeToolPathLabel.Size = new Size(63, 15);
            mergeToolPathLabel.Text = "Tool Path";
            //
            // mergeToolPathTextBox
            //
            mergeToolPathTextBox.Location = new Point(15, 44);
            mergeToolPathTextBox.Name = "mergeToolPathTextBox";
            mergeToolPathTextBox.Size = new Size(290, 23);
            mergeToolPathTextBox.TabIndex = 0;
            //
            // mergeToolBrowseButton
            //
            mergeToolBrowseButton.FlatStyle = FlatStyle.Flat;
            mergeToolBrowseButton.Location = new Point(312, 43);
            mergeToolBrowseButton.Name = "mergeToolBrowseButton";
            mergeToolBrowseButton.Size = new Size(73, 25);
            mergeToolBrowseButton.TabIndex = 1;
            mergeToolBrowseButton.Text = "Browse...";
            mergeToolBrowseButton.Click += MergeToolBrowseButton_Click;
            //
            // mergeToolArgumentsLabel
            //
            mergeToolArgumentsLabel.AutoSize = true;
            mergeToolArgumentsLabel.Location = new Point(15, 78);
            mergeToolArgumentsLabel.Name = "mergeToolArgumentsLabel";
            mergeToolArgumentsLabel.Size = new Size(60, 15);
            mergeToolArgumentsLabel.Text = "Arguments";
            //
            // mergeToolArgumentsTextBox
            //
            mergeToolArgumentsTextBox.Location = new Point(15, 97);
            mergeToolArgumentsTextBox.Name = "mergeToolArgumentsTextBox";
            mergeToolArgumentsTextBox.Size = new Size(370, 23);
            mergeToolArgumentsTextBox.TabIndex = 2;
            //
            // mergeToolHintLabel
            //
            mergeToolHintLabel.AutoSize = true;
            mergeToolHintLabel.ForeColor = Color.Gray;
            mergeToolHintLabel.Location = new Point(15, 124);
            mergeToolHintLabel.Name = "mergeToolHintLabel";
            mergeToolHintLabel.Size = new Size(370, 15);
            mergeToolHintLabel.Text = "{base}/{local}/{remote}/{merged} are replaced with the ancestor, ours, theirs, and working-tree paths.";
            //
            // languageGroupBox
            //
            languageGroupBox.Controls.Add(languageComboBox);
            languageGroupBox.Location = new Point(20, 335);
            languageGroupBox.Name = "languageGroupBox";
            languageGroupBox.Size = new Size(400, 60);
            languageGroupBox.TabIndex = 2;
            languageGroupBox.Text = "Language";
            //
            // languageComboBox
            //
            languageComboBox.DropDownStyle = ComboBoxStyle.DropDownList;
            languageComboBox.Location = new Point(15, 25);
            languageComboBox.Name = "languageComboBox";
            languageComboBox.Size = new Size(160, 23);
            languageComboBox.TabIndex = 0;
            //
            // okButton
            //
            okButton.BackColor = Color.FromArgb(37, 99, 235);
            okButton.DialogResult = DialogResult.OK;
            okButton.FlatStyle = FlatStyle.Flat;
            okButton.ForeColor = Color.White;
            okButton.Location = new Point(264, 410);
            okButton.Name = "okButton";
            okButton.Size = new Size(75, 28);
            okButton.TabIndex = 3;
            okButton.Text = "OK";
            okButton.Click += OkButton_Click;
            //
            // cancelButton
            //
            cancelButton.DialogResult = DialogResult.Cancel;
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.Location = new Point(345, 410);
            cancelButton.Name = "cancelButton";
            cancelButton.Size = new Size(75, 28);
            cancelButton.TabIndex = 4;
            cancelButton.Text = "Cancel";
            //
            // PreferencesDialog
            //
            AcceptButton = okButton;
            CancelButton = cancelButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            ClientSize = new Size(440, 455);
            Controls.Add(diffToolGroupBox);
            Controls.Add(mergeToolGroupBox);
            Controls.Add(languageGroupBox);
            Controls.Add(okButton);
            Controls.Add(cancelButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "PreferencesDialog";
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "Preferences";
            diffToolGroupBox.ResumeLayout(false);
            diffToolGroupBox.PerformLayout();
            mergeToolGroupBox.ResumeLayout(false);
            mergeToolGroupBox.PerformLayout();
            languageGroupBox.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion

        private GroupBox diffToolGroupBox;
        private Label diffToolPathLabel;
        private TextBox diffToolPathTextBox;
        private Button browseButton;
        private Label diffToolArgumentsLabel;
        private TextBox diffToolArgumentsTextBox;
        private Label diffToolHintLabel;
        private GroupBox mergeToolGroupBox;
        private Label mergeToolPathLabel;
        private TextBox mergeToolPathTextBox;
        private Button mergeToolBrowseButton;
        private Label mergeToolArgumentsLabel;
        private TextBox mergeToolArgumentsTextBox;
        private Label mergeToolHintLabel;
        private GroupBox languageGroupBox;
        private ComboBox languageComboBox;
        private Button okButton;
        private Button cancelButton;
    }
}
