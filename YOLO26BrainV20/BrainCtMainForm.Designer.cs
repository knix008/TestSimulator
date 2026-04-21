namespace YOLO26BrainV20
{
    public partial class BrainCtMainForm
    {
        private System.ComponentModel.IContainer components = null;

        private MenuStrip menuStripMain;
        private ToolStripMenuItem menuFile;
        private ToolStripMenuItem menuSaveImage;
        private ToolStripMenuItem menuSaveCsv;
        private ToolStripSeparator menuFileSep;
        private ToolStripMenuItem menuExit;
        private ToolStripMenuItem menuTools;
        private ToolStripMenuItem menuConvertPt;
        private ToolStripMenuItem menuRecommendedDefaults;
        private ToolStripSeparator menuToolsSep;
        private ToolStripMenuItem menuOpenSampleFolder;
        private Label lblOnnxTitle;
        private Button btnModel;
        private Label lblOnnxPath;
        private Label lblImageTitle;
        private Button btnImage;
        private Label lblSlicePath;
        private Label lblExecutionProvider;
        private ComboBox comboExecutionProvider;
        private Label lblConf;
        private TrackBar trackConf;
        private NumericUpDown numConf;
        private Button btnAnalyze;
        private Button btnSave;
        private Button btnSaveCsv;
        private ProgressBar progressInference;
        private Label lblStatus;
        private Label lblPreviewInTitle;
        private Label lblZoomInput;
        private Button btnResetInputZoom;
        private Label lblPreviewOutTitle;
        private Label lblZoomOutput;
        private Button btnResetOutputZoom;
        private Panel panelInputViewport;
        private PictureBox picInput;
        private Panel panelOutputViewport;
        private PictureBox picOutput;
        private ListView listDetections;

        protected override void Dispose(bool disposing)
        {
            if (disposing)
                components?.Dispose();

            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(BrainCtMainForm));
            menuStripMain = new MenuStrip();
            menuFile = new ToolStripMenuItem();
            menuSaveImage = new ToolStripMenuItem();
            menuSaveCsv = new ToolStripMenuItem();
            menuFileSep = new ToolStripSeparator();
            menuExit = new ToolStripMenuItem();
            menuTools = new ToolStripMenuItem();
            menuConvertPt = new ToolStripMenuItem();
            menuRecommendedDefaults = new ToolStripMenuItem();
            menuToolsSep = new ToolStripSeparator();
            menuOpenSampleFolder = new ToolStripMenuItem();
            lblOnnxTitle = new Label();
            btnModel = new Button();
            lblOnnxPath = new Label();
            lblImageTitle = new Label();
            btnImage = new Button();
            lblSlicePath = new Label();
            lblExecutionProvider = new Label();
            comboExecutionProvider = new ComboBox();
            lblConf = new Label();
            trackConf = new TrackBar();
            numConf = new NumericUpDown();
            btnAnalyze = new Button();
            btnSave = new Button();
            btnSaveCsv = new Button();
            progressInference = new ProgressBar();
            lblStatus = new Label();
            lblPreviewInTitle = new Label();
            lblZoomInput = new Label();
            btnResetInputZoom = new Button();
            lblPreviewOutTitle = new Label();
            lblZoomOutput = new Label();
            btnResetOutputZoom = new Button();
            panelInputViewport = new Panel();
            picInput = new PictureBox();
            panelOutputViewport = new Panel();
            picOutput = new PictureBox();
            listDetections = new ListView();
            menuStripMain.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)trackConf).BeginInit();
            ((System.ComponentModel.ISupportInitialize)numConf).BeginInit();
            panelInputViewport.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picInput).BeginInit();
            panelOutputViewport.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picOutput).BeginInit();
            SuspendLayout();
            // 
            // menuStripMain
            // 
            menuStripMain.ImageScalingSize = new Size(20, 20);
            menuStripMain.Items.AddRange(new ToolStripItem[] { menuFile, menuTools });
            menuStripMain.Location = new Point(0, 0);
            menuStripMain.Name = "menuStripMain";
            menuStripMain.Size = new Size(1440, 24);
            menuStripMain.TabIndex = 0;
            menuStripMain.Text = "menuStripMain";
            // 
            // menuFile
            // 
            menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuSaveImage, menuSaveCsv, menuFileSep, menuExit });
            menuFile.Name = "menuFile";
            menuFile.Size = new Size(57, 20);
            menuFile.Text = "파일(&F)";
            // 
            // menuSaveImage
            // 
            menuSaveImage.Enabled = false;
            menuSaveImage.Name = "menuSaveImage";
            menuSaveImage.Size = new Size(234, 22);
            menuSaveImage.Text = "결과 이미지 저장(&I)…";
            // 
            // menuSaveCsv
            // 
            menuSaveCsv.Enabled = false;
            menuSaveCsv.Name = "menuSaveCsv";
            menuSaveCsv.Size = new Size(234, 22);
            menuSaveCsv.Text = "출혈 영역 목록 CSV 저장(&C)…";
            // 
            // menuFileSep
            // 
            menuFileSep.Name = "menuFileSep";
            menuFileSep.Size = new Size(231, 6);
            // 
            // menuExit
            // 
            menuExit.Name = "menuExit";
            menuExit.Size = new Size(234, 22);
            menuExit.Text = "종료(&X)";
            // 
            // menuTools
            // 
            menuTools.DropDownItems.AddRange(new ToolStripItem[] { menuConvertPt, menuRecommendedDefaults, menuToolsSep, menuOpenSampleFolder });
            menuTools.Name = "menuTools";
            menuTools.Size = new Size(57, 20);
            menuTools.Text = "도구(&T)";
            // 
            // menuConvertPt
            // 
            menuConvertPt.Name = "menuConvertPt";
            menuConvertPt.Size = new Size(221, 22);
            menuConvertPt.Text = "PyTorch(.pt)→ONNX 변환…";
            // 
            // menuRecommendedDefaults
            // 
            menuRecommendedDefaults.Name = "menuRecommendedDefaults";
            menuRecommendedDefaults.Size = new Size(221, 22);
            menuRecommendedDefaults.Text = "추천 기본값 적용(&R)";
            // 
            // menuToolsSep
            // 
            menuToolsSep.Name = "menuToolsSep";
            menuToolsSep.Size = new Size(218, 6);
            // 
            // menuOpenSampleFolder
            // 
            menuOpenSampleFolder.Name = "menuOpenSampleFolder";
            menuOpenSampleFolder.Size = new Size(221, 22);
            menuOpenSampleFolder.Text = "샘플 이미지 폴더 열기";
            // 
            // lblOnnxTitle
            // 
            lblOnnxTitle.AutoSize = true;
            lblOnnxTitle.Location = new Point(12, 32);
            lblOnnxTitle.Name = "lblOnnxTitle";
            lblOnnxTitle.Size = new Size(69, 15);
            lblOnnxTitle.TabIndex = 1;
            lblOnnxTitle.Text = "ONNX 모델";
            // 
            // btnModel
            // 
            btnModel.Location = new Point(12, 52);
            btnModel.Name = "btnModel";
            btnModel.Size = new Size(96, 22);
            btnModel.TabIndex = 2;
            btnModel.Text = "모델 선택…";
            btnModel.UseVisualStyleBackColor = true;
            // 
            // lblOnnxPath
            // 
            lblOnnxPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lblOnnxPath.AutoEllipsis = true;
            lblOnnxPath.Location = new Point(114, 52);
            lblOnnxPath.Name = "lblOnnxPath";
            lblOnnxPath.Size = new Size(1314, 22);
            lblOnnxPath.TabIndex = 3;
            lblOnnxPath.Text = "선택된 모델 없음";
            lblOnnxPath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // lblImageTitle
            // 
            lblImageTitle.AutoSize = true;
            lblImageTitle.Location = new Point(12, 84);
            lblImageTitle.Name = "lblImageTitle";
            lblImageTitle.Size = new Size(43, 15);
            lblImageTitle.TabIndex = 4;
            lblImageTitle.Text = "이미지";
            // 
            // btnImage
            // 
            btnImage.Location = new Point(12, 104);
            btnImage.Name = "btnImage";
            btnImage.Size = new Size(96, 22);
            btnImage.TabIndex = 5;
            btnImage.Text = "이미지 열기…";
            btnImage.UseVisualStyleBackColor = true;
            // 
            // lblSlicePath
            // 
            lblSlicePath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lblSlicePath.AutoEllipsis = true;
            lblSlicePath.Location = new Point(114, 104);
            lblSlicePath.Name = "lblSlicePath";
            lblSlicePath.Size = new Size(1314, 22);
            lblSlicePath.TabIndex = 6;
            lblSlicePath.Text = "불러온 이미지 없음";
            lblSlicePath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // lblExecutionProvider
            // 
            lblExecutionProvider.AutoSize = true;
            lblExecutionProvider.Location = new Point(12, 138);
            lblExecutionProvider.Name = "lblExecutionProvider";
            lblExecutionProvider.Size = new Size(69, 15);
            lblExecutionProvider.TabIndex = 26;
            lblExecutionProvider.Text = "ONNX 실행";
            // 
            // comboExecutionProvider
            // 
            comboExecutionProvider.DropDownStyle = ComboBoxStyle.DropDownList;
            comboExecutionProvider.FormattingEnabled = true;
            comboExecutionProvider.Items.AddRange(new object[] { "자동 (CUDA 우선, 실패 시 CPU)", "CPU만", "GPU (CUDA)만" });
            comboExecutionProvider.Location = new Point(84, 134);
            comboExecutionProvider.Name = "comboExecutionProvider";
            comboExecutionProvider.Size = new Size(240, 23);
            comboExecutionProvider.TabIndex = 27;
            // 
            // lblConf
            // 
            lblConf.AutoSize = true;
            lblConf.Location = new Point(336, 138);
            lblConf.Name = "lblConf";
            lblConf.Size = new Size(71, 15);
            lblConf.TabIndex = 9;
            lblConf.Text = "최소 신뢰도";
            // 
            // trackConf
            // 
            trackConf.Location = new Point(412, 128);
            trackConf.Maximum = 100;
            trackConf.Minimum = 1;
            trackConf.Name = "trackConf";
            trackConf.Size = new Size(530, 45);
            trackConf.TabIndex = 10;
            trackConf.TickFrequency = 10;
            trackConf.Value = 25;
            // 
            // numConf
            // 
            numConf.DecimalPlaces = 2;
            numConf.Increment = new decimal(new int[] { 1, 0, 0, 131072 });
            numConf.Location = new Point(950, 134);
            numConf.Maximum = new decimal(new int[] { 1, 0, 0, 0 });
            numConf.Minimum = new decimal(new int[] { 1, 0, 0, 131072 });
            numConf.Name = "numConf";
            numConf.Size = new Size(58, 23);
            numConf.TabIndex = 11;
            numConf.Value = new decimal(new int[] { 25, 0, 0, 131072 });
            // 
            // btnAnalyze
            // 
            btnAnalyze.Location = new Point(1280, 130);
            btnAnalyze.Name = "btnAnalyze";
            btnAnalyze.Size = new Size(96, 28);
            btnAnalyze.TabIndex = 12;
            btnAnalyze.Text = "세그 실행";
            btnAnalyze.UseVisualStyleBackColor = true;
            // 
            // btnSave
            // 
            btnSave.Enabled = false;
            btnSave.Location = new Point(1148, 130);
            btnSave.Name = "btnSave";
            btnSave.Size = new Size(124, 28);
            btnSave.TabIndex = 13;
            btnSave.Text = "결과 이미지 저장…";
            btnSave.UseVisualStyleBackColor = true;
            // 
            // btnSaveCsv
            // 
            btnSaveCsv.Enabled = false;
            btnSaveCsv.Location = new Point(1016, 130);
            btnSaveCsv.Name = "btnSaveCsv";
            btnSaveCsv.Size = new Size(124, 28);
            btnSaveCsv.TabIndex = 14;
            btnSaveCsv.Text = "영역 CSV 저장…";
            btnSaveCsv.UseVisualStyleBackColor = true;
            // 
            // progressInference
            // 
            progressInference.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            progressInference.Location = new Point(12, 171);
            progressInference.MarqueeAnimationSpeed = 35;
            progressInference.Name = "progressInference";
            progressInference.Size = new Size(1416, 14);
            progressInference.Style = ProgressBarStyle.Continuous;
            progressInference.TabIndex = 15;
            // 
            // lblStatus
            // 
            lblStatus.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lblStatus.AutoEllipsis = true;
            lblStatus.Location = new Point(12, 203);
            lblStatus.Name = "lblStatus";
            lblStatus.Size = new Size(1416, 28);
            lblStatus.TabIndex = 16;
            lblStatus.Text = "준비됨 — 출혈 세그 ONNX와 뇌 CT 이미지를 선택한 뒤 [세그 실행]을 누르세요.";
            // 
            // lblPreviewInTitle
            // 
            lblPreviewInTitle.AutoSize = true;
            lblPreviewInTitle.Location = new Point(12, 234);
            lblPreviewInTitle.Name = "lblPreviewInTitle";
            lblPreviewInTitle.Size = new Size(71, 15);
            lblPreviewInTitle.TabIndex = 17;
            lblPreviewInTitle.Text = "입력 이미지";
            // 
            // lblZoomInput
            // 
            lblZoomInput.AutoSize = true;
            lblZoomInput.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
            lblZoomInput.ForeColor = Color.Red;
            lblZoomInput.Location = new Point(100, 234);
            lblZoomInput.Name = "lblZoomInput";
            lblZoomInput.Size = new Size(67, 15);
            lblZoomInput.TabIndex = 40;
            lblZoomInput.Text = "입력 100%";
            // 
            // btnResetInputZoom
            // 
            btnResetInputZoom.Location = new Point(320, 228);
            btnResetInputZoom.Name = "btnResetInputZoom";
            btnResetInputZoom.Size = new Size(88, 26);
            btnResetInputZoom.TabIndex = 19;
            btnResetInputZoom.Text = "원래 크기";
            btnResetInputZoom.UseVisualStyleBackColor = true;
            // 
            // lblPreviewOutTitle
            // 
            lblPreviewOutTitle.AutoSize = true;
            lblPreviewOutTitle.Location = new Point(732, 234);
            lblPreviewOutTitle.Name = "lblPreviewOutTitle";
            lblPreviewOutTitle.Size = new Size(71, 15);
            lblPreviewOutTitle.TabIndex = 18;
            lblPreviewOutTitle.Text = "결과 이미지";
            // 
            // lblZoomOutput
            // 
            lblZoomOutput.AutoSize = true;
            lblZoomOutput.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
            lblZoomOutput.ForeColor = Color.Red;
            lblZoomOutput.Location = new Point(820, 234);
            lblZoomOutput.Name = "lblZoomOutput";
            lblZoomOutput.Size = new Size(67, 15);
            lblZoomOutput.TabIndex = 41;
            lblZoomOutput.Text = "결과 100%";
            // 
            // btnResetOutputZoom
            // 
            btnResetOutputZoom.Location = new Point(1340, 228);
            btnResetOutputZoom.Name = "btnResetOutputZoom";
            btnResetOutputZoom.Size = new Size(88, 26);
            btnResetOutputZoom.TabIndex = 20;
            btnResetOutputZoom.Text = "원래 크기";
            btnResetOutputZoom.UseVisualStyleBackColor = true;
            // 
            // panelInputViewport
            // 
            panelInputViewport.AutoScroll = true;
            panelInputViewport.BackColor = Color.FromArgb(32, 32, 36);
            panelInputViewport.BorderStyle = BorderStyle.Fixed3D;
            panelInputViewport.Controls.Add(picInput);
            panelInputViewport.Location = new Point(12, 258);
            panelInputViewport.Name = "panelInputViewport";
            panelInputViewport.Size = new Size(702, 404);
            panelInputViewport.TabIndex = 21;
            // 
            // picInput
            // 
            picInput.BackColor = Color.FromArgb(32, 32, 36);
            picInput.Location = new Point(0, 0);
            picInput.Name = "picInput";
            picInput.Size = new Size(694, 402);
            picInput.SizeMode = PictureBoxSizeMode.Zoom;
            picInput.TabIndex = 23;
            picInput.TabStop = false;
            // 
            // panelOutputViewport
            // 
            panelOutputViewport.AutoScroll = true;
            panelOutputViewport.BackColor = Color.FromArgb(32, 32, 36);
            panelOutputViewport.BorderStyle = BorderStyle.Fixed3D;
            panelOutputViewport.Controls.Add(picOutput);
            panelOutputViewport.Location = new Point(726, 258);
            panelOutputViewport.Name = "panelOutputViewport";
            panelOutputViewport.Size = new Size(702, 404);
            panelOutputViewport.TabIndex = 22;
            // 
            // picOutput
            // 
            picOutput.BackColor = Color.FromArgb(32, 32, 36);
            picOutput.Location = new Point(0, 0);
            picOutput.Name = "picOutput";
            picOutput.Size = new Size(694, 402);
            picOutput.SizeMode = PictureBoxSizeMode.Zoom;
            picOutput.TabIndex = 24;
            picOutput.TabStop = false;
            // 
            // listDetections
            // 
            listDetections.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            listDetections.FullRowSelect = true;
            listDetections.GridLines = true;
            listDetections.Location = new Point(12, 668);
            listDetections.MultiSelect = false;
            listDetections.Name = "listDetections";
            listDetections.Size = new Size(1416, 200);
            listDetections.TabIndex = 25;
            listDetections.UseCompatibleStateImageBehavior = false;
            listDetections.View = View.Details;
            // 
            // BrainCtMainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1440, 880);
            Controls.Add(listDetections);
            Controls.Add(panelOutputViewport);
            Controls.Add(panelInputViewport);
            Controls.Add(btnResetOutputZoom);
            Controls.Add(lblZoomOutput);
            Controls.Add(lblPreviewOutTitle);
            Controls.Add(btnResetInputZoom);
            Controls.Add(lblZoomInput);
            Controls.Add(lblPreviewInTitle);
            Controls.Add(lblStatus);
            Controls.Add(progressInference);
            Controls.Add(btnSaveCsv);
            Controls.Add(btnSave);
            Controls.Add(btnAnalyze);
            Controls.Add(numConf);
            Controls.Add(trackConf);
            Controls.Add(lblConf);
            Controls.Add(comboExecutionProvider);
            Controls.Add(lblExecutionProvider);
            Controls.Add(lblSlicePath);
            Controls.Add(btnImage);
            Controls.Add(lblImageTitle);
            Controls.Add(lblOnnxPath);
            Controls.Add(btnModel);
            Controls.Add(lblOnnxTitle);
            Controls.Add(menuStripMain);
            Font = new Font("맑은 고딕", 9F);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = menuStripMain;
            MinimumSize = new Size(1000, 680);
            Name = "BrainCtMainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "YOLO26 뇌 CT 출혈(hemorrhage) 세그";
            menuStripMain.ResumeLayout(false);
            menuStripMain.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)trackConf).EndInit();
            ((System.ComponentModel.ISupportInitialize)numConf).EndInit();
            panelInputViewport.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)picInput).EndInit();
            panelOutputViewport.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)picOutput).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }
    }
}
