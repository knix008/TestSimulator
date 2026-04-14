namespace YOLO26BrainV10
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
        private NumericUpDown numConf;
        private Button btnAnalyze;
        private Button btnSave;
        private Button btnSaveCsv;
        private Label lblStatus;
        private Label lblPreviewInTitle;
        private Label lblPreviewOutTitle;
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
            menuStripMain = new MenuStrip();
            menuFile = new ToolStripMenuItem();
            menuSaveImage = new ToolStripMenuItem();
            menuSaveCsv = new ToolStripMenuItem();
            menuFileSep = new ToolStripSeparator();
            menuExit = new ToolStripMenuItem();
            menuTools = new ToolStripMenuItem();
            menuDownloadSample = new ToolStripMenuItem();
            menuConvertPt = new ToolStripMenuItem();
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
            numConf = new NumericUpDown();
            btnAnalyze = new Button();
            btnSave = new Button();
            btnSaveCsv = new Button();
            lblStatus = new Label();
            lblPreviewInTitle = new Label();
            lblPreviewOutTitle = new Label();
            picInput = new PictureBox();
            picOutput = new PictureBox();
            listDetections = new ListView();
            menuStripMain.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)numConf).BeginInit();
            ((System.ComponentModel.ISupportInitialize)picInput).BeginInit();
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
            menuTools.DropDownItems.AddRange(new ToolStripItem[] { menuDownloadSample, menuConvertPt, menuToolsSep, menuOpenSampleFolder });
            menuTools.Name = "menuTools";
            menuTools.Size = new Size(57, 20);
            menuTools.Text = "도구(&T)";
            // 
            // menuDownloadSample
            // 
            menuDownloadSample.Name = "menuDownloadSample";
            menuDownloadSample.Size = new Size(266, 22);
            menuDownloadSample.Text = "뇌 CT 샘플 이미지 다운로드…";
            // 
            // menuConvertPt
            // 
            menuConvertPt.Name = "menuConvertPt";
            menuConvertPt.Size = new Size(266, 22);
            menuConvertPt.Text = "PyTorch(.pt)→ONNX 변환…";
            // 
            // menuToolsSep
            // 
            menuToolsSep.Name = "menuToolsSep";
            menuToolsSep.Size = new Size(263, 6);
            // 
            // menuOpenSampleFolder
            // 
            menuOpenSampleFolder.Name = "menuOpenSampleFolder";
            menuOpenSampleFolder.Size = new Size(266, 22);
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
            // 
            // txtLabels
            // 
            txtLabels.Location = new Point(12, 108);
            txtLabels.Name = "txtLabels";
            txtLabels.PlaceholderText = "쉼표로 구분 (학습 데이터와 동일한 순서)";
            txtLabels.Size = new Size(1000, 23);
            txtLabels.TabIndex = 8;
            txtLabels.Text = "negative,positive";
            // 
            // lblConf
            // 
            lblConf.Location = new Point(12, 142);
            lblConf.Name = "lblConf";
            lblConf.Size = new Size(120, 18);
            lblConf.TabIndex = 9;
            lblConf.Text = "최소 신뢰도";
            // 
            // numConf
            // 
            numConf.DecimalPlaces = 2;
            numConf.Increment = new decimal(new int[] { 5, 0, 0, 131072 });
            numConf.Location = new Point(96, 140);
            numConf.Maximum = new decimal(new int[] { 1, 0, 0, 0 });
            numConf.Minimum = new decimal(new int[] { 1, 0, 0, 131072 });
            numConf.Name = "numConf";
            numConf.Size = new Size(56, 23);
            numConf.TabIndex = 10;
            numConf.Value = new decimal(new int[] { 25, 0, 0, 131072 });
            // 
            // btnAnalyze
            // 
            btnAnalyze.Location = new Point(172, 138);
            btnAnalyze.Name = "btnAnalyze";
            btnAnalyze.Size = new Size(96, 28);
            btnAnalyze.TabIndex = 11;
            btnAnalyze.Text = "검출 실행";
            btnAnalyze.UseVisualStyleBackColor = true;
            // 
            // btnSave
            // 
            btnSave.Enabled = false;
            btnSave.Location = new Point(278, 138);
            btnSave.Name = "btnSave";
            btnSave.Size = new Size(124, 28);
            btnSave.TabIndex = 12;
            btnSave.Text = "결과 이미지 저장…";
            btnSave.UseVisualStyleBackColor = true;
            // 
            // btnSaveCsv
            // 
            btnSaveCsv.Enabled = false;
            btnSaveCsv.Location = new Point(412, 138);
            btnSaveCsv.Name = "btnSaveCsv";
            btnSaveCsv.Size = new Size(124, 28);
            btnSaveCsv.TabIndex = 13;
            btnSaveCsv.Text = "검출 CSV 저장…";
            btnSaveCsv.UseVisualStyleBackColor = true;
            // 
            // lblStatus
            // 
            lblStatus.AutoEllipsis = true;
            lblStatus.Location = new Point(12, 184);
            lblStatus.Name = "lblStatus";
            lblStatus.Size = new Size(1000, 71);
            lblStatus.TabIndex = 14;
            lblStatus.Text = "준비됨 — 모델과 이미지를 선택한 뒤 [검출 실행]을 누르세요.";
            // 
            // lblPreviewInTitle
            // 
            lblPreviewInTitle.Location = new Point(12, 214);
            lblPreviewInTitle.Name = "lblPreviewInTitle";
            lblPreviewInTitle.Size = new Size(200, 18);
            lblPreviewInTitle.TabIndex = 15;
            lblPreviewInTitle.Text = "입력";
            // 
            // lblPreviewOutTitle
            // 
            lblPreviewOutTitle.Location = new Point(524, 214);
            lblPreviewOutTitle.Name = "lblPreviewOutTitle";
            lblPreviewOutTitle.Size = new Size(200, 18);
            lblPreviewOutTitle.TabIndex = 16;
            lblPreviewOutTitle.Text = "검출 결과";
            // 
            // picInput
            // 
            picInput.BackColor = Color.FromArgb(32, 32, 36);
            picInput.BorderStyle = BorderStyle.Fixed3D;
            picInput.Location = new Point(12, 236);
            picInput.Name = "picInput";
            picInput.Size = new Size(496, 392);
            picInput.SizeMode = PictureBoxSizeMode.Zoom;
            picInput.TabIndex = 17;
            picInput.TabStop = false;
            // 
            // picOutput
            // 
            picOutput.BackColor = Color.FromArgb(32, 32, 36);
            picOutput.BorderStyle = BorderStyle.Fixed3D;
            picOutput.Location = new Point(516, 236);
            picOutput.Name = "picOutput";
            picOutput.Size = new Size(496, 392);
            picOutput.SizeMode = PictureBoxSizeMode.Zoom;
            picOutput.TabIndex = 18;
            picOutput.TabStop = false;
            // 
            // listDetections
            // 
            listDetections.FullRowSelect = true;
            listDetections.GridLines = true;
            listDetections.Location = new Point(12, 634);
            listDetections.MultiSelect = false;
            listDetections.Name = "listDetections";
            listDetections.Size = new Size(1000, 86);
            listDetections.TabIndex = 19;
            listDetections.UseCompatibleStateImageBehavior = false;
            listDetections.View = View.Details;
            // 
            // BrainCtMainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1024, 729);
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
            Controls.Add(numConf);
            Controls.Add(btnAnalyze);
            Controls.Add(btnSave);
            Controls.Add(btnSaveCsv);
            Controls.Add(lblStatus);
            Controls.Add(lblPreviewInTitle);
            Controls.Add(lblPreviewOutTitle);
            Controls.Add(picInput);
            Controls.Add(picOutput);
            Controls.Add(listDetections);
            Font = new Font("맑은 고딕", 9F);
            MainMenuStrip = menuStripMain;
            MinimumSize = new Size(640, 520);
            Name = "BrainCtMainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "YOLO26 뇌 CT 병변 검출";
            menuStripMain.ResumeLayout(false);
            menuStripMain.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)numConf).EndInit();
            ((System.ComponentModel.ISupportInitialize)picInput).EndInit();
            ((System.ComponentModel.ISupportInitialize)picOutput).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }
    }
}
