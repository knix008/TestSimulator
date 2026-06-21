namespace MyGitWinV10.App.Dialogs
{
    partial class CommitCategoriesDialog
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
            categoriesLabel = new Label();
            categoriesListBox = new ListBox();
            categoryEditLabel = new Label();
            categoryEditTextBox = new TextBox();
            addCategoryButton = new Button();
            updateCategoryButton = new Button();
            removeCategoryButton = new Button();
            resetDefaultsButton = new Button();
            okButton = new Button();
            cancelButton = new Button();
            SuspendLayout();
            //
            // categoriesLabel
            //
            categoriesLabel.AutoSize = true;
            categoriesLabel.Location = new Point(20, 20);
            categoriesLabel.Name = "categoriesLabel";
            categoriesLabel.Size = new Size(66, 15);
            categoriesLabel.Text = "Categories";
            //
            // categoriesListBox
            //
            categoriesListBox.FormattingEnabled = true;
            categoriesListBox.ItemHeight = 15;
            categoriesListBox.Location = new Point(20, 38);
            categoriesListBox.Name = "categoriesListBox";
            categoriesListBox.Size = new Size(460, 199);
            categoriesListBox.TabIndex = 0;
            categoriesListBox.SelectedIndexChanged += CategoriesListBox_SelectedIndexChanged;
            //
            // categoryEditLabel
            //
            categoryEditLabel.AutoSize = true;
            categoryEditLabel.Location = new Point(20, 250);
            categoryEditLabel.Name = "categoryEditLabel";
            categoryEditLabel.Size = new Size(58, 15);
            categoryEditLabel.Text = "Category";
            //
            // categoryEditTextBox
            //
            categoryEditTextBox.Location = new Point(20, 268);
            categoryEditTextBox.Name = "categoryEditTextBox";
            categoryEditTextBox.PlaceholderText = "Type a category name";
            categoryEditTextBox.Size = new Size(460, 23);
            categoryEditTextBox.TabIndex = 1;
            //
            // addCategoryButton
            //
            addCategoryButton.FlatStyle = FlatStyle.Flat;
            addCategoryButton.Location = new Point(20, 304);
            addCategoryButton.Name = "addCategoryButton";
            addCategoryButton.Size = new Size(75, 28);
            addCategoryButton.TabIndex = 2;
            addCategoryButton.Text = "Add";
            addCategoryButton.Click += AddCategoryButton_Click;
            //
            // updateCategoryButton
            //
            updateCategoryButton.FlatStyle = FlatStyle.Flat;
            updateCategoryButton.Location = new Point(101, 304);
            updateCategoryButton.Name = "updateCategoryButton";
            updateCategoryButton.Size = new Size(75, 28);
            updateCategoryButton.TabIndex = 3;
            updateCategoryButton.Text = "Update";
            updateCategoryButton.Click += UpdateCategoryButton_Click;
            //
            // removeCategoryButton
            //
            removeCategoryButton.FlatStyle = FlatStyle.Flat;
            removeCategoryButton.Location = new Point(182, 304);
            removeCategoryButton.Name = "removeCategoryButton";
            removeCategoryButton.Size = new Size(75, 28);
            removeCategoryButton.TabIndex = 4;
            removeCategoryButton.Text = "Remove";
            removeCategoryButton.Click += RemoveCategoryButton_Click;
            //
            // resetDefaultsButton
            //
            resetDefaultsButton.FlatStyle = FlatStyle.Flat;
            resetDefaultsButton.Location = new Point(263, 304);
            resetDefaultsButton.Name = "resetDefaultsButton";
            resetDefaultsButton.Size = new Size(110, 28);
            resetDefaultsButton.TabIndex = 5;
            resetDefaultsButton.Text = "Reset Defaults";
            resetDefaultsButton.Click += ResetDefaultsButton_Click;
            //
            // okButton
            //
            okButton.BackColor = Color.FromArgb(37, 99, 235);
            okButton.FlatStyle = FlatStyle.Flat;
            okButton.ForeColor = Color.White;
            okButton.Location = new Point(324, 348);
            okButton.Name = "okButton";
            okButton.Size = new Size(75, 28);
            okButton.TabIndex = 6;
            okButton.Text = "OK";
            okButton.Click += OkButton_Click;
            //
            // cancelButton
            //
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.Location = new Point(405, 348);
            cancelButton.Name = "cancelButton";
            cancelButton.Size = new Size(75, 28);
            cancelButton.TabIndex = 7;
            cancelButton.Text = "Cancel";
            cancelButton.Click += CancelButton_Click;
            //
            // CommitCategoriesDialog
            //
            AcceptButton = okButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            CancelButton = cancelButton;
            ClientSize = new Size(500, 395);
            Controls.Add(categoriesLabel);
            Controls.Add(categoriesListBox);
            Controls.Add(categoryEditLabel);
            Controls.Add(categoryEditTextBox);
            Controls.Add(addCategoryButton);
            Controls.Add(updateCategoryButton);
            Controls.Add(removeCategoryButton);
            Controls.Add(resetDefaultsButton);
            Controls.Add(okButton);
            Controls.Add(cancelButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "CommitCategoriesDialog";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Commit Categories";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label categoriesLabel;
        private ListBox categoriesListBox;
        private Label categoryEditLabel;
        private TextBox categoryEditTextBox;
        private Button addCategoryButton;
        private Button updateCategoryButton;
        private Button removeCategoryButton;
        private Button resetDefaultsButton;
        private Button okButton;
        private Button cancelButton;
    }
}
