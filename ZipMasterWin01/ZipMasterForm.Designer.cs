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

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(ZipMasterForm));
            this.panelMain = new System.Windows.Forms.Panel();
            this.labelTitle = new System.Windows.Forms.Label();
            this.labelSubtitle = new System.Windows.Forms.Label();
            this.labelSectionCompress = new System.Windows.Forms.Label();
            this.panelMode = new System.Windows.Forms.FlowLayoutPanel();
            this.radioCompressSingle = new System.Windows.Forms.RadioButton();
            this.radioCompressSplit = new System.Windows.Forms.RadioButton();
            this.panelSplitSize = new System.Windows.Forms.FlowLayoutPanel();
            this.labelSplitSize = new System.Windows.Forms.Label();
            this.numericSplitMb = new System.Windows.Forms.NumericUpDown();
            this.labelSplitHint = new System.Windows.Forms.Label();
            this.panelCompressButtons = new System.Windows.Forms.FlowLayoutPanel();
            this.buttonCompressFiles = new System.Windows.Forms.Button();
            this.buttonCompressFolder = new System.Windows.Forms.Button();
            this.labelSectionExtract = new System.Windows.Forms.Label();
            this.labelExtractHint = new System.Windows.Forms.Label();
            this.buttonExtract = new System.Windows.Forms.Button();
            this.statusStripMain = new System.Windows.Forms.StatusStrip();
            this.toolStripStatusLabelMain = new System.Windows.Forms.ToolStripStatusLabel();
            this.toolStripProgressBarMain = new System.Windows.Forms.ToolStripProgressBar();
            this.panelMain.SuspendLayout();
            this.panelMode.SuspendLayout();
            this.panelSplitSize.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numericSplitMb)).BeginInit();
            this.panelCompressButtons.SuspendLayout();
            this.statusStripMain.SuspendLayout();
            this.SuspendLayout();
            // 
            // panelMain
            // 
            this.panelMain.AutoScroll = true;
            this.panelMain.AutoScrollMinSize = new System.Drawing.Size(0, 380);
            this.panelMain.BackColor = System.Drawing.Color.White;
            this.panelMain.Controls.Add(this.labelTitle);
            this.panelMain.Controls.Add(this.labelSubtitle);
            this.panelMain.Controls.Add(this.labelSectionCompress);
            this.panelMain.Controls.Add(this.panelMode);
            this.panelMain.Controls.Add(this.panelSplitSize);
            this.panelMain.Controls.Add(this.panelCompressButtons);
            this.panelMain.Controls.Add(this.labelSectionExtract);
            this.panelMain.Controls.Add(this.labelExtractHint);
            this.panelMain.Controls.Add(this.buttonExtract);
            this.panelMain.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelMain.Location = new System.Drawing.Point(12, 12);
            this.panelMain.Name = "panelMain";
            this.panelMain.Padding = new System.Windows.Forms.Padding(12);
            this.panelMain.Size = new System.Drawing.Size(456, 394);
            this.panelMain.TabIndex = 0;
            // 
            // labelTitle
            // 
            this.labelTitle.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.labelTitle.Font = new System.Drawing.Font("Segoe UI", 14.25F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.labelTitle.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(33)))), ((int)(((byte)(33)))), ((int)(((byte)(33)))));
            this.labelTitle.Location = new System.Drawing.Point(12, 12);
            this.labelTitle.Margin = new System.Windows.Forms.Padding(0, 0, 0, 4);
            this.labelTitle.Name = "labelTitle";
            this.labelTitle.Size = new System.Drawing.Size(432, 28);
            this.labelTitle.TabIndex = 0;
            this.labelTitle.Text = "ZipMaster";
            // 
            // labelSubtitle
            // 
            this.labelSubtitle.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.labelSubtitle.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.labelSubtitle.ForeColor = System.Drawing.SystemColors.GrayText;
            this.labelSubtitle.Location = new System.Drawing.Point(12, 44);
            this.labelSubtitle.Margin = new System.Windows.Forms.Padding(0, 0, 0, 12);
            this.labelSubtitle.Name = "labelSubtitle";
            this.labelSubtitle.Size = new System.Drawing.Size(432, 36);
            this.labelSubtitle.TabIndex = 1;
            this.labelSubtitle.Text = "파일 또는 폴더를 ZIP으로 압축하거나, ZIP을 풀어보세요.";
            // 
            // labelSectionCompress
            // 
            this.labelSectionCompress.AutoSize = true;
            this.labelSectionCompress.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.labelSectionCompress.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(33)))), ((int)(((byte)(33)))), ((int)(((byte)(33)))));
            this.labelSectionCompress.Location = new System.Drawing.Point(12, 92);
            this.labelSectionCompress.Margin = new System.Windows.Forms.Padding(0, 0, 0, 6);
            this.labelSectionCompress.Name = "labelSectionCompress";
            this.labelSectionCompress.Size = new System.Drawing.Size(31, 15);
            this.labelSectionCompress.TabIndex = 2;
            this.labelSectionCompress.Text = "압축";
            // 
            // panelMode
            // 
            this.panelMode.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.panelMode.AutoSize = true;
            this.panelMode.Controls.Add(this.radioCompressSingle);
            this.panelMode.Controls.Add(this.radioCompressSplit);
            this.panelMode.Location = new System.Drawing.Point(12, 113);
            this.panelMode.Margin = new System.Windows.Forms.Padding(0, 0, 0, 6);
            this.panelMode.Name = "panelMode";
            this.panelMode.Size = new System.Drawing.Size(432, 25);
            this.panelMode.TabIndex = 3;
            this.panelMode.WrapContents = false;
            // 
            // radioCompressSingle
            // 
            this.radioCompressSingle.AutoSize = true;
            this.radioCompressSingle.Checked = true;
            this.radioCompressSingle.Location = new System.Drawing.Point(3, 3);
            this.radioCompressSingle.Name = "radioCompressSingle";
            this.radioCompressSingle.Size = new System.Drawing.Size(96, 19);
            this.radioCompressSingle.TabIndex = 0;
            this.radioCompressSingle.TabStop = true;
            this.radioCompressSingle.Text = "단일 ZIP 파일";
            this.radioCompressSingle.UseVisualStyleBackColor = true;
            // 
            // radioCompressSplit
            // 
            this.radioCompressSplit.AutoSize = true;
            this.radioCompressSplit.Location = new System.Drawing.Point(105, 3);
            this.radioCompressSplit.Name = "radioCompressSplit";
            this.radioCompressSplit.Size = new System.Drawing.Size(138, 19);
            this.radioCompressSplit.TabIndex = 1;
            this.radioCompressSplit.Text = "용량 분할 (여러 조각)";
            this.radioCompressSplit.UseVisualStyleBackColor = true;
            // 
            // panelSplitSize
            // 
            this.panelSplitSize.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.panelSplitSize.AutoSize = true;
            this.panelSplitSize.Controls.Add(this.labelSplitSize);
            this.panelSplitSize.Controls.Add(this.numericSplitMb);
            this.panelSplitSize.Controls.Add(this.labelSplitHint);
            this.panelSplitSize.Enabled = false;
            this.panelSplitSize.Location = new System.Drawing.Point(12, 144);
            this.panelSplitSize.Margin = new System.Windows.Forms.Padding(0, 0, 0, 8);
            this.panelSplitSize.Name = "panelSplitSize";
            this.panelSplitSize.Padding = new System.Windows.Forms.Padding(0, 2, 0, 0);
            this.panelSplitSize.Size = new System.Drawing.Size(432, 31);
            this.panelSplitSize.TabIndex = 4;
            this.panelSplitSize.WrapContents = false;
            // 
            // labelSplitSize
            // 
            this.labelSplitSize.Anchor = System.Windows.Forms.AnchorStyles.Left;
            this.labelSplitSize.AutoSize = true;
            this.labelSplitSize.Location = new System.Drawing.Point(3, 9);
            this.labelSplitSize.Name = "labelSplitSize";
            this.labelSplitSize.Size = new System.Drawing.Size(102, 15);
            this.labelSplitSize.TabIndex = 0;
            this.labelSplitSize.Text = "분할당 크기 (MB):";
            // 
            // numericSplitMb
            // 
            this.numericSplitMb.Anchor = System.Windows.Forms.AnchorStyles.Left;
            this.numericSplitMb.Location = new System.Drawing.Point(111, 5);
            this.numericSplitMb.Maximum = new decimal(new int[] {
            10240,
            0,
            0,
            0});
            this.numericSplitMb.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            0});
            this.numericSplitMb.Name = "numericSplitMb";
            this.numericSplitMb.Size = new System.Drawing.Size(80, 23);
            this.numericSplitMb.TabIndex = 1;
            this.numericSplitMb.Value = new decimal(new int[] {
            100,
            0,
            0,
            0});
            // 
            // labelSplitHint
            // 
            this.labelSplitHint.Anchor = System.Windows.Forms.AnchorStyles.Left;
            this.labelSplitHint.AutoSize = true;
            this.labelSplitHint.ForeColor = System.Drawing.SystemColors.GrayText;
            this.labelSplitHint.Location = new System.Drawing.Point(197, 9);
            this.labelSplitHint.Name = "labelSplitHint";
            this.labelSplitHint.Size = new System.Drawing.Size(166, 15);
            this.labelSplitHint.TabIndex = 2;
            this.labelSplitHint.Text = "→ archive.zip.001, .002, … 형식";
            // 
            // panelCompressButtons
            // 
            this.panelCompressButtons.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.panelCompressButtons.AutoSize = true;
            this.panelCompressButtons.Controls.Add(this.buttonCompressFiles);
            this.panelCompressButtons.Controls.Add(this.buttonCompressFolder);
            this.panelCompressButtons.Location = new System.Drawing.Point(12, 183);
            this.panelCompressButtons.Margin = new System.Windows.Forms.Padding(0);
            this.panelCompressButtons.Name = "panelCompressButtons";
            this.panelCompressButtons.Size = new System.Drawing.Size(432, 38);
            this.panelCompressButtons.TabIndex = 5;
            this.panelCompressButtons.WrapContents = false;
            // 
            // buttonCompressFiles
            // 
            this.buttonCompressFiles.AutoSize = true;
            this.buttonCompressFiles.Location = new System.Drawing.Point(3, 3);
            this.buttonCompressFiles.MinimumSize = new System.Drawing.Size(140, 29);
            this.buttonCompressFiles.Name = "buttonCompressFiles";
            this.buttonCompressFiles.Size = new System.Drawing.Size(160, 29);
            this.buttonCompressFiles.TabIndex = 0;
            this.buttonCompressFiles.Text = "파일 선택 후 압축…";
            this.buttonCompressFiles.UseVisualStyleBackColor = true;
            // 
            // buttonCompressFolder
            // 
            this.buttonCompressFolder.AutoSize = true;
            this.buttonCompressFolder.Location = new System.Drawing.Point(169, 3);
            this.buttonCompressFolder.MinimumSize = new System.Drawing.Size(140, 29);
            this.buttonCompressFolder.Name = "buttonCompressFolder";
            this.buttonCompressFolder.Size = new System.Drawing.Size(160, 29);
            this.buttonCompressFolder.TabIndex = 1;
            this.buttonCompressFolder.Text = "폴더 선택 후 압축…";
            this.buttonCompressFolder.UseVisualStyleBackColor = true;
            // 
            // labelSectionExtract
            // 
            this.labelSectionExtract.AutoSize = true;
            this.labelSectionExtract.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.labelSectionExtract.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(33)))), ((int)(((byte)(33)))), ((int)(((byte)(33)))));
            this.labelSectionExtract.Location = new System.Drawing.Point(12, 233);
            this.labelSectionExtract.Margin = new System.Windows.Forms.Padding(0, 0, 0, 6);
            this.labelSectionExtract.Name = "labelSectionExtract";
            this.labelSectionExtract.Size = new System.Drawing.Size(58, 15);
            this.labelSectionExtract.TabIndex = 6;
            this.labelSectionExtract.Text = "압축 해제";
            // 
            // labelExtractHint
            // 
            this.labelExtractHint.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.labelExtractHint.ForeColor = System.Drawing.SystemColors.GrayText;
            this.labelExtractHint.Location = new System.Drawing.Point(12, 254);
            this.labelExtractHint.Margin = new System.Windows.Forms.Padding(0, 0, 0, 8);
            this.labelExtractHint.Name = "labelExtractHint";
            this.labelExtractHint.Size = new System.Drawing.Size(432, 46);
            this.labelExtractHint.TabIndex = 7;
            this.labelExtractHint.Text = "일반 .zip 또는 분할 압축의 첫 조각(.zip.001)을 선택할 수 있습니다.\r\n압축을 풀 폴더를 지정합니다.";
            // 
            // buttonExtract
            // 
            this.buttonExtract.AutoSize = true;
            this.buttonExtract.Location = new System.Drawing.Point(12, 304);
            this.buttonExtract.MinimumSize = new System.Drawing.Size(200, 32);
            this.buttonExtract.Name = "buttonExtract";
            this.buttonExtract.Size = new System.Drawing.Size(200, 32);
            this.buttonExtract.TabIndex = 8;
            this.buttonExtract.Text = "ZIP 선택 후 압축 해제…";
            this.buttonExtract.UseVisualStyleBackColor = true;
            // 
            // statusStripMain
            // 
            this.statusStripMain.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.toolStripStatusLabelMain,
            this.toolStripProgressBarMain});
            this.statusStripMain.Location = new System.Drawing.Point(12, 406);
            this.statusStripMain.Name = "statusStripMain";
            this.statusStripMain.Size = new System.Drawing.Size(456, 22);
            this.statusStripMain.SizingGrip = false;
            this.statusStripMain.TabIndex = 1;
            this.statusStripMain.Text = "statusStripMain";
            // 
            // toolStripStatusLabelMain
            // 
            this.toolStripStatusLabelMain.Name = "toolStripStatusLabelMain";
            this.toolStripStatusLabelMain.Size = new System.Drawing.Size(441, 17);
            this.toolStripStatusLabelMain.Spring = true;
            this.toolStripStatusLabelMain.Text = "준비";
            this.toolStripStatusLabelMain.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // toolStripProgressBarMain
            // 
            this.toolStripProgressBarMain.Name = "toolStripProgressBarMain";
            this.toolStripProgressBarMain.Size = new System.Drawing.Size(220, 18);
            this.toolStripProgressBarMain.Style = System.Windows.Forms.ProgressBarStyle.Continuous;
            this.toolStripProgressBarMain.Visible = false;
            // 
            // ZipMasterForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.White;
            this.ClientSize = new System.Drawing.Size(480, 440);
            this.Controls.Add(this.panelMain);
            this.Controls.Add(this.statusStripMain);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.MaximizeBox = false;
            this.MinimumSize = new System.Drawing.Size(420, 380);
            this.Name = "ZipMasterForm";
            this.Padding = new System.Windows.Forms.Padding(12);
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "ZipMaster V1.0";
            this.panelMain.ResumeLayout(false);
            this.panelMain.PerformLayout();
            this.panelMode.ResumeLayout(false);
            this.panelMode.PerformLayout();
            this.panelSplitSize.ResumeLayout(false);
            this.panelSplitSize.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numericSplitMb)).EndInit();
            this.panelCompressButtons.ResumeLayout(false);
            this.panelCompressButtons.PerformLayout();
            this.statusStripMain.ResumeLayout(false);
            this.statusStripMain.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        private System.Windows.Forms.Panel panelMain;
        private System.Windows.Forms.Label labelTitle;
        private System.Windows.Forms.Label labelSubtitle;
        private System.Windows.Forms.Label labelSectionCompress;
        private System.Windows.Forms.FlowLayoutPanel panelMode;
        private System.Windows.Forms.RadioButton radioCompressSingle;
        private System.Windows.Forms.RadioButton radioCompressSplit;
        private System.Windows.Forms.FlowLayoutPanel panelSplitSize;
        private System.Windows.Forms.Label labelSplitSize;
        private System.Windows.Forms.NumericUpDown numericSplitMb;
        private System.Windows.Forms.Label labelSplitHint;
        private System.Windows.Forms.FlowLayoutPanel panelCompressButtons;
        private System.Windows.Forms.Button buttonCompressFiles;
        private System.Windows.Forms.Button buttonCompressFolder;
        private System.Windows.Forms.Label labelSectionExtract;
        private System.Windows.Forms.Label labelExtractHint;
        private System.Windows.Forms.Button buttonExtract;
        private System.Windows.Forms.StatusStrip statusStripMain;
        private System.Windows.Forms.ToolStripStatusLabel toolStripStatusLabelMain;
        private System.Windows.Forms.ToolStripProgressBar toolStripProgressBarMain;
    }
}
