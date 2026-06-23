namespace MyGitWinV10.App.Dialogs
{
    partial class GitCommitDialog
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && components is not null)
            {
                components.Dispose();
            }

            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            categoryLabel = new Label();
            categoryComboBox = new ComboBox();
            manageCategoriesButton = new Button();
            subjectLabel = new Label();
            subjectTextBox = new TextBox();
            bodyLabel = new Label();
            bodyTextBox = new TextBox();
            previewLabel = new Label();
            previewTextBox = new TextBox();
            stagedFilesLabel = new Label();
            stagedFilesListView = new ListView();
            stagedPathColumnHeader = new ColumnHeader();
            removeFromCommitButton = new Button();
            commitButton = new Button();
            cancelButton = new Button();
            SuspendLayout();
            //
            // categoryLabel
            //
            categoryLabel.AutoSize = true;
            categoryLabel.Location = new Point(20, 20);
            categoryLabel.Name = "categoryLabel";
            categoryLabel.Size = new Size(58, 15);
            categoryLabel.Text = "Category";
            //
            // categoryComboBox
            //
            categoryComboBox.AutoCompleteMode = AutoCompleteMode.Suggest;
            categoryComboBox.AutoCompleteSource = AutoCompleteSource.ListItems;
            categoryComboBox.DropDownStyle = ComboBoxStyle.DropDown;
            categoryComboBox.Location = new Point(20, 38);
            categoryComboBox.Name = "categoryComboBox";
            categoryComboBox.Size = new Size(370, 23);
            categoryComboBox.TabIndex = 0;
            //
            // manageCategoriesButton
            //
            manageCategoriesButton.AutoSize = false;
            manageCategoriesButton.FlatStyle = FlatStyle.Flat;
            manageCategoriesButton.Location = new Point(405, 36);
            manageCategoriesButton.MaximumSize = new Size(75, 28);
            manageCategoriesButton.MinimumSize = new Size(75, 28);
            manageCategoriesButton.Name = "manageCategoriesButton";
            manageCategoriesButton.Size = new Size(75, 28);
            manageCategoriesButton.TabIndex = 7;
            manageCategoriesButton.Text = "Manage...";
            manageCategoriesButton.TextAlign = ContentAlignment.MiddleCenter;
            manageCategoriesButton.Click += ManageCategoriesButton_Click;
            //
            // subjectLabel
            //
            subjectLabel.AutoSize = true;
            subjectLabel.Location = new Point(20, 72);
            subjectLabel.Name = "subjectLabel";
            subjectLabel.Size = new Size(46, 15);
            subjectLabel.Text = "Subject";
            //
            // subjectTextBox
            //
            subjectTextBox.Location = new Point(20, 90);
            subjectTextBox.Name = "subjectTextBox";
            subjectTextBox.PlaceholderText = "Short summary of the change";
            subjectTextBox.Size = new Size(460, 23);
            subjectTextBox.TabIndex = 1;
            //
            // bodyLabel
            //
            bodyLabel.AutoSize = true;
            bodyLabel.Location = new Point(20, 124);
            bodyLabel.Name = "bodyLabel";
            bodyLabel.Size = new Size(96, 15);
            bodyLabel.Text = "Details (optional)";
            //
            // bodyTextBox
            //
            bodyTextBox.Location = new Point(20, 142);
            bodyTextBox.Multiline = true;
            bodyTextBox.Name = "bodyTextBox";
            bodyTextBox.PlaceholderText = "Additional details";
            bodyTextBox.ScrollBars = ScrollBars.Vertical;
            bodyTextBox.Size = new Size(460, 72);
            bodyTextBox.TabIndex = 2;
            //
            // previewLabel
            //
            previewLabel.AutoSize = true;
            previewLabel.Location = new Point(20, 224);
            previewLabel.Name = "previewLabel";
            previewLabel.Size = new Size(50, 15);
            previewLabel.Text = "Preview";
            //
            // previewTextBox
            //
            previewTextBox.BackColor = Color.FromArgb(248, 250, 252);
            previewTextBox.Location = new Point(20, 242);
            previewTextBox.Multiline = true;
            previewTextBox.Name = "previewTextBox";
            previewTextBox.ReadOnly = true;
            previewTextBox.ScrollBars = ScrollBars.Vertical;
            previewTextBox.Size = new Size(460, 72);
            previewTextBox.TabIndex = 3;
            previewTextBox.TabStop = false;
            //
            // stagedFilesLabel
            //
            stagedFilesLabel.AutoSize = true;
            stagedFilesLabel.Location = new Point(20, 324);
            stagedFilesLabel.Name = "stagedFilesLabel";
            stagedFilesLabel.Size = new Size(72, 15);
            stagedFilesLabel.Text = "Staged files";
            //
            // stagedFilesListView
            //
            stagedFilesListView.Columns.AddRange(new ColumnHeader[] { stagedPathColumnHeader });
            stagedFilesListView.FullRowSelect = true;
            stagedFilesListView.GridLines = true;
            stagedFilesListView.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            stagedFilesListView.HideSelection = false;
            stagedFilesListView.MultiSelect = true;
            stagedFilesListView.Location = new Point(20, 342);
            stagedFilesListView.Name = "stagedFilesListView";
            stagedFilesListView.Size = new Size(460, 94);
            stagedFilesListView.TabIndex = 4;
            stagedFilesListView.UseCompatibleStateImageBehavior = false;
            stagedFilesListView.View = View.Details;
            stagedFilesListView.SelectedIndexChanged += StagedFilesListView_SelectedIndexChanged;
            //
            // stagedPathColumnHeader
            //
            stagedPathColumnHeader.Text = "Path";
            stagedPathColumnHeader.Width = 440;
            //
            // removeFromCommitButton
            //
            removeFromCommitButton.FlatStyle = FlatStyle.Flat;
            removeFromCommitButton.Location = new Point(20, 444);
            removeFromCommitButton.Name = "removeFromCommitButton";
            removeFromCommitButton.Size = new Size(110, 28);
            removeFromCommitButton.TabIndex = 8;
            removeFromCommitButton.Text = "Remove Selected";
            removeFromCommitButton.Click += RemoveFromCommitButton_Click;
            //
            // commitButton
            //
            commitButton.BackColor = Color.FromArgb(37, 99, 235);
            commitButton.FlatStyle = FlatStyle.Flat;
            commitButton.ForeColor = Color.White;
            commitButton.Location = new Point(324, 444);
            commitButton.Name = "commitButton";
            commitButton.Size = new Size(75, 28);
            commitButton.MinimumSize = new Size(75, 28);
            commitButton.MaximumSize = new Size(75, 28);
            commitButton.AutoSize = false;
            commitButton.TabIndex = 5;
            commitButton.Text = "Commit";
            commitButton.TextAlign = ContentAlignment.MiddleCenter;
            commitButton.Padding = Padding.Empty;
            commitButton.Margin = Padding.Empty;
            commitButton.FlatAppearance.BorderSize = 0;
            commitButton.Click += CommitButton_Click;
            //
            // cancelButton
            //
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.Location = new Point(405, 444);
            cancelButton.Name = "cancelButton";
            cancelButton.Size = new Size(75, 28);
            cancelButton.MinimumSize = new Size(75, 28);
            cancelButton.MaximumSize = new Size(75, 28);
            cancelButton.AutoSize = false;
            cancelButton.TabIndex = 6;
            cancelButton.Text = "Cancel";
            cancelButton.TextAlign = ContentAlignment.MiddleCenter;
            cancelButton.Padding = Padding.Empty;
            cancelButton.Margin = Padding.Empty;
            cancelButton.FlatAppearance.BorderSize = 1;
            cancelButton.Click += CancelButton_Click;
            //
            // GitCommitDialog
            //
            AcceptButton = commitButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            CancelButton = cancelButton;
            ClientSize = new Size(500, 487);
            Controls.Add(categoryLabel);
            Controls.Add(categoryComboBox);
            Controls.Add(manageCategoriesButton);
            Controls.Add(subjectLabel);
            Controls.Add(subjectTextBox);
            Controls.Add(bodyLabel);
            Controls.Add(bodyTextBox);
            Controls.Add(previewLabel);
            Controls.Add(previewTextBox);
            Controls.Add(stagedFilesLabel);
            Controls.Add(stagedFilesListView);
            Controls.Add(removeFromCommitButton);
            Controls.Add(commitButton);
            Controls.Add(cancelButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "GitCommitDialog";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Git Commit";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label categoryLabel;
        private ComboBox categoryComboBox;
        private Button manageCategoriesButton;
        private Label subjectLabel;
        private TextBox subjectTextBox;
        private Label bodyLabel;
        private TextBox bodyTextBox;
        private Label previewLabel;
        private TextBox previewTextBox;
        private Label stagedFilesLabel;
        private ListView stagedFilesListView;
        private ColumnHeader stagedPathColumnHeader;
        private Button removeFromCommitButton;
        private Button commitButton;
        private Button cancelButton;
    }
}
