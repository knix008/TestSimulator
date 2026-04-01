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
            this.txtOnnxPath = new System.Windows.Forms.TextBox();
            this.btnBrowseOnnx = new System.Windows.Forms.Button();
            this.btnLoadModel = new System.Windows.Forms.Button();
            this.lblOnnx = new System.Windows.Forms.Label();
            this.lblConf = new System.Windows.Forms.Label();
            this.numConf = new System.Windows.Forms.NumericUpDown();
            this.btnImage = new System.Windows.Forms.Button();
            this.btnVideo = new System.Windows.Forms.Button();
            this.lblZoom = new System.Windows.Forms.Label();
            this.trackBarZoom = new System.Windows.Forms.TrackBar();
            this.lblZoomPct = new System.Windows.Forms.Label();
            this.panelImageHost = new System.Windows.Forms.Panel();
            this.pictureBox = new System.Windows.Forms.PictureBox();
            this.lblMediaInfo = new System.Windows.Forms.Label();
            this.progressBarMain = new System.Windows.Forms.ProgressBar();
            this.lblStatus = new System.Windows.Forms.Label();
            ((System.ComponentModel.ISupportInitialize)(this.numConf)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.trackBarZoom)).BeginInit();
            this.panelImageHost.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.pictureBox)).BeginInit();
            this.SuspendLayout();
            // 
            // txtOnnxPath
            // 
            this.txtOnnxPath.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtOnnxPath.Location = new System.Drawing.Point(90, 12);
            this.txtOnnxPath.Name = "txtOnnxPath";
            this.txtOnnxPath.Size = new System.Drawing.Size(598, 21);
            this.txtOnnxPath.TabIndex = 1;
            this.txtOnnxPath.TextChanged += new System.EventHandler(this.TxtOnnxPath_TextChanged);
            // 
            // btnBrowseOnnx
            // 
            this.btnBrowseOnnx.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnBrowseOnnx.Location = new System.Drawing.Point(694, 10);
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
            this.btnLoadModel.Location = new System.Drawing.Point(775, 10);
            this.btnLoadModel.Name = "btnLoadModel";
            this.btnLoadModel.Size = new System.Drawing.Size(95, 23);
            this.btnLoadModel.TabIndex = 9;
            this.btnLoadModel.Text = "모델 로드";
            this.btnLoadModel.UseVisualStyleBackColor = true;
            this.btnLoadModel.Click += new System.EventHandler(this.BtnLoadModel_Click);
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
            this.btnVideo.Size = new System.Drawing.Size(120, 25);
            this.btnVideo.TabIndex = 6;
            this.btnVideo.Text = "동영상 검출...";
            this.btnVideo.UseVisualStyleBackColor = true;
            this.btnVideo.Click += new System.EventHandler(this.BtnVideo_Click);
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
            this.trackBarZoom.Size = new System.Drawing.Size(680, 45);
            this.trackBarZoom.TabIndex = 11;
            this.trackBarZoom.TickFrequency = 25;
            this.trackBarZoom.Value = 100;
            this.trackBarZoom.ValueChanged += new System.EventHandler(this.TrackBarZoom_ValueChanged);
            // 
            // lblZoomPct
            // 
            this.lblZoomPct.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.lblZoomPct.AutoSize = true;
            this.lblZoomPct.Location = new System.Drawing.Point(785, 78);
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
            this.panelImageHost.Size = new System.Drawing.Size(700, 418);
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
            this.lblMediaInfo.Location = new System.Drawing.Point(724, 118);
            this.lblMediaInfo.Name = "lblMediaInfo";
            this.lblMediaInfo.Size = new System.Drawing.Size(148, 418);
            this.lblMediaInfo.TabIndex = 15;
            this.lblMediaInfo.Text = "미디어 없음";
            // 
            // progressBarMain
            // 
            this.progressBarMain.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.progressBarMain.Location = new System.Drawing.Point(12, 542);
            this.progressBarMain.Name = "progressBarMain";
            this.progressBarMain.Size = new System.Drawing.Size(860, 20);
            this.progressBarMain.Style = System.Windows.Forms.ProgressBarStyle.Continuous;
            this.progressBarMain.TabIndex = 14;
            this.progressBarMain.Visible = false;
            // 
            // lblStatus
            // 
            this.lblStatus.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblStatus.Location = new System.Drawing.Point(12, 568);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new System.Drawing.Size(860, 22);
            this.lblStatus.TabIndex = 8;
            this.lblStatus.Text = "ONNX 경로를 지정한 뒤 「모델 로드」를 누르세요.";
            // 
            // MainForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(884, 601);
            this.Controls.Add(this.panelImageHost);
            this.Controls.Add(this.lblMediaInfo);
            this.Controls.Add(this.lblZoomPct);
            this.Controls.Add(this.trackBarZoom);
            this.Controls.Add(this.lblZoom);
            this.Controls.Add(this.lblStatus);
            this.Controls.Add(this.progressBarMain);
            this.Controls.Add(this.btnVideo);
            this.Controls.Add(this.btnImage);
            this.Controls.Add(this.numConf);
            this.Controls.Add(this.lblConf);
            this.Controls.Add(this.btnBrowseOnnx);
            this.Controls.Add(this.txtOnnxPath);
            this.Controls.Add(this.btnLoadModel);
            this.Controls.Add(this.lblOnnx);
            this.MinimumSize = new System.Drawing.Size(700, 520);
            this.Name = "MainForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "YOLO26 ONNX 검출";
            ((System.ComponentModel.ISupportInitialize)(this.numConf)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.trackBarZoom)).EndInit();
            this.panelImageHost.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.pictureBox)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        private System.Windows.Forms.TextBox txtOnnxPath;
        private System.Windows.Forms.Button btnBrowseOnnx;
        private System.Windows.Forms.Button btnLoadModel;
        private System.Windows.Forms.Label lblOnnx;
        private System.Windows.Forms.Label lblConf;
        private System.Windows.Forms.NumericUpDown numConf;
        private System.Windows.Forms.Button btnImage;
        private System.Windows.Forms.Button btnVideo;
        private System.Windows.Forms.Label lblZoom;
        private System.Windows.Forms.TrackBar trackBarZoom;
        private System.Windows.Forms.Label lblZoomPct;
        private System.Windows.Forms.Panel panelImageHost;
        private System.Windows.Forms.PictureBox pictureBox;
        private System.Windows.Forms.Label lblMediaInfo;
        private System.Windows.Forms.ProgressBar progressBarMain;
        private System.Windows.Forms.Label lblStatus;
    }
}
