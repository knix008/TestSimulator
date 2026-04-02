namespace Yolo26Detection1._0
{
    partial class MainForm
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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            this.txtOnnxPath = new System.Windows.Forms.TextBox();
            this.btnBrowseOnnx = new System.Windows.Forms.Button();
            this.btnLoadModel = new System.Windows.Forms.Button();
            this.btnDownloadModel = new System.Windows.Forms.Button();
            this.lblOnnx = new System.Windows.Forms.Label();
            this.lblConf = new System.Windows.Forms.Label();
            this.numConf = new System.Windows.Forms.NumericUpDown();
            this.btnImage = new System.Windows.Forms.Button();
            this.btnVideo = new System.Windows.Forms.Button();
            this.btnPlayOutput = new System.Windows.Forms.Button();
            this.btnSaveImageResult = new System.Windows.Forms.Button();
            this.lblZoom = new System.Windows.Forms.Label();
            this.trackBarZoom = new System.Windows.Forms.TrackBar();
            this.lblZoomPct = new System.Windows.Forms.Label();
            this.panelImageHost = new System.Windows.Forms.Panel();
            this.pictureBox = new System.Windows.Forms.PictureBox();
            this.lblMediaInfo = new System.Windows.Forms.Label();
            this.trackPlayback = new System.Windows.Forms.TrackBar();
            this.lblPlaybackPos = new System.Windows.Forms.Label();
            this.btnPlaybackPause = new System.Windows.Forms.Button();
            this.btnPlaybackResume = new System.Windows.Forms.Button();
            this.btnPlaybackStop = new System.Windows.Forms.Button();
            this.progressBarMain = new System.Windows.Forms.ProgressBar();
            this.lblStatus = new System.Windows.Forms.Label();
            ((System.ComponentModel.ISupportInitialize)(this.numConf)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.trackBarZoom)).BeginInit();
            this.panelImageHost.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.pictureBox)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.trackPlayback)).BeginInit();
            this.SuspendLayout();
            // 
            // txtOnnxPath
            // 
            this.txtOnnxPath.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtOnnxPath.Location = new System.Drawing.Point(90, 12);
            this.txtOnnxPath.Name = "txtOnnxPath";
            this.txtOnnxPath.Size = new System.Drawing.Size(743, 21);
            this.txtOnnxPath.TabIndex = 1;
            this.txtOnnxPath.TextChanged += new System.EventHandler(this.TxtOnnxPath_TextChanged);
            // 
            // btnBrowseOnnx
            // 
            this.btnBrowseOnnx.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnBrowseOnnx.Location = new System.Drawing.Point(839, 10);
            this.btnBrowseOnnx.Name = "btnBrowseOnnx";
            this.btnBrowseOnnx.Size = new System.Drawing.Size(75, 23);
            this.btnBrowseOnnx.TabIndex = 2;
            this.btnBrowseOnnx.Text = "찾기...";
            this.btnBrowseOnnx.UseVisualStyleBackColor = true;
            this.btnBrowseOnnx.Click += new System.EventHandler(this.BtnBrowseOnnx_Click);
            // 
            // btnLoadModel
            // 
            this.btnLoadModel.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnLoadModel.Location = new System.Drawing.Point(920, 10);
            this.btnLoadModel.Name = "btnLoadModel";
            this.btnLoadModel.Size = new System.Drawing.Size(95, 23);
            this.btnLoadModel.TabIndex = 9;
            this.btnLoadModel.Text = "모델 로드";
            this.btnLoadModel.UseVisualStyleBackColor = true;
            this.btnLoadModel.Click += new System.EventHandler(this.BtnLoadModel_Click);
            // 
            // btnDownloadModel
            // 
            this.btnDownloadModel.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnDownloadModel.Location = new System.Drawing.Point(920, 42);
            this.btnDownloadModel.Name = "btnDownloadModel";
            this.btnDownloadModel.Size = new System.Drawing.Size(95, 25);
            this.btnDownloadModel.TabIndex = 21;
            this.btnDownloadModel.Text = "모델 다운로드";
            this.btnDownloadModel.UseVisualStyleBackColor = true;
            this.btnDownloadModel.Click += new System.EventHandler(this.BtnDownloadModel_Click);
            // 
            // lblOnnx
            // 
            this.lblOnnx.AutoSize = true;
            this.lblOnnx.Location = new System.Drawing.Point(12, 15);
            this.lblOnnx.Name = "lblOnnx";
            this.lblOnnx.Size = new System.Drawing.Size(68, 12);
            this.lblOnnx.TabIndex = 0;
            this.lblOnnx.Text = "ONNX 경로";
            // 
            // lblConf
            // 
            this.lblConf.AutoSize = true;
            this.lblConf.Location = new System.Drawing.Point(12, 46);
            this.lblConf.Name = "lblConf";
            this.lblConf.Size = new System.Drawing.Size(69, 12);
            this.lblConf.TabIndex = 3;
            this.lblConf.Text = "신뢰도 임계";
            // 
            // numConf
            // 
            this.numConf.DecimalPlaces = 2;
            this.numConf.Increment = new decimal(new int[] {
            5,
            0,
            0,
            131072});
            this.numConf.Location = new System.Drawing.Point(90, 44);
            this.numConf.Maximum = new decimal(new int[] {
            1,
            0,
            0,
            0});
            this.numConf.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            131072});
            this.numConf.Name = "numConf";
            this.numConf.Size = new System.Drawing.Size(80, 21);
            this.numConf.TabIndex = 4;
            this.numConf.Value = new decimal(new int[] {
            50,
            0,
            0,
            131072});
            // 
            // btnImage
            // 
            this.btnImage.Location = new System.Drawing.Point(200, 42);
            this.btnImage.Name = "btnImage";
            this.btnImage.Size = new System.Drawing.Size(120, 25);
            this.btnImage.TabIndex = 5;
            this.btnImage.Text = "이미지 검출";
            this.btnImage.UseVisualStyleBackColor = true;
            this.btnImage.Click += new System.EventHandler(this.BtnImage_Click);
            // 
            // btnVideo
            // 
            this.btnVideo.Location = new System.Drawing.Point(326, 42);
            this.btnVideo.Name = "btnVideo";
            this.btnVideo.Size = new System.Drawing.Size(110, 25);
            this.btnVideo.TabIndex = 6;
            this.btnVideo.Text = "동영상 검출...";
            this.btnVideo.UseVisualStyleBackColor = true;
            this.btnVideo.Click += new System.EventHandler(this.BtnVideo_Click);
            // 
            // btnPlayOutput
            // 
            this.btnPlayOutput.Location = new System.Drawing.Point(442, 42);
            this.btnPlayOutput.Name = "btnPlayOutput";
            this.btnPlayOutput.Size = new System.Drawing.Size(115, 25);
            this.btnPlayOutput.TabIndex = 7;
            this.btnPlayOutput.Text = "결과 동영상 열기";
            this.btnPlayOutput.UseVisualStyleBackColor = true;
            this.btnPlayOutput.Click += new System.EventHandler(this.BtnPlayOutput_Click);
            // 
            // btnSaveImageResult
            // 
            this.btnSaveImageResult.Enabled = false;
            this.btnSaveImageResult.Location = new System.Drawing.Point(578, 42);
            this.btnSaveImageResult.Name = "btnSaveImageResult";
            this.btnSaveImageResult.Size = new System.Drawing.Size(120, 25);
            this.btnSaveImageResult.TabIndex = 8;
            this.btnSaveImageResult.Text = "검출 결과 저장";
            this.btnSaveImageResult.UseVisualStyleBackColor = true;
            this.btnSaveImageResult.Click += new System.EventHandler(this.BtnSaveImageResult_Click);
            // 
            // lblZoom
            // 
            this.lblZoom.AutoSize = true;
            this.lblZoom.Location = new System.Drawing.Point(12, 78);
            this.lblZoom.Name = "lblZoom";
            this.lblZoom.Size = new System.Drawing.Size(85, 12);
            this.lblZoom.TabIndex = 10;
            this.lblZoom.Text = "결과 화면 배율";
            // 
            // trackBarZoom
            // 
            this.trackBarZoom.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.trackBarZoom.Location = new System.Drawing.Point(99, 72);
            this.trackBarZoom.Maximum = 400;
            this.trackBarZoom.Minimum = 25;
            this.trackBarZoom.Name = "trackBarZoom";
            this.trackBarZoom.Size = new System.Drawing.Size(825, 45);
            this.trackBarZoom.TabIndex = 11;
            this.trackBarZoom.TickFrequency = 25;
            this.trackBarZoom.Value = 100;
            this.trackBarZoom.ValueChanged += new System.EventHandler(this.TrackBarZoom_ValueChanged);
            // 
            // lblZoomPct
            // 
            this.lblZoomPct.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.lblZoomPct.AutoSize = true;
            this.lblZoomPct.Location = new System.Drawing.Point(930, 78);
            this.lblZoomPct.Name = "lblZoomPct";
            this.lblZoomPct.Size = new System.Drawing.Size(33, 12);
            this.lblZoomPct.TabIndex = 12;
            this.lblZoomPct.Text = "100%";
            // 
            // panelImageHost
            // 
            this.panelImageHost.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.panelImageHost.AutoScroll = true;
            this.panelImageHost.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(48)))), ((int)(((byte)(48)))), ((int)(((byte)(48)))));
            this.panelImageHost.BorderStyle = System.Windows.Forms.BorderStyle.Fixed3D;
            this.panelImageHost.Controls.Add(this.pictureBox);
            this.panelImageHost.Location = new System.Drawing.Point(12, 118);
            this.panelImageHost.Name = "panelImageHost";
            this.panelImageHost.Size = new System.Drawing.Size(765, 448);
            this.panelImageHost.TabIndex = 13;
            // 
            // pictureBox
            // 
            this.pictureBox.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.pictureBox.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.pictureBox.Location = new System.Drawing.Point(0, 0);
            this.pictureBox.Name = "pictureBox";
            this.pictureBox.Size = new System.Drawing.Size(320, 240);
            this.pictureBox.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
            this.pictureBox.TabIndex = 0;
            this.pictureBox.TabStop = false;
            // 
            // lblMediaInfo
            // 
            this.lblMediaInfo.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblMediaInfo.Location = new System.Drawing.Point(783, 118);
            this.lblMediaInfo.Name = "lblMediaInfo";
            this.lblMediaInfo.Size = new System.Drawing.Size(234, 448);
            this.lblMediaInfo.TabIndex = 15;
            this.lblMediaInfo.Text = "미디어 없음";
            // 
            // trackPlayback
            // 
            this.trackPlayback.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.trackPlayback.Enabled = false;
            this.trackPlayback.Location = new System.Drawing.Point(12, 572);
            this.trackPlayback.Maximum = 1000;
            this.trackPlayback.Name = "trackPlayback";
            this.trackPlayback.Size = new System.Drawing.Size(765, 45);
            this.trackPlayback.TabIndex = 16;
            this.trackPlayback.TickStyle = System.Windows.Forms.TickStyle.None;
            // 
            // lblPlaybackPos
            // 
            this.lblPlaybackPos.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.lblPlaybackPos.Location = new System.Drawing.Point(783, 580);
            this.lblPlaybackPos.Name = "lblPlaybackPos";
            this.lblPlaybackPos.Size = new System.Drawing.Size(118, 23);
            this.lblPlaybackPos.TabIndex = 17;
            this.lblPlaybackPos.Text = "00:00 / 00:00";
            this.lblPlaybackPos.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
            // 
            // btnPlaybackPause
            // 
            this.btnPlaybackPause.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.btnPlaybackPause.Enabled = false;
            this.btnPlaybackPause.Location = new System.Drawing.Point(907, 576);
            this.btnPlaybackPause.Name = "btnPlaybackPause";
            this.btnPlaybackPause.Size = new System.Drawing.Size(34, 23);
            this.btnPlaybackPause.TabIndex = 18;
            this.btnPlaybackPause.Text = "⏸";
            this.btnPlaybackPause.UseVisualStyleBackColor = true;
            this.btnPlaybackPause.Click += new System.EventHandler(this.BtnPlaybackPause_Click);
            // 
            // btnPlaybackResume
            // 
            this.btnPlaybackResume.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.btnPlaybackResume.Enabled = false;
            this.btnPlaybackResume.Location = new System.Drawing.Point(947, 576);
            this.btnPlaybackResume.Name = "btnPlaybackResume";
            this.btnPlaybackResume.Size = new System.Drawing.Size(34, 23);
            this.btnPlaybackResume.TabIndex = 19;
            this.btnPlaybackResume.Text = "▶";
            this.btnPlaybackResume.UseVisualStyleBackColor = true;
            this.btnPlaybackResume.Click += new System.EventHandler(this.BtnPlaybackResume_Click);
            // 
            // btnPlaybackStop
            // 
            this.btnPlaybackStop.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.btnPlaybackStop.Enabled = false;
            this.btnPlaybackStop.Location = new System.Drawing.Point(987, 576);
            this.btnPlaybackStop.Name = "btnPlaybackStop";
            this.btnPlaybackStop.Size = new System.Drawing.Size(30, 23);
            this.btnPlaybackStop.TabIndex = 20;
            this.btnPlaybackStop.Text = "■";
            this.btnPlaybackStop.UseVisualStyleBackColor = true;
            this.btnPlaybackStop.Click += new System.EventHandler(this.BtnPlaybackStop_Click);
            // 
            // progressBarMain
            // 
            this.progressBarMain.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.progressBarMain.Location = new System.Drawing.Point(12, 623);
            this.progressBarMain.Name = "progressBarMain";
            this.progressBarMain.Size = new System.Drawing.Size(1005, 20);
            this.progressBarMain.Style = System.Windows.Forms.ProgressBarStyle.Continuous;
            this.progressBarMain.TabIndex = 14;
            this.progressBarMain.Visible = false;
            // 
            // lblStatus
            // 
            this.lblStatus.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblStatus.Location = new System.Drawing.Point(12, 649);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new System.Drawing.Size(1005, 22);
            this.lblStatus.TabIndex = 8;
            this.lblStatus.Text = "ONNX 경로를 지정한 뒤 「모델 로드」를 누르세요.";
            // 
            // MainForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1029, 682);
            this.Controls.Add(this.panelImageHost);
            this.Controls.Add(this.lblMediaInfo);
            this.Controls.Add(this.trackPlayback);
            this.Controls.Add(this.lblPlaybackPos);
            this.Controls.Add(this.btnPlaybackPause);
            this.Controls.Add(this.btnPlaybackResume);
            this.Controls.Add(this.btnPlaybackStop);
            this.Controls.Add(this.lblZoomPct);
            this.Controls.Add(this.trackBarZoom);
            this.Controls.Add(this.lblZoom);
            this.Controls.Add(this.lblStatus);
            this.Controls.Add(this.progressBarMain);
            this.Controls.Add(this.btnVideo);
            this.Controls.Add(this.btnImage);
            this.Controls.Add(this.btnPlayOutput);
            this.Controls.Add(this.btnSaveImageResult);
            this.Controls.Add(this.numConf);
            this.Controls.Add(this.lblConf);
            this.Controls.Add(this.btnBrowseOnnx);
            this.Controls.Add(this.txtOnnxPath);
            this.Controls.Add(this.btnLoadModel);
            this.Controls.Add(this.btnDownloadModel);
            this.Controls.Add(this.lblOnnx);
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.MinimumSize = new System.Drawing.Size(700, 520);
            this.Name = "MainForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "YOLO26 ONNX 검출";
            ((System.ComponentModel.ISupportInitialize)(this.numConf)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.trackBarZoom)).EndInit();
            this.panelImageHost.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.pictureBox)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.trackPlayback)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        private System.Windows.Forms.TextBox txtOnnxPath;
        private System.Windows.Forms.Button btnBrowseOnnx;
        private System.Windows.Forms.Button btnLoadModel;
        private System.Windows.Forms.Button btnDownloadModel;
        private System.Windows.Forms.Label lblOnnx;
        private System.Windows.Forms.Label lblConf;
        private System.Windows.Forms.NumericUpDown numConf;
        private System.Windows.Forms.Button btnImage;
        private System.Windows.Forms.Button btnVideo;
        private System.Windows.Forms.Button btnPlayOutput;
        private System.Windows.Forms.Button btnSaveImageResult;
        private System.Windows.Forms.Label lblZoom;
        private System.Windows.Forms.TrackBar trackBarZoom;
        private System.Windows.Forms.Label lblZoomPct;
        private System.Windows.Forms.Panel panelImageHost;
        private System.Windows.Forms.PictureBox pictureBox;
        private System.Windows.Forms.Label lblMediaInfo;
        private System.Windows.Forms.TrackBar trackPlayback;
        private System.Windows.Forms.Label lblPlaybackPos;
        private System.Windows.Forms.Button btnPlaybackPause;
        private System.Windows.Forms.Button btnPlaybackResume;
        private System.Windows.Forms.Button btnPlaybackStop;
        private System.Windows.Forms.ProgressBar progressBarMain;
        private System.Windows.Forms.Label lblStatus;
    }
}
