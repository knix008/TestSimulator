namespace ImageScaler4x1._0
{
    partial class ImageScalerForm
    {
        private System.ComponentModel.IContainer components = null;

        // 이미지 패널 (원본)
        private System.Windows.Forms.Label      lblOriginal;
        private System.Windows.Forms.Panel      pnlOriginal;
        private System.Windows.Forms.PictureBox pbOriginal;

        // 이미지 패널 (확대 결과)
        private System.Windows.Forms.Label      lblUpscaled;
        private System.Windows.Forms.Panel      pnlUpscaled;
        private System.Windows.Forms.PictureBox pbUpscaled;

        // 줌 컨트롤
        private System.Windows.Forms.Button     btnZoomOut;
        private System.Windows.Forms.Label      lblZoomLevel;
        private System.Windows.Forms.Button     btnZoomIn;
        private System.Windows.Forms.Button     btnZoomFit;
        private System.Windows.Forms.Button     btnZoom100;
        private System.Windows.Forms.Button     btnZoomOutOutput;
        private System.Windows.Forms.Label      lblZoomLevelOutput;
        private System.Windows.Forms.Button     btnZoomInOutput;
        private System.Windows.Forms.Button     btnZoomFitOutput;
        private System.Windows.Forms.Button     btnZoom100Output;
        private System.Windows.Forms.Button     btnLoadImage;
        private System.Windows.Forms.Button     btnSaveImage;
        private System.Windows.Forms.Button     btnImageZoom;
        private System.Windows.Forms.MenuStrip  menuMain;
        private System.Windows.Forms.ToolStripMenuItem menuFile;
        private System.Windows.Forms.ToolStripMenuItem menuOpenFile;
        private System.Windows.Forms.ToolStripMenuItem menuSaveFile;

        // 설정 패널
        private System.Windows.Forms.GroupBox      grpSettings;
        private System.Windows.Forms.Label         lblModelPath;
        private System.Windows.Forms.TextBox       txtModelPath;
        private System.Windows.Forms.Button        btnBrowseModel;
        private System.Windows.Forms.Label         lblScaleFactor;
        private System.Windows.Forms.ComboBox      cmbScaleFactor;
        private System.Windows.Forms.Label         lblTileSize;
        private System.Windows.Forms.NumericUpDown nudTileSize;
        private System.Windows.Forms.Label         lblTileSizeHint;
        private System.Windows.Forms.Label         lblTilePadding;
        private System.Windows.Forms.NumericUpDown nudTilePadding;
        private System.Windows.Forms.Button        btnApplySettings;
        private System.Windows.Forms.Button        btnDownloadModel;
        private System.Windows.Forms.ProgressBar   prgUpscale;
        private System.Windows.Forms.Label         lblStatus;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(ImageScalerForm));
            lblOriginal = new Label();
            pnlOriginal = new Panel();
            pbOriginal = new PictureBox();
            lblUpscaled = new Label();
            pnlUpscaled = new Panel();
            pbUpscaled = new PictureBox();
            btnZoomOut = new Button();
            lblZoomLevel = new Label();
            btnZoomIn = new Button();
            btnZoomFit = new Button();
            btnZoom100 = new Button();
            btnZoomOutOutput = new Button();
            lblZoomLevelOutput = new Label();
            btnZoomInOutput = new Button();
            btnZoomFitOutput = new Button();
            btnZoom100Output = new Button();
            btnLoadImage = new Button();
            btnSaveImage = new Button();
            btnImageZoom = new Button();
            menuMain = new MenuStrip();
            menuFile = new ToolStripMenuItem();
            menuOpenFile = new ToolStripMenuItem();
            menuSaveFile = new ToolStripMenuItem();
            grpSettings = new GroupBox();
            lblModelPath = new Label();
            txtModelPath = new TextBox();
            btnBrowseModel = new Button();
            lblScaleFactor = new Label();
            cmbScaleFactor = new ComboBox();
            lblTileSize = new Label();
            nudTileSize = new NumericUpDown();
            lblTileSizeHint = new Label();
            lblTilePadding = new Label();
            nudTilePadding = new NumericUpDown();
            btnApplySettings = new Button();
            btnDownloadModel = new Button();
            prgUpscale = new ProgressBar();
            lblStatus = new Label();
            pnlOriginal.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pbOriginal).BeginInit();
            pnlUpscaled.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pbUpscaled).BeginInit();
            menuMain.SuspendLayout();
            grpSettings.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)nudTileSize).BeginInit();
            ((System.ComponentModel.ISupportInitialize)nudTilePadding).BeginInit();
            SuspendLayout();
            // 
            // lblOriginal
            // 
            lblOriginal.AutoSize = true;
            lblOriginal.Location = new Point(10, 35);
            lblOriginal.Name = "lblOriginal";
            lblOriginal.Size = new Size(31, 15);
            lblOriginal.TabIndex = 1;
            lblOriginal.Text = "원본";
            // 
            // pnlOriginal
            // 
            pnlOriginal.AutoScroll = true;
            pnlOriginal.BorderStyle = BorderStyle.FixedSingle;
            pnlOriginal.Controls.Add(pbOriginal);
            pnlOriginal.Location = new Point(10, 54);
            pnlOriginal.Name = "pnlOriginal";
            pnlOriginal.Size = new Size(500, 536);
            pnlOriginal.TabIndex = 2;
            // 
            // pbOriginal
            // 
            pbOriginal.Location = new Point(0, 0);
            pbOriginal.Name = "pbOriginal";
            pbOriginal.Size = new Size(498, 534);
            pbOriginal.SizeMode = PictureBoxSizeMode.Zoom;
            pbOriginal.TabIndex = 0;
            pbOriginal.TabStop = false;
            // 
            // lblUpscaled
            // 
            lblUpscaled.AutoSize = true;
            lblUpscaled.Location = new Point(530, 35);
            lblUpscaled.Name = "lblUpscaled";
            lblUpscaled.Size = new Size(59, 15);
            lblUpscaled.TabIndex = 3;
            lblUpscaled.Text = "확대 결과";
            // 
            // pnlUpscaled
            // 
            pnlUpscaled.AutoScroll = true;
            pnlUpscaled.BorderStyle = BorderStyle.FixedSingle;
            pnlUpscaled.Controls.Add(pbUpscaled);
            pnlUpscaled.Location = new Point(530, 54);
            pnlUpscaled.Name = "pnlUpscaled";
            pnlUpscaled.Size = new Size(500, 536);
            pnlUpscaled.TabIndex = 4;
            // 
            // pbUpscaled
            // 
            pbUpscaled.Location = new Point(0, 0);
            pbUpscaled.Name = "pbUpscaled";
            pbUpscaled.Size = new Size(498, 534);
            pbUpscaled.SizeMode = PictureBoxSizeMode.Zoom;
            pbUpscaled.TabIndex = 0;
            pbUpscaled.TabStop = false;
            // 
            // btnZoomOut
            // 
            btnZoomOut.Location = new Point(10, 602);
            btnZoomOut.Name = "btnZoomOut";
            btnZoomOut.Size = new Size(30, 26);
            btnZoomOut.TabIndex = 5;
            btnZoomOut.Text = "−";
            btnZoomOut.UseVisualStyleBackColor = true;
            btnZoomOut.Click += btnZoomOut_Click;
            // 
            // lblZoomLevel
            // 
            lblZoomLevel.Location = new Point(43, 607);
            lblZoomLevel.Name = "lblZoomLevel";
            lblZoomLevel.Size = new Size(56, 16);
            lblZoomLevel.TabIndex = 6;
            lblZoomLevel.Text = "100%";
            lblZoomLevel.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // btnZoomIn
            // 
            btnZoomIn.Location = new Point(102, 602);
            btnZoomIn.Name = "btnZoomIn";
            btnZoomIn.Size = new Size(30, 26);
            btnZoomIn.TabIndex = 7;
            btnZoomIn.Text = "+";
            btnZoomIn.UseVisualStyleBackColor = true;
            btnZoomIn.Click += btnZoomIn_Click;
            // 
            // btnZoomFit
            // 
            btnZoomFit.Location = new Point(138, 602);
            btnZoomFit.Name = "btnZoomFit";
            btnZoomFit.Size = new Size(58, 26);
            btnZoomFit.TabIndex = 8;
            btnZoomFit.Text = "맞춤";
            btnZoomFit.UseVisualStyleBackColor = true;
            btnZoomFit.Click += btnZoomFit_Click;
            // 
            // btnZoom100
            // 
            btnZoom100.Location = new Point(200, 602);
            btnZoom100.Name = "btnZoom100";
            btnZoom100.Size = new Size(46, 26);
            btnZoom100.TabIndex = 9;
            btnZoom100.Text = "1:1";
            btnZoom100.UseVisualStyleBackColor = true;
            btnZoom100.Click += btnZoom100_Click;
            // 
            // btnZoomOutOutput
            // 
            btnZoomOutOutput.Location = new Point(530, 602);
            btnZoomOutOutput.Name = "btnZoomOutOutput";
            btnZoomOutOutput.Size = new Size(30, 26);
            btnZoomOutOutput.TabIndex = 10;
            btnZoomOutOutput.Text = "−";
            btnZoomOutOutput.UseVisualStyleBackColor = true;
            btnZoomOutOutput.Click += btnZoomOutOutput_Click;
            // 
            // lblZoomLevelOutput
            // 
            lblZoomLevelOutput.Location = new Point(563, 607);
            lblZoomLevelOutput.Name = "lblZoomLevelOutput";
            lblZoomLevelOutput.Size = new Size(56, 16);
            lblZoomLevelOutput.TabIndex = 11;
            lblZoomLevelOutput.Text = "100%";
            lblZoomLevelOutput.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // btnZoomInOutput
            // 
            btnZoomInOutput.Location = new Point(622, 602);
            btnZoomInOutput.Name = "btnZoomInOutput";
            btnZoomInOutput.Size = new Size(30, 26);
            btnZoomInOutput.TabIndex = 12;
            btnZoomInOutput.Text = "+";
            btnZoomInOutput.UseVisualStyleBackColor = true;
            btnZoomInOutput.Click += btnZoomInOutput_Click;
            // 
            // btnZoomFitOutput
            // 
            btnZoomFitOutput.Location = new Point(658, 602);
            btnZoomFitOutput.Name = "btnZoomFitOutput";
            btnZoomFitOutput.Size = new Size(58, 26);
            btnZoomFitOutput.TabIndex = 13;
            btnZoomFitOutput.Text = "맞춤";
            btnZoomFitOutput.UseVisualStyleBackColor = true;
            btnZoomFitOutput.Click += btnZoomFitOutput_Click;
            // 
            // btnZoom100Output
            // 
            btnZoom100Output.Location = new Point(720, 602);
            btnZoom100Output.Name = "btnZoom100Output";
            btnZoom100Output.Size = new Size(46, 26);
            btnZoom100Output.TabIndex = 14;
            btnZoom100Output.Text = "1:1";
            btnZoom100Output.UseVisualStyleBackColor = true;
            btnZoom100Output.Click += btnZoom100Output_Click;
            // 
            // btnLoadImage
            // 
            btnLoadImage.Location = new Point(254, 602);
            btnLoadImage.Name = "btnLoadImage";
            btnLoadImage.Size = new Size(110, 26);
            btnLoadImage.TabIndex = 15;
            btnLoadImage.Text = "이미지 불러오기";
            btnLoadImage.UseVisualStyleBackColor = true;
            btnLoadImage.Click += btnLoadImage_Click;
            // 
            // btnSaveImage
            // 
            btnSaveImage.Location = new Point(772, 602);
            btnSaveImage.Name = "btnSaveImage";
            btnSaveImage.Size = new Size(110, 26);
            btnSaveImage.TabIndex = 16;
            btnSaveImage.Text = "이미지 저장하기";
            btnSaveImage.UseVisualStyleBackColor = true;
            btnSaveImage.Click += menuSaveFile_Click;
            // 
            // btnImageZoom
            // 
            btnImageZoom.BackColor = SystemColors.ControlDark;
            btnImageZoom.Font = new Font("맑은 고딕", 11F, FontStyle.Bold);
            btnImageZoom.Location = new Point(8, 332);
            btnImageZoom.Name = "btnImageZoom";
            btnImageZoom.Size = new Size(252, 48);
            btnImageZoom.TabIndex = 12;
            btnImageZoom.Text = "이미지 확대";
            btnImageZoom.UseVisualStyleBackColor = false;
            btnImageZoom.Click += btnImageZoom_Click;
            // 
            // menuMain
            // 
            menuMain.Items.AddRange(new ToolStripItem[] { menuFile });
            menuMain.Location = new Point(0, 0);
            menuMain.Name = "menuMain";
            menuMain.Size = new Size(1322, 24);
            menuMain.TabIndex = 0;
            // 
            // menuFile
            // 
            menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuOpenFile, menuSaveFile });
            menuFile.Name = "menuFile";
            menuFile.Size = new Size(57, 20);
            menuFile.Text = "파일(&F)";
            // 
            // menuOpenFile
            // 
            menuOpenFile.Name = "menuOpenFile";
            menuOpenFile.Size = new Size(115, 22);
            menuOpenFile.Text = "열기(&O)";
            menuOpenFile.Click += menuOpenFile_Click;
            // 
            // menuSaveFile
            // 
            menuSaveFile.Name = "menuSaveFile";
            menuSaveFile.Size = new Size(115, 22);
            menuSaveFile.Text = "저장(&S)";
            menuSaveFile.Click += menuSaveFile_Click;
            // 
            // grpSettings
            // 
            grpSettings.Controls.Add(lblModelPath);
            grpSettings.Controls.Add(txtModelPath);
            grpSettings.Controls.Add(btnBrowseModel);
            grpSettings.Controls.Add(lblScaleFactor);
            grpSettings.Controls.Add(cmbScaleFactor);
            grpSettings.Controls.Add(lblTileSize);
            grpSettings.Controls.Add(nudTileSize);
            grpSettings.Controls.Add(lblTileSizeHint);
            grpSettings.Controls.Add(lblTilePadding);
            grpSettings.Controls.Add(nudTilePadding);
            grpSettings.Controls.Add(btnApplySettings);
            grpSettings.Controls.Add(btnDownloadModel);
            grpSettings.Controls.Add(btnImageZoom);
            grpSettings.Controls.Add(prgUpscale);
            grpSettings.Controls.Add(lblStatus);
            grpSettings.Location = new Point(1040, 35);
            grpSettings.Name = "grpSettings";
            grpSettings.Size = new Size(272, 470);
            grpSettings.TabIndex = 11;
            grpSettings.TabStop = false;
            grpSettings.Text = "설정";
            // 
            // lblModelPath
            // 
            lblModelPath.AutoSize = true;
            lblModelPath.Location = new Point(8, 24);
            lblModelPath.Name = "lblModelPath";
            lblModelPath.Size = new Size(62, 15);
            lblModelPath.TabIndex = 0;
            lblModelPath.Text = "모델 경로:";
            // 
            // txtModelPath
            // 
            txtModelPath.Location = new Point(8, 42);
            txtModelPath.Name = "txtModelPath";
            txtModelPath.Size = new Size(208, 23);
            txtModelPath.TabIndex = 1;
            txtModelPath.Text = "realesrgan.onnx";
            // 
            // btnBrowseModel
            // 
            btnBrowseModel.Location = new Point(220, 42);
            btnBrowseModel.Name = "btnBrowseModel";
            btnBrowseModel.Size = new Size(40, 23);
            btnBrowseModel.TabIndex = 2;
            btnBrowseModel.Text = "...";
            btnBrowseModel.UseVisualStyleBackColor = true;
            btnBrowseModel.Click += btnBrowseModel_Click;
            // 
            // lblScaleFactor
            // 
            lblScaleFactor.AutoSize = true;
            lblScaleFactor.Location = new Point(8, 78);
            lblScaleFactor.Name = "lblScaleFactor";
            lblScaleFactor.Size = new Size(74, 15);
            lblScaleFactor.TabIndex = 3;
            lblScaleFactor.Text = "배율 (Scale):";
            // 
            // cmbScaleFactor
            // 
            cmbScaleFactor.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbScaleFactor.Items.AddRange(new object[] { "2", "4" });
            cmbScaleFactor.Location = new Point(8, 97);
            cmbScaleFactor.Name = "cmbScaleFactor";
            cmbScaleFactor.Size = new Size(70, 23);
            cmbScaleFactor.TabIndex = 4;
            // 
            // lblTileSize
            // 
            lblTileSize.AutoSize = true;
            lblTileSize.Location = new Point(8, 134);
            lblTileSize.Name = "lblTileSize";
            lblTileSize.Size = new Size(87, 15);
            lblTileSize.TabIndex = 5;
            lblTileSize.Text = "타일 크기 (px):";
            // 
            // nudTileSize
            // 
            nudTileSize.Increment = new decimal(new int[] { 64, 0, 0, 0 });
            nudTileSize.Location = new Point(8, 153);
            nudTileSize.Maximum = new decimal(new int[] { 2048, 0, 0, 0 });
            nudTileSize.Name = "nudTileSize";
            nudTileSize.Size = new Size(100, 23);
            nudTileSize.TabIndex = 6;
            // 
            // lblTileSizeHint
            // 
            lblTileSizeHint.AutoSize = true;
            lblTileSizeHint.ForeColor = Color.Gray;
            lblTileSizeHint.Location = new Point(8, 180);
            lblTileSizeHint.Name = "lblTileSizeHint";
            lblTileSizeHint.Size = new Size(102, 15);
            lblTileSizeHint.TabIndex = 7;
            lblTileSizeHint.Text = "(0 = 타일링 없음)";
            // 
            // lblTilePadding
            // 
            lblTilePadding.AutoSize = true;
            lblTilePadding.Location = new Point(8, 205);
            lblTilePadding.Name = "lblTilePadding";
            lblTilePadding.Size = new Size(87, 15);
            lblTilePadding.TabIndex = 8;
            lblTilePadding.Text = "타일 패딩 (px):";
            // 
            // nudTilePadding
            // 
            nudTilePadding.Increment = new decimal(new int[] { 2, 0, 0, 0 });
            nudTilePadding.Location = new Point(8, 224);
            nudTilePadding.Maximum = new decimal(new int[] { 128, 0, 0, 0 });
            nudTilePadding.Name = "nudTilePadding";
            nudTilePadding.Size = new Size(100, 23);
            nudTilePadding.TabIndex = 9;
            nudTilePadding.Value = new decimal(new int[] { 10, 0, 0, 0 });
            // 
            // btnApplySettings
            // 
            btnApplySettings.Location = new Point(8, 264);
            btnApplySettings.Name = "btnApplySettings";
            btnApplySettings.Size = new Size(252, 28);
            btnApplySettings.TabIndex = 10;
            btnApplySettings.Text = "적용 (모델 재로드)";
            btnApplySettings.UseVisualStyleBackColor = true;
            btnApplySettings.Click += btnApplySettings_Click;
            // 
            // btnDownloadModel
            // 
            btnDownloadModel.Location = new Point(8, 298);
            btnDownloadModel.Name = "btnDownloadModel";
            btnDownloadModel.Size = new Size(252, 28);
            btnDownloadModel.TabIndex = 11;
            btnDownloadModel.Text = "모델 다운로드...";
            btnDownloadModel.UseVisualStyleBackColor = true;
            btnDownloadModel.Click += btnDownloadModel_Click;
            // 
            // prgUpscale
            // 
            prgUpscale.Location = new Point(8, 390);
            prgUpscale.Name = "prgUpscale";
            prgUpscale.Size = new Size(252, 18);
            prgUpscale.Style = ProgressBarStyle.Continuous;
            prgUpscale.TabIndex = 13;
            // 
            // lblStatus
            // 
            lblStatus.Location = new Point(8, 414);
            lblStatus.Name = "lblStatus";
            lblStatus.Size = new Size(252, 50);
            lblStatus.TabIndex = 14;
            // 
            // ImageScalerForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1322, 640);
            Controls.Add(menuMain);
            Controls.Add(lblOriginal);
            Controls.Add(pnlOriginal);
            Controls.Add(lblUpscaled);
            Controls.Add(pnlUpscaled);
            Controls.Add(btnZoomOut);
            Controls.Add(lblZoomLevel);
            Controls.Add(btnZoomIn);
            Controls.Add(btnZoomFit);
            Controls.Add(btnZoom100);
            Controls.Add(btnZoomOutOutput);
            Controls.Add(lblZoomLevelOutput);
            Controls.Add(btnZoomInOutput);
            Controls.Add(btnZoomFitOutput);
            Controls.Add(btnZoom100Output);
            Controls.Add(btnLoadImage);
            Controls.Add(btnSaveImage);
            Controls.Add(grpSettings);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = menuMain;
            MaximizeBox = false;
            Name = "ImageScalerForm";
            Text = "Image Scaler 4x - RealESRGAN";
            pnlOriginal.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)pbOriginal).EndInit();
            pnlUpscaled.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)pbUpscaled).EndInit();
            menuMain.ResumeLayout(false);
            menuMain.PerformLayout();
            grpSettings.ResumeLayout(false);
            grpSettings.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)nudTileSize).EndInit();
            ((System.ComponentModel.ISupportInitialize)nudTilePadding).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion
    }
}
