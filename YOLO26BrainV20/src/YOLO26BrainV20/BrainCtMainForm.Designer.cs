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
        private ToolStripMenuItem menuDownloadSample;
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
        private Label lblLabels;
        private TextBox txtLabels;
        private Label lblConf;
        private TrackBar trackConf;
        private NumericUpDown numConf;
        private Button btnAnalyze;
        private Button btnSave;
        private Button btnSaveCsv;
        private ProgressBar progressInference;
        private Label lblStatus;
        private Label lblPreviewInTitle;
        private Label lblPreviewOutTitle;
        private Button btnResetInputZoom;
        private Button btnResetOutputZoom;
        private Panel panelInputViewport;
        private Panel panelOutputViewport;
        private PictureBox picInput;
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
            menuDownloadSample = new ToolStripMenuItem();
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
            lblLabels = new Label();
            txtLabels = new TextBox();
            lblConf = new Label();
            trackConf = new TrackBar();
            numConf = new NumericUpDown();
            btnAnalyze = new Button();
            btnSave = new Button();
            btnSaveCsv = new Button();
            progressInference = new ProgressBar();
            lblStatus = new Label();
            lblPreviewInTitle = new Label();
            lblPreviewOutTitle = new Label();
            btnResetInputZoom = new Button();
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
            menuStripMain.Size = new Size(1024, 24);
            menuStripMain.TabIndex = 0;
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
            menuSaveImage.Size = new Size(206, 22);
            menuSaveImage.Text = "결과 이미지 저장(&I)…";
            // 
            // menuSaveCsv
            // 
            menuSaveCsv.Enabled = false;
            menuSaveCsv.Name = "menuSaveCsv";
            menuSaveCsv.Size = new Size(206, 22);
            menuSaveCsv.Text = "검출 목록 CSV 저장(&C)…";
            // 
            // menuFileSep
            // 
            menuFileSep.Name = "menuFileSep";
            menuFileSep.Size = new Size(203, 6);
            // 
            // menuExit
            // 
            menuExit.Name = "menuExit";
            menuExit.Size = new Size(206, 22);
            menuExit.Text = "종료(&X)";
            // 
            // menuTools
            // 
            menuTools.DropDownItems.AddRange(new ToolStripItem[] { menuDownloadSample, menuConvertPt, menuRecommendedDefaults, menuToolsSep, menuOpenSampleFolder });
            menuTools.Name = "menuTools";
            menuTools.Size = new Size(57, 20);
            menuTools.Text = "도구(&T)";
            // 
            // menuDownloadSample
            // 
            menuDownloadSample.Name = "menuDownloadSample";
            menuDownloadSample.Size = new Size(233, 22);
            menuDownloadSample.Text = "뇌 CT 샘플 이미지 다운로드…";
            // 
            // menuConvertPt
            // 
            menuConvertPt.Name = "menuConvertPt";
            menuConvertPt.Size = new Size(233, 22);
            menuConvertPt.Text = "PyTorch(.pt)→ONNX 변환…";
            // 
            // menuRecommendedDefaults
            // 
            menuRecommendedDefaults.Name = "menuRecommendedDefaults";
            menuRecommendedDefaults.Size = new Size(233, 22);
            menuRecommendedDefaults.Text = "추천 기본값 적용(&R)";
            // 
            // menuToolsSep
            // 
            menuToolsSep.Name = "menuToolsSep";
            menuToolsSep.Size = new Size(230, 6);
            // 
            // menuOpenSampleFolder
            // 
            menuOpenSampleFolder.Name = "menuOpenSampleFolder";
            menuOpenSampleFolder.Size = new Size(233, 22);
            menuOpenSampleFolder.Text = "다운로드 폴더 열기";
            // 
            // lblOnnxTitle
            // 
            lblOnnxTitle.Location = new Point(12, 32);
            lblOnnxTitle.Name = "lblOnnxTitle";
            lblOnnxTitle.Size = new Size(120, 18);
            lblOnnxTitle.TabIndex = 1;
            lblOnnxTitle.Text = "ONNX 모델";
            // 
            // btnModel
            // 
            btnModel.Location = new Point(12, 52);
            btnModel.Name = "btnModel";
            btnModel.Size = new Size(118, 27);
            btnModel.TabIndex = 2;
            btnModel.Text = "모델 선택…";
            btnModel.UseVisualStyleBackColor = true;
            // 
            // lblOnnxPath
            // 
            lblOnnxPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lblOnnxPath.AutoEllipsis = true;
            lblOnnxPath.Location = new Point(140, 56);
            lblOnnxPath.Name = "lblOnnxPath";
            lblOnnxPath.Size = new Size(289, 22);
            lblOnnxPath.TabIndex = 3;
            lblOnnxPath.Text = "선택된 모델이 없습니다.";
            lblOnnxPath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // lblImageTitle
            // 
            lblImageTitle.Location = new Point(435, 32);
            lblImageTitle.Name = "lblImageTitle";
            lblImageTitle.Size = new Size(120, 18);
            lblImageTitle.TabIndex = 4;
            lblImageTitle.Text = "이미지";
            // 
            // btnImage
            // 
            btnImage.Location = new Point(435, 56);
            btnImage.Name = "btnImage";
            btnImage.Size = new Size(118, 27);
            btnImage.TabIndex = 5;
            btnImage.Text = "이미지 열기…";
            btnImage.UseVisualStyleBackColor = true;
            // 
            // lblSlicePath
            // 
            lblSlicePath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lblSlicePath.AutoEllipsis = true;
            lblSlicePath.Location = new Point(559, 60);
            lblSlicePath.Name = "lblSlicePath";
            lblSlicePath.Size = new Size(336, 22);
            lblSlicePath.TabIndex = 6;
            lblSlicePath.Text = "불러온 이미지가 없습니다.";
            lblSlicePath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // lblLabels
            // 
            lblLabels.Location = new Point(12, 88);
            lblLabels.Name = "lblLabels";
            lblLabels.Size = new Size(200, 18);
            lblLabels.TabIndex = 7;
            lblLabels.Text = "클래스 이름";
            lblLabels.Visible = false;
            // 
            // txtLabels
            // 
            txtLabels.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            txtLabels.Location = new Point(12, 108);
            txtLabels.Name = "txtLabels";
            txtLabels.PlaceholderText = "선택: 쉼표 구분 클래스 이름 (비우면 ONNX에서 class_0 …)";
            txtLabels.Size = new Size(1000, 23);
            txtLabels.TabIndex = 8;
            txtLabels.Text = "";
            txtLabels.Visible = false;
            // 
            // lblConf
            // 
            lblConf.Location = new Point(12, 88);
            lblConf.Name = "lblConf";
            lblConf.Size = new Size(72, 28);
            lblConf.TabIndex = 9;
            lblConf.Text = "최소 신뢰도";
            lblConf.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // trackConf
            // 
            trackConf.Location = new Point(86, 86);
            trackConf.Maximum = 100;
            trackConf.Minimum = 1;
            trackConf.Name = "trackConf";
            trackConf.Size = new Size(220, 45);
            trackConf.TabIndex = 10;
            trackConf.TickFrequency = 10;
            trackConf.Value = 25;
            // 
            // numConf
            // 
            numConf.DecimalPlaces = 2;
            numConf.Increment = new decimal(new int[] { 1, 0, 0, 131072 });
            numConf.Location = new Point(312, 90);
            numConf.Maximum = new decimal(new int[] { 1, 0, 0, 0 });
            numConf.Minimum = new decimal(new int[] { 1, 0, 0, 131072 });
            numConf.Name = "numConf";
            numConf.Size = new Size(58, 23);
            numConf.TabIndex = 11;
            numConf.Value = new decimal(new int[] { 25, 0, 0, 131072 });
            // 
            // btnAnalyze
            // 
            btnAnalyze.Location = new Point(378, 88);
            btnAnalyze.Name = "btnAnalyze";
            btnAnalyze.Size = new Size(96, 28);
            btnAnalyze.TabIndex = 12;
            btnAnalyze.Text = "검출 실행";
            btnAnalyze.UseVisualStyleBackColor = true;
            // 
            // btnSave
            // 
            btnSave.Enabled = false;
            btnSave.Location = new Point(480, 88);
            btnSave.Name = "btnSave";
            btnSave.Size = new Size(124, 28);
            btnSave.TabIndex = 13;
            btnSave.Text = "결과 이미지 저장…";
            btnSave.UseVisualStyleBackColor = true;
            // 
            // btnSaveCsv
            // 
            btnSaveCsv.Enabled = false;
            btnSaveCsv.Location = new Point(612, 88);
            btnSaveCsv.Name = "btnSaveCsv";
            btnSaveCsv.Size = new Size(124, 28);
            btnSaveCsv.TabIndex = 14;
            btnSaveCsv.Text = "검출 CSV 저장…";
            btnSaveCsv.UseVisualStyleBackColor = true;
            // 
            // progressInference
            // 
            progressInference.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            progressInference.Location = new Point(12, 135);
            progressInference.MarqueeAnimationSpeed = 35;
            progressInference.Name = "progressInference";
            progressInference.Size = new Size(1000, 14);
            progressInference.Style = ProgressBarStyle.Continuous;
            progressInference.TabIndex = 15;
            progressInference.Visible = true;
            // 
            // lblStatus
            // 
            lblStatus.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lblStatus.AutoEllipsis = true;
            lblStatus.Location = new Point(12, 161);
            lblStatus.Name = "lblStatus";
            lblStatus.Size = new Size(1000, 26);
            lblStatus.TabIndex = 16;
            lblStatus.Text = "준비됨 — 모델과 이미지를 선택한 뒤 [검출 실행]을 누르세요.";
            // 
            // lblPreviewInTitle
            // 
            lblPreviewInTitle.Location = new Point(12, 202);
            lblPreviewInTitle.Name = "lblPreviewInTitle";
            lblPreviewInTitle.Size = new Size(200, 18);
            lblPreviewInTitle.TabIndex = 17;
            lblPreviewInTitle.Text = "입력";
            // 
            // lblPreviewOutTitle
            // 
            lblPreviewOutTitle.Location = new Point(514, 201);
            lblPreviewOutTitle.Name = "lblPreviewOutTitle";
            lblPreviewOutTitle.Size = new Size(200, 18);
            lblPreviewOutTitle.TabIndex = 18;
            lblPreviewOutTitle.Text = "검출 결과";
            // 
            // btnResetInputZoom
            // 
            btnResetInputZoom.Location = new Point(432, 198);
            btnResetInputZoom.Name = "btnResetInputZoom";
            btnResetInputZoom.Size = new Size(76, 24);
            btnResetInputZoom.TabIndex = 19;
            btnResetInputZoom.Text = "원래 크기";
            btnResetInputZoom.UseVisualStyleBackColor = true;
            // 
            // btnResetOutputZoom
            // 
            btnResetOutputZoom.Location = new Point(936, 196);
            btnResetOutputZoom.Name = "btnResetOutputZoom";
            btnResetOutputZoom.Size = new Size(76, 24);
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
            panelInputViewport.Location = new Point(12, 228);
            panelInputViewport.Name = "panelInputViewport";
            panelInputViewport.Size = new Size(496, 392);
            panelInputViewport.TabIndex = 21;
            // 
            // picInput
            // 
            picInput.BackColor = Color.FromArgb(32, 32, 36);
            picInput.Location = new Point(0, 0);
            picInput.Name = "picInput";
            picInput.Size = new Size(496, 392);
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
            panelOutputViewport.Location = new Point(516, 226);
            panelOutputViewport.Name = "panelOutputViewport";
            panelOutputViewport.Size = new Size(496, 392);
            panelOutputViewport.TabIndex = 22;
            // 
            // picOutput
            // 
            picOutput.BackColor = Color.FromArgb(32, 32, 36);
            picOutput.Location = new Point(0, 0);
            picOutput.Name = "picOutput";
            picOutput.Size = new Size(496, 392);
            picOutput.SizeMode = PictureBoxSizeMode.Zoom;
            picOutput.TabIndex = 24;
            picOutput.TabStop = false;
            // 
            // listDetections
            // 
            listDetections.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            listDetections.FullRowSelect = true;
            listDetections.GridLines = true;
            listDetections.Location = new Point(12, 629);
            listDetections.MultiSelect = false;
            listDetections.Name = "listDetections";
            listDetections.Size = new Size(1000, 100);
            listDetections.TabIndex = 25;
            listDetections.UseCompatibleStateImageBehavior = false;
            listDetections.View = View.Details;
            // 
            // BrainCtMainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1024, 741);
            Controls.Add(menuStripMain);
            Controls.Add(lblOnnxTitle);
            Controls.Add(btnModel);
            Controls.Add(lblOnnxPath);
            Controls.Add(lblImageTitle);
            Controls.Add(btnImage);
            Controls.Add(lblSlicePath);
            Controls.Add(lblLabels);
            Controls.Add(txtLabels);
            Controls.Add(lblConf);
            Controls.Add(trackConf);
            Controls.Add(numConf);
            Controls.Add(btnAnalyze);
            Controls.Add(btnSave);
            Controls.Add(btnSaveCsv);
            Controls.Add(progressInference);
            Controls.Add(lblStatus);
            Controls.Add(lblPreviewInTitle);
            Controls.Add(lblPreviewOutTitle);
            Controls.Add(btnResetInputZoom);
            Controls.Add(btnResetOutputZoom);
            Controls.Add(panelInputViewport);
            Controls.Add(panelOutputViewport);
            Controls.Add(listDetections);
            Font = new Font("맑은 고딕", 9F);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = menuStripMain;
            MinimumSize = new Size(640, 520);
            Name = "BrainCtMainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "YOLO26 뇌 CT 병변 검출";
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
