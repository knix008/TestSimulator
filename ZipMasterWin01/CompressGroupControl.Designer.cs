namespace ZipMasterWin01
{
    partial class CompressGroupControl
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
            this.groupBoxCompress = new System.Windows.Forms.GroupBox();
            this.layoutCompress = new System.Windows.Forms.TableLayoutPanel();
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
            this.groupBoxCompress.SuspendLayout();
            this.layoutCompress.SuspendLayout();
            this.panelMode.SuspendLayout();
            this.panelSplitSize.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numericSplitMb)).BeginInit();
            this.panelCompressButtons.SuspendLayout();
            this.SuspendLayout();
            //
            // groupBoxCompress
            //
            this.groupBoxCompress.Controls.Add(this.layoutCompress);
            this.groupBoxCompress.Dock = System.Windows.Forms.DockStyle.Fill;
            this.groupBoxCompress.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.groupBoxCompress.Location = new System.Drawing.Point(0, 0);
            this.groupBoxCompress.Name = "groupBoxCompress";
            this.groupBoxCompress.Padding = new System.Windows.Forms.Padding(10, 8, 10, 10);
            this.groupBoxCompress.Size = new System.Drawing.Size(456, 180);
            this.groupBoxCompress.TabIndex = 0;
            this.groupBoxCompress.TabStop = false;
            this.groupBoxCompress.Text = "압축";
            //
            // layoutCompress
            //
            this.layoutCompress.ColumnCount = 1;
            this.layoutCompress.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 100F));
            this.layoutCompress.Controls.Add(this.panelMode, 0, 0);
            this.layoutCompress.Controls.Add(this.panelSplitSize, 0, 1);
            this.layoutCompress.Controls.Add(this.panelCompressButtons, 0, 2);
            this.layoutCompress.Dock = System.Windows.Forms.DockStyle.Fill;
            this.layoutCompress.Location = new System.Drawing.Point(10, 24);
            this.layoutCompress.Name = "layoutCompress";
            this.layoutCompress.RowCount = 3;
            this.layoutCompress.RowStyles.Add(new System.Windows.Forms.RowStyle());
            this.layoutCompress.RowStyles.Add(new System.Windows.Forms.RowStyle());
            this.layoutCompress.RowStyles.Add(new System.Windows.Forms.RowStyle());
            this.layoutCompress.Size = new System.Drawing.Size(436, 146);
            this.layoutCompress.TabIndex = 0;
            //
            // panelMode
            //
            this.panelMode.AutoSize = true;
            this.panelMode.Controls.Add(this.radioCompressSingle);
            this.panelMode.Controls.Add(this.radioCompressSplit);
            this.panelMode.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelMode.FlowDirection = System.Windows.Forms.FlowDirection.LeftToRight;
            this.panelMode.Location = new System.Drawing.Point(0, 0);
            this.panelMode.Margin = new System.Windows.Forms.Padding(0, 0, 0, 6);
            this.panelMode.Name = "panelMode";
            this.panelMode.Size = new System.Drawing.Size(436, 25);
            this.panelMode.TabIndex = 0;
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
            this.panelSplitSize.AutoSize = true;
            this.panelSplitSize.Controls.Add(this.labelSplitSize);
            this.panelSplitSize.Controls.Add(this.numericSplitMb);
            this.panelSplitSize.Controls.Add(this.labelSplitHint);
            this.panelSplitSize.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelSplitSize.Enabled = false;
            this.panelSplitSize.FlowDirection = System.Windows.Forms.FlowDirection.LeftToRight;
            this.panelSplitSize.Location = new System.Drawing.Point(0, 31);
            this.panelSplitSize.Margin = new System.Windows.Forms.Padding(0, 0, 0, 8);
            this.panelSplitSize.Name = "panelSplitSize";
            this.panelSplitSize.Padding = new System.Windows.Forms.Padding(0, 2, 0, 0);
            this.panelSplitSize.Size = new System.Drawing.Size(436, 31);
            this.panelSplitSize.TabIndex = 1;
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
            this.panelCompressButtons.AutoSize = true;
            this.panelCompressButtons.Controls.Add(this.buttonCompressFiles);
            this.panelCompressButtons.Controls.Add(this.buttonCompressFolder);
            this.panelCompressButtons.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelCompressButtons.FlowDirection = System.Windows.Forms.FlowDirection.LeftToRight;
            this.panelCompressButtons.Location = new System.Drawing.Point(0, 70);
            this.panelCompressButtons.Margin = new System.Windows.Forms.Padding(0);
            this.panelCompressButtons.Name = "panelCompressButtons";
            this.panelCompressButtons.Size = new System.Drawing.Size(436, 38);
            this.panelCompressButtons.TabIndex = 2;
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
            // CompressGroupControl
            //
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.Transparent;
            this.Controls.Add(this.groupBoxCompress);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.Name = "CompressGroupControl";
            this.Size = new System.Drawing.Size(456, 180);
            this.groupBoxCompress.ResumeLayout(false);
            this.layoutCompress.ResumeLayout(false);
            this.layoutCompress.PerformLayout();
            this.panelMode.ResumeLayout(false);
            this.panelMode.PerformLayout();
            this.panelSplitSize.ResumeLayout(false);
            this.panelSplitSize.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numericSplitMb)).EndInit();
            this.panelCompressButtons.ResumeLayout(false);
            this.panelCompressButtons.PerformLayout();
            this.ResumeLayout(false);
        }

        private System.Windows.Forms.GroupBox groupBoxCompress;
        private System.Windows.Forms.TableLayoutPanel layoutCompress;
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
    }
}
