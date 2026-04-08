namespace YOLO26SegmentationV10
{
    partial class YOLO26SegmenationV10
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

        #region Windows Form 디자이너에서 생성한 코드

        private void InitializeComponent()
        {
            this.comboModel = new System.Windows.Forms.ComboBox();
            this.btnPrepareModel = new System.Windows.Forms.Button();
            this.lblStatus = new System.Windows.Forms.Label();
            this.lblFilter = new System.Windows.Forms.Label();
            this.txtClassFilter = new System.Windows.Forms.TextBox();
            this.lblConf = new System.Windows.Forms.Label();
            this.numConf = new System.Windows.Forms.NumericUpDown();
            this.btnImage = new System.Windows.Forms.Button();
            this.btnVideo = new System.Windows.Forms.Button();
            this.lblVideoControls = new System.Windows.Forms.Label();
            this.btnVideoPause = new System.Windows.Forms.Button();
            this.btnVideoResume = new System.Windows.Forms.Button();
            this.btnStopVideo = new System.Windows.Forms.Button();
            this.splitMain = new System.Windows.Forms.SplitContainer();
            this.picInput = new System.Windows.Forms.PictureBox();
            this.picOutput = new System.Windows.Forms.PictureBox();
            this.txtLog = new System.Windows.Forms.TextBox();
            ((System.ComponentModel.ISupportInitialize)(this.numConf)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.splitMain)).BeginInit();
            this.splitMain.Panel1.SuspendLayout();
            this.splitMain.Panel2.SuspendLayout();
            this.splitMain.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.picInput)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.picOutput)).BeginInit();
            this.SuspendLayout();
            // 
            // comboModel
            // 
            this.comboModel.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.comboModel.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.comboModel.FormattingEnabled = true;
            this.comboModel.Location = new System.Drawing.Point(12, 12);
            this.comboModel.Name = "comboModel";
            this.comboModel.Size = new System.Drawing.Size(896, 20);
            this.comboModel.TabIndex = 0;
            // 
            // btnPrepareModel
            // 
            this.btnPrepareModel.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnPrepareModel.Location = new System.Drawing.Point(924, 10);
            this.btnPrepareModel.Name = "btnPrepareModel";
            this.btnPrepareModel.Size = new System.Drawing.Size(200, 24);
            this.btnPrepareModel.TabIndex = 1;
            this.btnPrepareModel.Text = "모델 준비 (.pt 다운로드 → ONNX)";
            this.btnPrepareModel.UseVisualStyleBackColor = true;
            this.btnPrepareModel.Click += new System.EventHandler(this.btnPrepareModel_Click);
            // 
            // lblStatus
            // 
            this.lblStatus.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblStatus.Location = new System.Drawing.Point(12, 40);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new System.Drawing.Size(1112, 22);
            this.lblStatus.TabIndex = 2;
            this.lblStatus.Text = "상태: 모델을 준비하거나 ONNX 경로를 확인하세요.";
            this.lblStatus.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // lblFilter
            // 
            this.lblFilter.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblFilter.Location = new System.Drawing.Point(12, 98);
            this.lblFilter.Name = "lblFilter";
            this.lblFilter.Size = new System.Drawing.Size(1112, 14);
            this.lblFilter.TabIndex = 5;
            this.lblFilter.Text = "세그멘테이션할 클래스 (비우면 전체 · 쉼표로 구분, 예: person, car 또는 0, 2)";
            // 
            // txtClassFilter
            // 
            this.txtClassFilter.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtClassFilter.Location = new System.Drawing.Point(12, 116);
            this.txtClassFilter.Name = "txtClassFilter";
            this.txtClassFilter.Size = new System.Drawing.Size(1112, 21);
            this.txtClassFilter.TabIndex = 6;
            // 
            // lblConf
            // 
            this.lblConf.AutoSize = true;
            this.lblConf.Location = new System.Drawing.Point(12, 70);
            this.lblConf.Name = "lblConf";
            this.lblConf.Size = new System.Drawing.Size(41, 12);
            this.lblConf.TabIndex = 3;
            this.lblConf.Text = "신뢰도";
            // 
            // numConf
            // 
            this.numConf.DecimalPlaces = 2;
            this.numConf.Increment = new decimal(new int[] {
            5,
            0,
            0,
            131072});
            this.numConf.Location = new System.Drawing.Point(59, 66);
            this.numConf.Maximum = new decimal(new int[] {
            1,
            0,
            0,
            0});
            this.numConf.Name = "numConf";
            this.numConf.Size = new System.Drawing.Size(55, 21);
            this.numConf.TabIndex = 4;
            this.numConf.Value = new decimal(new int[] {
            50,
            0,
            0,
            131072});
            // 
            // btnImage
            // 
            this.btnImage.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnImage.Location = new System.Drawing.Point(974, 64);
            this.btnImage.Name = "btnImage";
            this.btnImage.Size = new System.Drawing.Size(86, 24);
            this.btnImage.TabIndex = 7;
            this.btnImage.Text = "이미지";
            this.btnImage.UseVisualStyleBackColor = true;
            this.btnImage.Click += new System.EventHandler(this.btnImage_Click);
            // 
            // btnVideo
            // 
            this.btnVideo.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnVideo.Location = new System.Drawing.Point(886, 64);
            this.btnVideo.Name = "btnVideo";
            this.btnVideo.Size = new System.Drawing.Size(86, 24);
            this.btnVideo.TabIndex = 8;
            this.btnVideo.Text = "동영상";
            this.btnVideo.UseVisualStyleBackColor = true;
            this.btnVideo.Click += new System.EventHandler(this.btnVideo_Click);
            // 
            // lblVideoControls
            // 
            this.lblVideoControls.AutoSize = true;
            this.lblVideoControls.Location = new System.Drawing.Point(12, 154);
            this.lblVideoControls.Name = "lblVideoControls";
            this.lblVideoControls.Size = new System.Drawing.Size(73, 12);
            this.lblVideoControls.TabIndex = 9;
            this.lblVideoControls.Text = "동영상 재생:";
            // 
            // btnVideoPause
            // 
            this.btnVideoPause.Enabled = false;
            this.btnVideoPause.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnVideoPause.Location = new System.Drawing.Point(91, 143);
            this.btnVideoPause.Name = "btnVideoPause";
            this.btnVideoPause.Size = new System.Drawing.Size(36, 32);
            this.btnVideoPause.TabIndex = 10;
            this.btnVideoPause.UseVisualStyleBackColor = true;
            this.btnVideoPause.Click += new System.EventHandler(this.btnVideoPause_Click);
            // 
            // btnVideoResume
            // 
            this.btnVideoResume.Enabled = false;
            this.btnVideoResume.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnVideoResume.Location = new System.Drawing.Point(133, 143);
            this.btnVideoResume.Name = "btnVideoResume";
            this.btnVideoResume.Size = new System.Drawing.Size(40, 32);
            this.btnVideoResume.TabIndex = 11;
            this.btnVideoResume.UseVisualStyleBackColor = true;
            this.btnVideoResume.Click += new System.EventHandler(this.btnVideoResume_Click);
            // 
            // btnStopVideo
            // 
            this.btnStopVideo.Enabled = false;
            this.btnStopVideo.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnStopVideo.Location = new System.Drawing.Point(178, 143);
            this.btnStopVideo.Name = "btnStopVideo";
            this.btnStopVideo.Size = new System.Drawing.Size(38, 32);
            this.btnStopVideo.TabIndex = 12;
            this.btnStopVideo.UseVisualStyleBackColor = true;
            this.btnStopVideo.Click += new System.EventHandler(this.btnStopVideo_Click);
            // 
            // splitMain
            // 
            this.splitMain.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.splitMain.Location = new System.Drawing.Point(12, 198);
            this.splitMain.Name = "splitMain";
            // 
            // splitMain.Panel1
            // 
            this.splitMain.Panel1.Controls.Add(this.picInput);
            // 
            // splitMain.Panel2
            // 
            this.splitMain.Panel2.Controls.Add(this.picOutput);
            this.splitMain.Size = new System.Drawing.Size(1112, 391);
            this.splitMain.SplitterDistance = 554;
            this.splitMain.TabIndex = 13;
            // 
            // picInput
            // 
            this.picInput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.picInput.Location = new System.Drawing.Point(0, 0);
            this.picInput.Name = "picInput";
            this.picInput.Size = new System.Drawing.Size(554, 391);
            this.picInput.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            this.picInput.TabIndex = 0;
            this.picInput.TabStop = false;
            // 
            // picOutput
            // 
            this.picOutput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.picOutput.Location = new System.Drawing.Point(0, 0);
            this.picOutput.Name = "picOutput";
            this.picOutput.Size = new System.Drawing.Size(554, 391);
            this.picOutput.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            this.picOutput.TabIndex = 0;
            this.picOutput.TabStop = false;
            // 
            // txtLog
            // 
            this.txtLog.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtLog.Location = new System.Drawing.Point(12, 595);
            this.txtLog.Multiline = true;
            this.txtLog.Name = "txtLog";
            this.txtLog.ReadOnly = true;
            this.txtLog.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
            this.txtLog.Size = new System.Drawing.Size(1112, 90);
            this.txtLog.TabIndex = 14;
            // 
            // YOLO26SegmenationV10
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1136, 697);
            this.Controls.Add(this.txtLog);
            this.Controls.Add(this.splitMain);
            this.Controls.Add(this.btnStopVideo);
            this.Controls.Add(this.btnVideoResume);
            this.Controls.Add(this.btnVideoPause);
            this.Controls.Add(this.lblVideoControls);
            this.Controls.Add(this.btnVideo);
            this.Controls.Add(this.btnImage);
            this.Controls.Add(this.numConf);
            this.Controls.Add(this.lblConf);
            this.Controls.Add(this.txtClassFilter);
            this.Controls.Add(this.lblFilter);
            this.Controls.Add(this.lblStatus);
            this.Controls.Add(this.btnPrepareModel);
            this.Controls.Add(this.comboModel);
            this.MinimumSize = new System.Drawing.Size(900, 500);
            this.Name = "YOLO26SegmenationV10";
            this.Text = "YOLO26 Segmentation (ONNX)";
            this.Shown += new System.EventHandler(this.YOLO26SegmenationV10_Shown);
            ((System.ComponentModel.ISupportInitialize)(this.numConf)).EndInit();
            this.splitMain.Panel1.ResumeLayout(false);
            this.splitMain.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitMain)).EndInit();
            this.splitMain.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.picInput)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.picOutput)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.ComboBox comboModel;
        private System.Windows.Forms.Button btnPrepareModel;
        private System.Windows.Forms.Label lblStatus;
        private System.Windows.Forms.Label lblFilter;
        private System.Windows.Forms.TextBox txtClassFilter;
        private System.Windows.Forms.Label lblConf;
        private System.Windows.Forms.NumericUpDown numConf;
        private System.Windows.Forms.Button btnImage;
        private System.Windows.Forms.Button btnVideo;
        private System.Windows.Forms.Label lblVideoControls;
        private System.Windows.Forms.Button btnVideoPause;
        private System.Windows.Forms.Button btnVideoResume;
        private System.Windows.Forms.Button btnStopVideo;
        private System.Windows.Forms.SplitContainer splitMain;
        private System.Windows.Forms.PictureBox picInput;
        private System.Windows.Forms.PictureBox picOutput;
        private System.Windows.Forms.TextBox txtLog;
    }
}
