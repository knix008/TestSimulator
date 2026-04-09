using System.Drawing;
using System.Windows.Forms;

namespace YOLO26V10
{
    partial class YOLO26V10
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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(YOLO26V10));
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
            this.btnSaveResultImage = new System.Windows.Forms.Button();
            this.btnPlayResult = new System.Windows.Forms.Button();
            this.lblVideoProgressTime = new System.Windows.Forms.Label();
            this.progressVideo = new System.Windows.Forms.ProgressBar();
            this.splitMain = new System.Windows.Forms.SplitContainer();
            this.picInput = new System.Windows.Forms.PictureBox();
            this.lblInputCaption = new System.Windows.Forms.Label();
            this.picOutput = new System.Windows.Forms.PictureBox();
            this.lblOutputCaption = new System.Windows.Forms.Label();
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
            this.comboModel.Location = new System.Drawing.Point(12, 10);
            this.comboModel.Name = "comboModel";
            this.comboModel.Size = new System.Drawing.Size(896, 20);
            this.comboModel.TabIndex = 0;
            this.comboModel.SelectedIndexChanged += new System.EventHandler(this.comboModel_SelectedIndexChanged);
            // 
            // btnPrepareModel
            // 
            this.btnPrepareModel.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnPrepareModel.Location = new System.Drawing.Point(916, 8);
            this.btnPrepareModel.Name = "btnPrepareModel";
            this.btnPrepareModel.Size = new System.Drawing.Size(208, 28);
            this.btnPrepareModel.TabIndex = 1;
            this.btnPrepareModel.Text = "모델 준비 (.pt → ONNX)";
            this.btnPrepareModel.UseVisualStyleBackColor = false;
            this.btnPrepareModel.Click += new System.EventHandler(this.btnPrepareModel_Click);
            // 
            // lblStatus
            // 
            this.lblStatus.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblStatus.Location = new System.Drawing.Point(12, 44);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Padding = new System.Windows.Forms.Padding(10, 6, 10, 6);
            this.lblStatus.Size = new System.Drawing.Size(1112, 30);
            this.lblStatus.TabIndex = 2;
            this.lblStatus.Text = "모델을 준비하거나 ONNX 경로를 확인하세요.";
            this.lblStatus.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // lblFilter
            // 
            this.lblFilter.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblFilter.Location = new System.Drawing.Point(12, 104);
            this.lblFilter.Name = "lblFilter";
            this.lblFilter.Size = new System.Drawing.Size(1112, 16);
            this.lblFilter.TabIndex = 5;
            this.lblFilter.Text = "클래스 필터 (비우면 전체) · 쉼표로 구분 — 예: person, car 또는 0, 2";
            // 
            // txtClassFilter
            // 
            this.txtClassFilter.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtClassFilter.Location = new System.Drawing.Point(12, 122);
            this.txtClassFilter.Name = "txtClassFilter";
            this.txtClassFilter.Size = new System.Drawing.Size(1112, 21);
            this.txtClassFilter.TabIndex = 6;
            // 
            // lblConf
            // 
            this.lblConf.AutoSize = true;
            this.lblConf.Location = new System.Drawing.Point(12, 80);
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
            this.numConf.Location = new System.Drawing.Point(100, 76);
            this.numConf.Maximum = new decimal(new int[] {
            1,
            0,
            0,
            0});
            this.numConf.Name = "numConf";
            this.numConf.Size = new System.Drawing.Size(64, 21);
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
            this.btnImage.Location = new System.Drawing.Point(970, 72);
            this.btnImage.Name = "btnImage";
            this.btnImage.Size = new System.Drawing.Size(88, 28);
            this.btnImage.TabIndex = 7;
            this.btnImage.Text = "이미지";
            this.btnImage.UseVisualStyleBackColor = false;
            this.btnImage.Click += new System.EventHandler(this.btnImage_Click);
            // 
            // btnVideo
            // 
            this.btnVideo.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnVideo.Location = new System.Drawing.Point(878, 72);
            this.btnVideo.Name = "btnVideo";
            this.btnVideo.Size = new System.Drawing.Size(88, 28);
            this.btnVideo.TabIndex = 8;
            this.btnVideo.Text = "동영상";
            this.btnVideo.UseVisualStyleBackColor = false;
            this.btnVideo.Click += new System.EventHandler(this.btnVideo_Click);
            // 
            // lblVideoControls
            // 
            this.lblVideoControls.AutoSize = true;
            this.lblVideoControls.Location = new System.Drawing.Point(12, 158);
            this.lblVideoControls.Name = "lblVideoControls";
            this.lblVideoControls.Size = new System.Drawing.Size(57, 12);
            this.lblVideoControls.TabIndex = 9;
            this.lblVideoControls.Text = "재생 제어";
            // 
            // btnVideoPause
            // 
            this.btnVideoPause.Enabled = false;
            this.btnVideoPause.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnVideoPause.Location = new System.Drawing.Point(96, 148);
            this.btnVideoPause.Name = "btnVideoPause";
            this.btnVideoPause.Size = new System.Drawing.Size(42, 42);
            this.btnVideoPause.TabIndex = 10;
            this.btnVideoPause.UseVisualStyleBackColor = false;
            this.btnVideoPause.Click += new System.EventHandler(this.btnVideoPause_Click);
            // 
            // btnVideoResume
            // 
            this.btnVideoResume.Enabled = false;
            this.btnVideoResume.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnVideoResume.Location = new System.Drawing.Point(144, 148);
            this.btnVideoResume.Name = "btnVideoResume";
            this.btnVideoResume.Size = new System.Drawing.Size(42, 42);
            this.btnVideoResume.TabIndex = 11;
            this.btnVideoResume.UseVisualStyleBackColor = false;
            this.btnVideoResume.Click += new System.EventHandler(this.btnVideoResume_Click);
            // 
            // btnStopVideo
            // 
            this.btnStopVideo.Enabled = false;
            this.btnStopVideo.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnStopVideo.Location = new System.Drawing.Point(192, 148);
            this.btnStopVideo.Name = "btnStopVideo";
            this.btnStopVideo.Size = new System.Drawing.Size(42, 42);
            this.btnStopVideo.TabIndex = 12;
            this.btnStopVideo.UseVisualStyleBackColor = false;
            this.btnStopVideo.Click += new System.EventHandler(this.btnStopVideo_Click);
            // 
            // btnSaveResultImage
            // 
            this.btnSaveResultImage.Enabled = false;
            this.btnSaveResultImage.Location = new System.Drawing.Point(970, 72);
            this.btnSaveResultImage.Name = "btnSaveResultImage";
            this.btnSaveResultImage.Size = new System.Drawing.Size(88, 28);
            this.btnSaveResultImage.TabIndex = 18;
            this.btnSaveResultImage.Text = "결과 저장";
            this.btnSaveResultImage.UseVisualStyleBackColor = false;
            this.btnSaveResultImage.Click += new System.EventHandler(this.btnSaveResultImage_Click);
            // 
            // btnPlayResult
            // 
            this.btnPlayResult.Location = new System.Drawing.Point(1062, 72);
            this.btnPlayResult.Name = "btnPlayResult";
            this.btnPlayResult.Size = new System.Drawing.Size(88, 28);
            this.btnPlayResult.TabIndex = 15;
            this.btnPlayResult.Text = "결과 재생";
            this.btnPlayResult.UseVisualStyleBackColor = false;
            this.btnPlayResult.Click += new System.EventHandler(this.btnPlayResult_Click);
            // 
            // lblVideoProgressTime
            // 
            this.lblVideoProgressTime.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblVideoProgressTime.Location = new System.Drawing.Point(12, 192);
            this.lblVideoProgressTime.Name = "lblVideoProgressTime";
            this.lblVideoProgressTime.Size = new System.Drawing.Size(1112, 16);
            this.lblVideoProgressTime.TabIndex = 16;
            // 
            // progressVideo
            // 
            this.progressVideo.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.progressVideo.Location = new System.Drawing.Point(12, 210);
            this.progressVideo.Name = "progressVideo";
            this.progressVideo.Size = new System.Drawing.Size(1112, 12);
            this.progressVideo.TabIndex = 17;
            // 
            // splitMain
            // 
            this.splitMain.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.splitMain.Location = new System.Drawing.Point(12, 228);
            this.splitMain.Name = "splitMain";
            // 
            // splitMain.Panel1
            // 
            this.splitMain.Panel1.Controls.Add(this.picInput);
            this.splitMain.Panel1.Controls.Add(this.lblInputCaption);
            // 
            // splitMain.Panel2
            // 
            this.splitMain.Panel2.Controls.Add(this.picOutput);
            this.splitMain.Panel2.Controls.Add(this.lblOutputCaption);
            this.splitMain.Size = new System.Drawing.Size(1112, 361);
            this.splitMain.SplitterDistance = 554;
            this.splitMain.SplitterWidth = 5;
            this.splitMain.TabIndex = 13;
            // 
            // picInput
            // 
            this.picInput.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.picInput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.picInput.Location = new System.Drawing.Point(0, 28);
            this.picInput.Name = "picInput";
            this.picInput.Size = new System.Drawing.Size(554, 333);
            this.picInput.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            this.picInput.TabIndex = 0;
            this.picInput.TabStop = false;
            // 
            // lblInputCaption
            // 
            this.lblInputCaption.Dock = System.Windows.Forms.DockStyle.Top;
            this.lblInputCaption.Location = new System.Drawing.Point(0, 0);
            this.lblInputCaption.Name = "lblInputCaption";
            this.lblInputCaption.Size = new System.Drawing.Size(554, 28);
            this.lblInputCaption.TabIndex = 1;
            this.lblInputCaption.Text = "입력 (원본)";
            this.lblInputCaption.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // picOutput
            // 
            this.picOutput.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.picOutput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.picOutput.Location = new System.Drawing.Point(0, 28);
            this.picOutput.Name = "picOutput";
            this.picOutput.Size = new System.Drawing.Size(553, 333);
            this.picOutput.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            this.picOutput.TabIndex = 0;
            this.picOutput.TabStop = false;
            // 
            // lblOutputCaption
            // 
            this.lblOutputCaption.Dock = System.Windows.Forms.DockStyle.Top;
            this.lblOutputCaption.Location = new System.Drawing.Point(0, 0);
            this.lblOutputCaption.Name = "lblOutputCaption";
            this.lblOutputCaption.Size = new System.Drawing.Size(553, 28);
            this.lblOutputCaption.TabIndex = 1;
            this.lblOutputCaption.Text = "출력 (세그멘테이션)";
            this.lblOutputCaption.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // txtLog
            // 
            this.txtLog.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtLog.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.txtLog.Font = new System.Drawing.Font("돋움", 9.75F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.txtLog.Location = new System.Drawing.Point(12, 603);
            this.txtLog.Multiline = true;
            this.txtLog.Name = "txtLog";
            this.txtLog.ReadOnly = true;
            this.txtLog.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
            this.txtLog.Size = new System.Drawing.Size(1112, 82);
            this.txtLog.TabIndex = 14;
            // 
            // YOLO26V10
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(96F, 96F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Dpi;
            this.ClientSize = new System.Drawing.Size(1136, 697);
            this.Controls.Add(this.txtLog);
            this.Controls.Add(this.splitMain);
            this.Controls.Add(this.progressVideo);
            this.Controls.Add(this.lblVideoProgressTime);
            this.Controls.Add(this.btnStopVideo);
            this.Controls.Add(this.btnVideoResume);
            this.Controls.Add(this.btnVideoPause);
            this.Controls.Add(this.lblVideoControls);
            this.Controls.Add(this.btnSaveResultImage);
            this.Controls.Add(this.btnPlayResult);
            this.Controls.Add(this.btnVideo);
            this.Controls.Add(this.btnImage);
            this.Controls.Add(this.numConf);
            this.Controls.Add(this.lblConf);
            this.Controls.Add(this.txtClassFilter);
            this.Controls.Add(this.lblFilter);
            this.Controls.Add(this.lblStatus);
            this.Controls.Add(this.btnPrepareModel);
            this.Controls.Add(this.comboModel);
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.MinimumSize = new System.Drawing.Size(900, 500);
            this.Name = "YOLO26V10";
            this.Text = "YOLO26 세그멘테이션";
            this.Shown += new System.EventHandler(this.YOLO26V10_Shown);
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
        private System.Windows.Forms.Button btnSaveResultImage;
        private System.Windows.Forms.Button btnPlayResult;
        private System.Windows.Forms.Label lblVideoProgressTime;
        private System.Windows.Forms.ProgressBar progressVideo;
        private System.Windows.Forms.SplitContainer splitMain;
        private System.Windows.Forms.Label lblInputCaption;
        private System.Windows.Forms.Label lblOutputCaption;
        private System.Windows.Forms.PictureBox picInput;
        private System.Windows.Forms.PictureBox picOutput;
        private System.Windows.Forms.TextBox txtLog;
    }
}

