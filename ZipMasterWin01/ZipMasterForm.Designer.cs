namespace ZipMasterWin01
{
    partial class ZipMasterForm
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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(ZipMasterForm));
            compressButton = new System.Windows.Forms.Button();
            extractButton = new System.Windows.Forms.Button();
            titleLabel = new System.Windows.Forms.Label();
            optionsGroupBox = new System.Windows.Forms.GroupBox();
            sourceTypeComboBox = new System.Windows.Forms.ComboBox();
            sourceTypeLabel = new System.Windows.Forms.Label();
            archiveFormatComboBox = new System.Windows.Forms.ComboBox();
            archiveFormatLabel = new System.Windows.Forms.Label();
            archiveNameTextBox = new System.Windows.Forms.TextBox();
            archiveNameLabel = new System.Windows.Forms.Label();
            outputFolderTextBox = new System.Windows.Forms.TextBox();
            outputFolderLabel = new System.Windows.Forms.Label();
            browseOutputFolderButton = new System.Windows.Forms.Button();
            enableSplitCheckBox = new System.Windows.Forms.CheckBox();
            splitSizeUpDown = new System.Windows.Forms.NumericUpDown();
            splitSizeLabel = new System.Windows.Forms.Label();
            progressBar = new System.Windows.Forms.ProgressBar();
            statusLabel = new System.Windows.Forms.Label();
            progressPercentLabel = new System.Windows.Forms.Label();
            optionsGroupBox.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)splitSizeUpDown).BeginInit();
            SuspendLayout();
            // 
            // compressButton
            // 
            compressButton.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
            compressButton.Location = new System.Drawing.Point(14, 298);
            compressButton.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            compressButton.Name = "compressButton";
            compressButton.Size = new System.Drawing.Size(249, 48);
            compressButton.TabIndex = 0;
            compressButton.Text = "Compress";
            compressButton.UseVisualStyleBackColor = true;
            compressButton.Click += CompressButton_Click;
            // 
            // extractButton
            // 
            extractButton.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
            extractButton.Location = new System.Drawing.Point(269, 298);
            extractButton.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            extractButton.Name = "extractButton";
            extractButton.Size = new System.Drawing.Size(250, 48);
            extractButton.TabIndex = 1;
            extractButton.Text = "Extract";
            extractButton.UseVisualStyleBackColor = true;
            extractButton.Click += ExtractButton_Click;
            // 
            // titleLabel
            // 
            titleLabel.AutoSize = true;
            titleLabel.Font = new System.Drawing.Font("Segoe UI", 12F, System.Drawing.FontStyle.Bold);
            titleLabel.Location = new System.Drawing.Point(12, 11);
            titleLabel.Name = "titleLabel";
            titleLabel.Size = new System.Drawing.Size(186, 21);
            titleLabel.TabIndex = 8;
            titleLabel.Text = "ZipMaster Archive Tool";
            // 
            // optionsGroupBox
            // 
            optionsGroupBox.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
            optionsGroupBox.Controls.Add(sourceTypeComboBox);
            optionsGroupBox.Controls.Add(sourceTypeLabel);
            optionsGroupBox.Controls.Add(archiveFormatComboBox);
            optionsGroupBox.Controls.Add(archiveFormatLabel);
            optionsGroupBox.Controls.Add(archiveNameTextBox);
            optionsGroupBox.Controls.Add(archiveNameLabel);
            optionsGroupBox.Controls.Add(outputFolderTextBox);
            optionsGroupBox.Controls.Add(outputFolderLabel);
            optionsGroupBox.Controls.Add(browseOutputFolderButton);
            optionsGroupBox.Controls.Add(enableSplitCheckBox);
            optionsGroupBox.Controls.Add(splitSizeUpDown);
            optionsGroupBox.Controls.Add(splitSizeLabel);
            optionsGroupBox.Location = new System.Drawing.Point(14, 49);
            optionsGroupBox.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            optionsGroupBox.Name = "optionsGroupBox";
            optionsGroupBox.Padding = new System.Windows.Forms.Padding(3, 4, 3, 4);
            optionsGroupBox.Size = new System.Drawing.Size(548, 236);
            optionsGroupBox.TabIndex = 9;
            optionsGroupBox.TabStop = false;
            optionsGroupBox.Text = "Compression Options";
            // 
            // sourceTypeComboBox
            // 
            sourceTypeComboBox.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            sourceTypeComboBox.FormattingEnabled = true;
            sourceTypeComboBox.Items.AddRange(new object[] { "Folder", "File" });
            sourceTypeComboBox.Location = new System.Drawing.Point(160, 30);
            sourceTypeComboBox.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            sourceTypeComboBox.Name = "sourceTypeComboBox";
            sourceTypeComboBox.Size = new System.Drawing.Size(118, 23);
            sourceTypeComboBox.TabIndex = 1;
            // 
            // sourceTypeLabel
            // 
            sourceTypeLabel.Location = new System.Drawing.Point(12, 34);
            sourceTypeLabel.Name = "sourceTypeLabel";
            sourceTypeLabel.Size = new System.Drawing.Size(140, 15);
            sourceTypeLabel.TabIndex = 0;
            sourceTypeLabel.Text = "Source Type";
            // 
            // archiveFormatComboBox
            // 
            archiveFormatComboBox.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            archiveFormatComboBox.FormattingEnabled = true;
            archiveFormatComboBox.Items.AddRange(new object[] { "zip", "tar.gz" });
            archiveFormatComboBox.Location = new System.Drawing.Point(160, 72);
            archiveFormatComboBox.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            archiveFormatComboBox.Name = "archiveFormatComboBox";
            archiveFormatComboBox.Size = new System.Drawing.Size(118, 23);
            archiveFormatComboBox.TabIndex = 3;
            // 
            // archiveFormatLabel
            // 
            archiveFormatLabel.Location = new System.Drawing.Point(12, 76);
            archiveFormatLabel.Name = "archiveFormatLabel";
            archiveFormatLabel.Size = new System.Drawing.Size(140, 15);
            archiveFormatLabel.TabIndex = 2;
            archiveFormatLabel.Text = "Archive Format";
            // 
            // archiveNameTextBox
            // 
            archiveNameTextBox.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
            archiveNameTextBox.Location = new System.Drawing.Point(160, 115);
            archiveNameTextBox.Name = "archiveNameTextBox";
            archiveNameTextBox.Size = new System.Drawing.Size(369, 23);
            archiveNameTextBox.TabIndex = 5;
            archiveNameTextBox.Text = "archive";
            // 
            // archiveNameLabel
            // 
            archiveNameLabel.Location = new System.Drawing.Point(12, 119);
            archiveNameLabel.Name = "archiveNameLabel";
            archiveNameLabel.Size = new System.Drawing.Size(140, 15);
            archiveNameLabel.TabIndex = 4;
            archiveNameLabel.Text = "Archive Name";
            // 
            // outputFolderTextBox
            // 
            outputFolderTextBox.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
            outputFolderTextBox.Location = new System.Drawing.Point(160, 151);
            outputFolderTextBox.Name = "outputFolderTextBox";
            outputFolderTextBox.Size = new System.Drawing.Size(290, 23);
            outputFolderTextBox.TabIndex = 7;
            // 
            // outputFolderLabel
            // 
            outputFolderLabel.Location = new System.Drawing.Point(12, 155);
            outputFolderLabel.Name = "outputFolderLabel";
            outputFolderLabel.Size = new System.Drawing.Size(140, 15);
            outputFolderLabel.TabIndex = 6;
            outputFolderLabel.Text = "Output Folder";
            // 
            // browseOutputFolderButton
            // 
            browseOutputFolderButton.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
            browseOutputFolderButton.Location = new System.Drawing.Point(456, 150);
            browseOutputFolderButton.Name = "browseOutputFolderButton";
            browseOutputFolderButton.Size = new System.Drawing.Size(73, 24);
            browseOutputFolderButton.TabIndex = 8;
            browseOutputFolderButton.Text = "Browse";
            browseOutputFolderButton.UseVisualStyleBackColor = true;
            browseOutputFolderButton.Click += BrowseOutputFolderButton_Click;
            // 
            // enableSplitCheckBox
            // 
            enableSplitCheckBox.AutoSize = true;
            enableSplitCheckBox.Location = new System.Drawing.Point(160, 176);
            enableSplitCheckBox.Name = "enableSplitCheckBox";
            enableSplitCheckBox.Size = new System.Drawing.Size(89, 19);
            enableSplitCheckBox.TabIndex = 9;
            enableSplitCheckBox.Text = "Enable Split";
            enableSplitCheckBox.UseVisualStyleBackColor = true;
            enableSplitCheckBox.CheckedChanged += EnableSplitCheckBox_CheckedChanged;
            // 
            // splitSizeUpDown
            // 
            splitSizeUpDown.Location = new System.Drawing.Point(160, 198);
            splitSizeUpDown.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            splitSizeUpDown.Maximum = new decimal(new int[] { 4096, 0, 0, 0 });
            splitSizeUpDown.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            splitSizeUpDown.Name = "splitSizeUpDown";
            splitSizeUpDown.Size = new System.Drawing.Size(118, 23);
            splitSizeUpDown.TabIndex = 10;
            splitSizeUpDown.Value = new decimal(new int[] { 10, 0, 0, 0 });
            // 
            // splitSizeLabel
            // 
            splitSizeLabel.Location = new System.Drawing.Point(12, 202);
            splitSizeLabel.Name = "splitSizeLabel";
            splitSizeLabel.Size = new System.Drawing.Size(140, 15);
            splitSizeLabel.TabIndex = 11;
            splitSizeLabel.Text = "Split Size (MB)";
            // 
            // progressBar
            // 
            progressBar.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
            progressBar.Location = new System.Drawing.Point(14, 354);
            progressBar.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            progressBar.Name = "progressBar";
            progressBar.Size = new System.Drawing.Size(505, 24);
            progressBar.TabIndex = 6;
            // 
            // statusLabel
            // 
            statusLabel.AutoSize = true;
            statusLabel.Location = new System.Drawing.Point(12, 386);
            statusLabel.Name = "statusLabel";
            statusLabel.Size = new System.Drawing.Size(48, 15);
            statusLabel.TabIndex = 7;
            statusLabel.Text = "Ready...";
            // 
            // progressPercentLabel
            // 
            progressPercentLabel.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
            progressPercentLabel.Location = new System.Drawing.Point(516, 354);
            progressPercentLabel.Name = "progressPercentLabel";
            progressPercentLabel.Size = new System.Drawing.Size(46, 24);
            progressPercentLabel.TabIndex = 10;
            progressPercentLabel.Text = "0%";
            progressPercentLabel.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
            // 
            // ZipMasterForm
            // 
            AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            ClientSize = new System.Drawing.Size(576, 420);
            Controls.Add(optionsGroupBox);
            Controls.Add(titleLabel);
            Controls.Add(progressPercentLabel);
            Controls.Add(statusLabel);
            Controls.Add(progressBar);
            Controls.Add(extractButton);
            Controls.Add(compressButton);
            Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
            Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            MinimumSize = new System.Drawing.Size(592, 459);
            Name = "ZipMasterForm";
            Text = "ZipMaster";
            optionsGroupBox.ResumeLayout(false);
            optionsGroupBox.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)splitSizeUpDown).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private System.Windows.Forms.Button compressButton;
        private System.Windows.Forms.Button extractButton;
        private System.Windows.Forms.Label titleLabel;
        private System.Windows.Forms.GroupBox optionsGroupBox;
        private System.Windows.Forms.ComboBox sourceTypeComboBox;
        private System.Windows.Forms.Label sourceTypeLabel;
        private System.Windows.Forms.ComboBox archiveFormatComboBox;
        private System.Windows.Forms.Label archiveFormatLabel;
        private System.Windows.Forms.TextBox archiveNameTextBox;
        private System.Windows.Forms.Label archiveNameLabel;
        private System.Windows.Forms.TextBox outputFolderTextBox;
        private System.Windows.Forms.Label outputFolderLabel;
        private System.Windows.Forms.Button browseOutputFolderButton;
        private System.Windows.Forms.CheckBox enableSplitCheckBox;
        private System.Windows.Forms.NumericUpDown splitSizeUpDown;
        private System.Windows.Forms.Label splitSizeLabel;
        private System.Windows.Forms.ProgressBar progressBar;
        private System.Windows.Forms.Label statusLabel;
        private System.Windows.Forms.Label progressPercentLabel;
    }
}
