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
            this.panelClient = new System.Windows.Forms.Panel();
            this.tableRoot = new System.Windows.Forms.TableLayoutPanel();
            this.panelPreviewHost = new System.Windows.Forms.Panel();
            this.tablePreview = new System.Windows.Forms.TableLayoutPanel();
            this.grpLog = new System.Windows.Forms.GroupBox();
            this.txtLog = new System.Windows.Forms.TextBox();
            this.grpVideo = new System.Windows.Forms.GroupBox();
            this.progressVideo = new System.Windows.Forms.ProgressBar();
            this.lblVideoProgressTime = new System.Windows.Forms.Label();
            this.btnStopVideo = new System.Windows.Forms.Button();
            this.btnVideoResume = new System.Windows.Forms.Button();
            this.btnVideoPause = new System.Windows.Forms.Button();
            this.lblVideoControls = new System.Windows.Forms.Label();
            this.grpInfer = new System.Windows.Forms.GroupBox();
            this.txtClassFilter = new System.Windows.Forms.TextBox();
            this.lblFilter = new System.Windows.Forms.Label();
            this.btnPlayResult = new System.Windows.Forms.Button();
            this.btnSaveResultImage = new System.Windows.Forms.Button();
            this.btnImage = new System.Windows.Forms.Button();
            this.btnVideo = new System.Windows.Forms.Button();
            this.numConf = new System.Windows.Forms.NumericUpDown();
            this.lblConf = new System.Windows.Forms.Label();
            this.lblStatus = new System.Windows.Forms.Label();
            this.grpStatus = new System.Windows.Forms.GroupBox();
            this.grpModel = new System.Windows.Forms.GroupBox();
            this.btnPythonDeps = new System.Windows.Forms.Button();
            this.btnPrepareModel = new System.Windows.Forms.Button();
            this.comboModel = new System.Windows.Forms.ComboBox();
            this.lblVariant = new System.Windows.Forms.Label();
            this.comboTask = new System.Windows.Forms.ComboBox();
            this.lblTask = new System.Windows.Forms.Label();
            this.grpViewOutput = new System.Windows.Forms.GroupBox();
            this.picOutput = new System.Windows.Forms.PictureBox();
            this.lblOutputCaption = new System.Windows.Forms.Label();
            this.grpViewInput = new System.Windows.Forms.GroupBox();
            this.picInput = new System.Windows.Forms.PictureBox();
            this.lblInputCaption = new System.Windows.Forms.Label();
            this.panelClient.SuspendLayout();
            this.tableRoot.SuspendLayout();
            this.panelPreviewHost.SuspendLayout();
            this.tablePreview.SuspendLayout();
            this.grpLog.SuspendLayout();
            this.grpStatus.SuspendLayout();
            this.grpVideo.SuspendLayout();
            this.grpInfer.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numConf)).BeginInit();
            this.grpModel.SuspendLayout();
            this.grpViewOutput.SuspendLayout();
            this.grpViewInput.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.picInput)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.picOutput)).BeginInit();
            this.SuspendLayout();
            // 
            // panelClient
            // 
            this.panelClient.Controls.Add(this.tableRoot);
            this.panelClient.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelClient.Location = new System.Drawing.Point(0, 0);
            this.panelClient.Name = "panelClient";
            this.panelClient.Padding = new System.Windows.Forms.Padding(12, 8, 12, 8);
            this.panelClient.Size = new System.Drawing.Size(1257, 937);
            this.panelClient.TabIndex = 5;
            // 
            // tableRoot
            // 
            // 행 높이: 디자이너에서 tableRoot 선택 → 속성 → RowStyles → 각 행 Absolute(픽셀) 또는 마지막 확장 행 Percent.
            this.tableRoot.ColumnCount = 1;
            this.tableRoot.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 100F));
            this.tableRoot.Controls.Add(this.grpModel, 0, 0);
            this.tableRoot.Controls.Add(this.grpStatus, 0, 1);
            this.tableRoot.Controls.Add(this.grpInfer, 0, 2);
            this.tableRoot.Controls.Add(this.grpVideo, 0, 3);
            this.tableRoot.Controls.Add(this.panelPreviewHost, 0, 4);
            this.tableRoot.Controls.Add(this.grpLog, 0, 5);
            this.tableRoot.Dock = System.Windows.Forms.DockStyle.Fill;
            this.tableRoot.Location = new System.Drawing.Point(12, 8);
            this.tableRoot.Name = "tableRoot";
            this.tableRoot.GrowStyle = System.Windows.Forms.TableLayoutPanelGrowStyle.FixedSize;
            this.tableRoot.RowCount = 6;
            this.tableRoot.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 90F));
            this.tableRoot.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 56F));
            this.tableRoot.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 134F));
            this.tableRoot.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 114F));
            this.tableRoot.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 100F));
            this.tableRoot.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 162F));
            this.tableRoot.Size = new System.Drawing.Size(1233, 921);
            this.tableRoot.TabIndex = 9;
            // 
            // panelPreviewHost
            // 
            this.panelPreviewHost.Controls.Add(this.tablePreview);
            this.panelPreviewHost.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelPreviewHost.Location = new System.Drawing.Point(3, 397);
            this.panelPreviewHost.Name = "panelPreviewHost";
            this.panelPreviewHost.Size = new System.Drawing.Size(1227, 356);
            this.panelPreviewHost.TabIndex = 10;
            // 
            // tablePreview
            // 
            this.tablePreview.ColumnCount = 2;
            this.tablePreview.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 50F));
            this.tablePreview.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 50F));
            this.tablePreview.Controls.Add(this.grpViewInput, 0, 0);
            this.tablePreview.Controls.Add(this.grpViewOutput, 1, 0);
            this.tablePreview.Dock = System.Windows.Forms.DockStyle.Fill;
            this.tablePreview.GrowStyle = System.Windows.Forms.TableLayoutPanelGrowStyle.FixedSize;
            this.tablePreview.Location = new System.Drawing.Point(0, 0);
            this.tablePreview.Name = "tablePreview";
            this.tablePreview.RowCount = 1;
            this.tablePreview.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 100F));
            this.tablePreview.Size = new System.Drawing.Size(1227, 356);
            this.tablePreview.TabIndex = 0;
            // 
            // grpLog
            // 
            this.grpLog.Controls.Add(this.txtLog);
            this.grpLog.Dock = System.Windows.Forms.DockStyle.Fill;
            this.grpLog.Location = new System.Drawing.Point(3, 759);
            this.grpLog.Name = "grpLog";
            this.grpLog.Padding = new System.Windows.Forms.Padding(8, 4, 8, 8);
            this.grpLog.Size = new System.Drawing.Size(1227, 159);
            this.grpLog.TabIndex = 8;
            this.grpLog.TabStop = false;
            this.grpLog.Text = "로그";
            // 
            // txtLog
            // 
            this.txtLog.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.txtLog.Dock = System.Windows.Forms.DockStyle.Fill;
            this.txtLog.Location = new System.Drawing.Point(8, 18);
            this.txtLog.Multiline = true;
            this.txtLog.Name = "txtLog";
            this.txtLog.ReadOnly = true;
            this.txtLog.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
            this.txtLog.Size = new System.Drawing.Size(1233, 100);
            this.txtLog.TabIndex = 0;
            this.txtLog.TabStop = false;
            // 
            // grpVideo
            // 
            this.grpVideo.Controls.Add(this.progressVideo);
            this.grpVideo.Controls.Add(this.lblVideoProgressTime);
            this.grpVideo.Controls.Add(this.btnStopVideo);
            this.grpVideo.Controls.Add(this.btnVideoResume);
            this.grpVideo.Controls.Add(this.btnVideoPause);
            this.grpVideo.Controls.Add(this.lblVideoControls);
            this.grpVideo.Dock = System.Windows.Forms.DockStyle.Fill;
            this.grpVideo.Location = new System.Drawing.Point(3, 283);
            this.grpVideo.Name = "grpVideo";
            this.grpVideo.Size = new System.Drawing.Size(1227, 108);
            this.grpVideo.TabIndex = 3;
            this.grpVideo.TabStop = false;
            this.grpVideo.Text = "동영상 처리";
            // 
            // progressVideo
            // 
            this.progressVideo.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.progressVideo.Location = new System.Drawing.Point(12, 75);
            this.progressVideo.Name = "progressVideo";
            this.progressVideo.Size = new System.Drawing.Size(1209, 20);
            this.progressVideo.TabIndex = 5;
            // 
            // lblVideoProgressTime
            // 
            this.lblVideoProgressTime.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblVideoProgressTime.Location = new System.Drawing.Point(12, 70);
            this.lblVideoProgressTime.Name = "lblVideoProgressTime";
            this.lblVideoProgressTime.Size = new System.Drawing.Size(1209, 22);
            this.lblVideoProgressTime.TabIndex = 4;
            // 
            // btnStopVideo
            // 
            this.btnStopVideo.Enabled = false;
            this.btnStopVideo.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnStopVideo.Location = new System.Drawing.Point(168, 22);
            this.btnStopVideo.Name = "btnStopVideo";
            this.btnStopVideo.Size = new System.Drawing.Size(40, 36);
            this.btnStopVideo.TabIndex = 3;
            this.btnStopVideo.UseVisualStyleBackColor = false;
            this.btnStopVideo.Click += new System.EventHandler(this.btnStopVideo_Click);
            // 
            // btnVideoResume
            // 
            this.btnVideoResume.Enabled = false;
            this.btnVideoResume.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnVideoResume.Location = new System.Drawing.Point(126, 22);
            this.btnVideoResume.Name = "btnVideoResume";
            this.btnVideoResume.Size = new System.Drawing.Size(40, 36);
            this.btnVideoResume.TabIndex = 2;
            this.btnVideoResume.UseVisualStyleBackColor = false;
            this.btnVideoResume.Click += new System.EventHandler(this.btnVideoResume_Click);
            // 
            // btnVideoPause
            // 
            this.btnVideoPause.Enabled = false;
            this.btnVideoPause.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnVideoPause.Location = new System.Drawing.Point(84, 22);
            this.btnVideoPause.Name = "btnVideoPause";
            this.btnVideoPause.Size = new System.Drawing.Size(40, 36);
            this.btnVideoPause.TabIndex = 1;
            this.btnVideoPause.UseVisualStyleBackColor = false;
            this.btnVideoPause.Click += new System.EventHandler(this.btnVideoPause_Click);
            // 
            // lblVideoControls
            // 
            this.lblVideoControls.AutoSize = true;
            this.lblVideoControls.Location = new System.Drawing.Point(12, 32);
            this.lblVideoControls.Name = "lblVideoControls";
            this.lblVideoControls.Size = new System.Drawing.Size(57, 12);
            this.lblVideoControls.TabIndex = 0;
            this.lblVideoControls.Text = "재생 제어";
            // 
            // grpInfer
            // 
            this.grpInfer.Controls.Add(this.txtClassFilter);
            this.grpInfer.Controls.Add(this.lblFilter);
            this.grpInfer.Controls.Add(this.btnPlayResult);
            this.grpInfer.Controls.Add(this.btnSaveResultImage);
            this.grpInfer.Controls.Add(this.btnImage);
            this.grpInfer.Controls.Add(this.btnVideo);
            this.grpInfer.Controls.Add(this.numConf);
            this.grpInfer.Controls.Add(this.lblConf);
            this.grpInfer.Dock = System.Windows.Forms.DockStyle.Fill;
            this.grpInfer.Location = new System.Drawing.Point(3, 149);
            this.grpInfer.Name = "grpInfer";
            this.grpInfer.Size = new System.Drawing.Size(1227, 128);
            this.grpInfer.TabIndex = 2;
            this.grpInfer.TabStop = false;
            this.grpInfer.Text = "추론 옵션 · 실행";
            // 
            // txtClassFilter
            // 
            this.txtClassFilter.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtClassFilter.Location = new System.Drawing.Point(12, 82);
            this.txtClassFilter.Name = "txtClassFilter";
            this.txtClassFilter.Size = new System.Drawing.Size(1209, 21);
            this.txtClassFilter.TabIndex = 7;
            // 
            // lblFilter
            // 
            this.lblFilter.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblFilter.Location = new System.Drawing.Point(12, 58);
            this.lblFilter.Name = "lblFilter";
            this.lblFilter.Size = new System.Drawing.Size(1209, 20);
            this.lblFilter.TabIndex = 6;
            this.lblFilter.Text = "클래스 필터 (비우면 전체) · 예: person, car 또는 0, 2";
            // 
            // btnPlayResult
            // 
            this.btnPlayResult.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnPlayResult.Location = new System.Drawing.Point(1133, 22);
            this.btnPlayResult.Name = "btnPlayResult";
            this.btnPlayResult.Size = new System.Drawing.Size(88, 28);
            this.btnPlayResult.TabIndex = 5;
            this.btnPlayResult.Text = "결과 재생";
            this.btnPlayResult.UseVisualStyleBackColor = false;
            this.btnPlayResult.Click += new System.EventHandler(this.btnPlayResult_Click);
            // 
            // btnSaveResultImage
            // 
            this.btnSaveResultImage.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnSaveResultImage.Enabled = false;
            this.btnSaveResultImage.Location = new System.Drawing.Point(1037, 22);
            this.btnSaveResultImage.Name = "btnSaveResultImage";
            this.btnSaveResultImage.Size = new System.Drawing.Size(88, 28);
            this.btnSaveResultImage.TabIndex = 4;
            this.btnSaveResultImage.Text = "결과 저장";
            this.btnSaveResultImage.UseVisualStyleBackColor = false;
            this.btnSaveResultImage.Click += new System.EventHandler(this.btnSaveResultImage_Click);
            // 
            // btnImage
            // 
            this.btnImage.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnImage.Location = new System.Drawing.Point(941, 22);
            this.btnImage.Name = "btnImage";
            this.btnImage.Size = new System.Drawing.Size(88, 28);
            this.btnImage.TabIndex = 3;
            this.btnImage.Text = "이미지";
            this.btnImage.UseVisualStyleBackColor = false;
            this.btnImage.Click += new System.EventHandler(this.btnImage_Click);
            // 
            // btnVideo
            // 
            this.btnVideo.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnVideo.Location = new System.Drawing.Point(845, 22);
            this.btnVideo.Name = "btnVideo";
            this.btnVideo.Size = new System.Drawing.Size(88, 28);
            this.btnVideo.TabIndex = 2;
            this.btnVideo.Text = "동영상";
            this.btnVideo.UseVisualStyleBackColor = false;
            this.btnVideo.Click += new System.EventHandler(this.btnVideo_Click);
            // 
            // numConf
            // 
            this.numConf.DecimalPlaces = 2;
            this.numConf.Increment = new decimal(new int[] {
            5,
            0,
            0,
            131072});
            this.numConf.Location = new System.Drawing.Point(96, 24);
            this.numConf.Maximum = new decimal(new int[] {
            1,
            0,
            0,
            0});
            this.numConf.Name = "numConf";
            this.numConf.Size = new System.Drawing.Size(64, 21);
            this.numConf.TabIndex = 1;
            this.numConf.Value = new decimal(new int[] {
            50,
            0,
            0,
            131072});
            // 
            // lblConf
            // 
            this.lblConf.AutoSize = true;
            this.lblConf.Location = new System.Drawing.Point(12, 28);
            this.lblConf.Name = "lblConf";
            this.lblConf.Size = new System.Drawing.Size(69, 12);
            this.lblConf.TabIndex = 0;
            this.lblConf.Text = "신뢰도 임계";
            // 
            // grpStatus
            // 
            this.grpStatus.Controls.Add(this.lblStatus);
            this.grpStatus.Dock = System.Windows.Forms.DockStyle.Fill;
            this.grpStatus.Location = new System.Drawing.Point(3, 93);
            this.grpStatus.Name = "grpStatus";
            this.grpStatus.Padding = new System.Windows.Forms.Padding(8, 4, 8, 8);
            this.grpStatus.Size = new System.Drawing.Size(1227, 50);
            this.grpStatus.TabIndex = 11;
            this.grpStatus.TabStop = false;
            this.grpStatus.Text = "상태";
            // 
            // lblStatus
            // 
            this.lblStatus.Dock = System.Windows.Forms.DockStyle.Fill;
            this.lblStatus.Location = new System.Drawing.Point(8, 18);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Padding = new System.Windows.Forms.Padding(10, 4, 10, 4);
            this.lblStatus.Size = new System.Drawing.Size(1211, 24);
            this.lblStatus.TabIndex = 0;
            this.lblStatus.Text = "모델을 준비하거나 ONNX 경로를 확인하세요.";
            this.lblStatus.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // grpModel
            // 
            this.grpModel.Controls.Add(this.btnPythonDeps);
            this.grpModel.Controls.Add(this.btnPrepareModel);
            this.grpModel.Controls.Add(this.comboModel);
            this.grpModel.Controls.Add(this.lblVariant);
            this.grpModel.Controls.Add(this.comboTask);
            this.grpModel.Controls.Add(this.lblTask);
            this.grpModel.Dock = System.Windows.Forms.DockStyle.Fill;
            this.grpModel.Location = new System.Drawing.Point(3, 3);
            this.grpModel.Name = "grpModel";
            this.grpModel.Size = new System.Drawing.Size(1227, 84);
            this.grpModel.TabIndex = 0;
            this.grpModel.TabStop = false;
            this.grpModel.Text = "모델";
            // 
            // btnPythonDeps
            // 
            this.btnPythonDeps.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnPythonDeps.Location = new System.Drawing.Point(868, 28);
            this.btnPythonDeps.Name = "btnPythonDeps";
            this.btnPythonDeps.Size = new System.Drawing.Size(132, 28);
            this.btnPythonDeps.TabIndex = 5;
            this.btnPythonDeps.Text = "의존성 검사";
            this.btnPythonDeps.UseVisualStyleBackColor = false;
            this.btnPythonDeps.Click += new System.EventHandler(this.btnPythonDeps_Click);
            // 
            // btnPrepareModel
            // 
            this.btnPrepareModel.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnPrepareModel.Location = new System.Drawing.Point(1013, 28);
            this.btnPrepareModel.Name = "btnPrepareModel";
            this.btnPrepareModel.Size = new System.Drawing.Size(208, 28);
            this.btnPrepareModel.TabIndex = 6;
            this.btnPrepareModel.Text = "모델 준비";
            this.btnPrepareModel.UseVisualStyleBackColor = false;
            this.btnPrepareModel.Click += new System.EventHandler(this.btnPrepareModel_Click);
            // 
            // comboModel
            // 
            this.comboModel.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.comboModel.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.comboModel.FormattingEnabled = true;
            this.comboModel.Location = new System.Drawing.Point(236, 30);
            this.comboModel.Name = "comboModel";
            this.comboModel.Size = new System.Drawing.Size(765, 20);
            this.comboModel.TabIndex = 3;
            this.comboModel.SelectedIndexChanged += new System.EventHandler(this.comboModel_SelectedIndexChanged);
            // 
            // lblVariant
            // 
            this.lblVariant.AutoSize = true;
            this.lblVariant.Location = new System.Drawing.Point(192, 34);
            this.lblVariant.Name = "lblVariant";
            this.lblVariant.Size = new System.Drawing.Size(29, 12);
            this.lblVariant.TabIndex = 2;
            this.lblVariant.Text = "변형";
            // 
            // comboTask
            // 
            this.comboTask.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.comboTask.FormattingEnabled = true;
            this.comboTask.Location = new System.Drawing.Point(52, 30);
            this.comboTask.Name = "comboTask";
            this.comboTask.Size = new System.Drawing.Size(128, 20);
            this.comboTask.TabIndex = 1;
            this.comboTask.SelectedIndexChanged += new System.EventHandler(this.comboTask_SelectedIndexChanged);
            // 
            // lblTask
            // 
            this.lblTask.AutoSize = true;
            this.lblTask.Location = new System.Drawing.Point(12, 34);
            this.lblTask.Name = "lblTask";
            this.lblTask.Size = new System.Drawing.Size(29, 12);
            this.lblTask.TabIndex = 0;
            this.lblTask.Text = "작업";
            // 
            // grpViewOutput
            // 
            this.grpViewOutput.Controls.Add(this.picOutput);
            this.grpViewOutput.Controls.Add(this.lblOutputCaption);
            this.grpViewOutput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.grpViewOutput.Location = new System.Drawing.Point(616, 3);
            this.grpViewOutput.Name = "grpViewOutput";
            this.grpViewOutput.Padding = new System.Windows.Forms.Padding(6, 4, 6, 6);
            this.grpViewOutput.Size = new System.Drawing.Size(608, 350);
            this.grpViewOutput.TabIndex = 2;
            this.grpViewOutput.TabStop = false;
            this.grpViewOutput.Text = "결과 (이미지·동영상)";
            // 
            // picOutput
            // 
            this.picOutput.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.picOutput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.picOutput.Location = new System.Drawing.Point(6, 22);
            this.picOutput.Name = "picOutput";
            this.picOutput.Size = new System.Drawing.Size(595, 889);
            this.picOutput.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            this.picOutput.TabIndex = 0;
            this.picOutput.TabStop = false;
            // 
            // lblOutputCaption
            // 
            this.lblOutputCaption.Dock = System.Windows.Forms.DockStyle.Top;
            this.lblOutputCaption.Location = new System.Drawing.Point(6, 18);
            this.lblOutputCaption.Name = "lblOutputCaption";
            this.lblOutputCaption.Size = new System.Drawing.Size(595, 28);
            this.lblOutputCaption.TabIndex = 1;
            this.lblOutputCaption.Text = "출력";
            this.lblOutputCaption.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // grpViewInput
            // 
            this.grpViewInput.Controls.Add(this.picInput);
            this.grpViewInput.Controls.Add(this.lblInputCaption);
            this.grpViewInput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.grpViewInput.Location = new System.Drawing.Point(3, 3);
            this.grpViewInput.Name = "grpViewInput";
            this.grpViewInput.Padding = new System.Windows.Forms.Padding(6, 4, 6, 6);
            this.grpViewInput.Size = new System.Drawing.Size(608, 350);
            this.grpViewInput.TabIndex = 0;
            this.grpViewInput.TabStop = false;
            this.grpViewInput.Text = "원본 (이미지·동영상)";
            // 
            // picInput
            // 
            this.picInput.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.picInput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.picInput.Location = new System.Drawing.Point(6, 22);
            this.picInput.Name = "picInput";
            this.picInput.Size = new System.Drawing.Size(608, 889);
            this.picInput.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            this.picInput.TabIndex = 0;
            this.picInput.TabStop = false;
            // 
            // lblInputCaption
            // 
            this.lblInputCaption.Dock = System.Windows.Forms.DockStyle.Top;
            this.lblInputCaption.Location = new System.Drawing.Point(6, 18);
            this.lblInputCaption.Name = "lblInputCaption";
            this.lblInputCaption.Size = new System.Drawing.Size(608, 28);
            this.lblInputCaption.TabIndex = 1;
            this.lblInputCaption.Text = "입력 (원본)";
            this.lblInputCaption.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // YOLO26V10
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(96F, 96F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Dpi;
            this.ClientSize = new System.Drawing.Size(1257, 937);
            this.Controls.Add(this.panelClient);
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.MinimumSize = new System.Drawing.Size(1000, 780);
            this.Name = "YOLO26V10";
            this.Text = "YOLO26 — 세그·검출·포즈·분류·OBB";
            this.Shown += new System.EventHandler(this.YOLO26V10_Shown);
            this.grpViewOutput.ResumeLayout(false);
            this.grpViewInput.ResumeLayout(false);
            this.tablePreview.ResumeLayout(false);
            this.panelPreviewHost.ResumeLayout(false);
            this.grpLog.ResumeLayout(false);
            this.grpStatus.ResumeLayout(false);
            this.tableRoot.ResumeLayout(false);
            this.panelClient.ResumeLayout(false);
            this.grpVideo.ResumeLayout(false);
            this.grpVideo.PerformLayout();
            this.grpInfer.ResumeLayout(false);
            this.grpInfer.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numConf)).EndInit();
            this.grpModel.ResumeLayout(false);
            this.grpModel.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.picInput)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.picOutput)).EndInit();
            this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.Panel panelClient;
        private System.Windows.Forms.TableLayoutPanel tableRoot;
        private System.Windows.Forms.Panel panelPreviewHost;
        private System.Windows.Forms.GroupBox grpLog;
        private System.Windows.Forms.GroupBox grpStatus;
        private System.Windows.Forms.GroupBox grpModel;
        private System.Windows.Forms.Label lblVariant;
        private System.Windows.Forms.GroupBox grpInfer;
        private System.Windows.Forms.GroupBox grpVideo;
        private System.Windows.Forms.Label lblTask;
        private System.Windows.Forms.ComboBox comboTask;
        private System.Windows.Forms.ComboBox comboModel;
        private System.Windows.Forms.Button btnPythonDeps;
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
        private System.Windows.Forms.TableLayoutPanel tablePreview;
        private System.Windows.Forms.GroupBox grpViewInput;
        private System.Windows.Forms.GroupBox grpViewOutput;
        private System.Windows.Forms.Label lblInputCaption;
        private System.Windows.Forms.Label lblOutputCaption;
        private System.Windows.Forms.PictureBox picInput;
        private System.Windows.Forms.PictureBox picOutput;
        private System.Windows.Forms.TextBox txtLog;
    }
}
