using System.Drawing;
using System.Windows.Forms;

namespace YOLO26V10
{
    internal partial class PythonExportDependencyDialog
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && components != null)
                components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.lblTitle = new System.Windows.Forms.Label();
            this.lblSummary = new System.Windows.Forms.Label();
            this.progressBar = new System.Windows.Forms.ProgressBar();
            this.lblProgress = new System.Windows.Forms.Label();
            this.txtLog = new System.Windows.Forms.TextBox();
            this.btnCheck = new System.Windows.Forms.Button();
            this.btnInstall = new System.Windows.Forms.Button();
            this.btnClose = new System.Windows.Forms.Button();
            this.SuspendLayout();
            // 
            // lblTitle
            // 
            this.lblTitle.Anchor = ((AnchorStyles)(((AnchorStyles.Top | AnchorStyles.Left) | AnchorStyles.Right)));
            this.lblTitle.Location = new System.Drawing.Point(14, 12);
            this.lblTitle.Name = "lblTitle";
            this.lblTitle.Size = new System.Drawing.Size(612, 32);
            this.lblTitle.TabIndex = 0;
            this.lblTitle.Text = "ONNX 변환에 쓰는 Python 3·pip 패키지(ultralytics, onnx 등)를 검사합니다.";
            // 
            // lblSummary
            // 
            this.lblSummary.Anchor = ((AnchorStyles)(((AnchorStyles.Top | AnchorStyles.Left) | AnchorStyles.Right)));
            this.lblSummary.Location = new System.Drawing.Point(14, 48);
            this.lblSummary.Name = "lblSummary";
            this.lblSummary.Size = new System.Drawing.Size(612, 120);
            this.lblSummary.TabIndex = 1;
            this.lblSummary.Text = "검사를 시작합니다...";
            // 
            // progressBar
            // 
            this.progressBar.Anchor = ((AnchorStyles)(((AnchorStyles.Top | AnchorStyles.Left) | AnchorStyles.Right)));
            this.progressBar.Location = new System.Drawing.Point(14, 174);
            this.progressBar.Name = "progressBar";
            this.progressBar.Size = new System.Drawing.Size(612, 18);
            this.progressBar.TabIndex = 2;
            this.progressBar.Visible = false;
            // 
            // lblProgress
            // 
            this.lblProgress.Anchor = ((AnchorStyles)(((AnchorStyles.Top | AnchorStyles.Left) | AnchorStyles.Right)));
            this.lblProgress.Location = new System.Drawing.Point(14, 196);
            this.lblProgress.Name = "lblProgress";
            this.lblProgress.Size = new System.Drawing.Size(612, 16);
            this.lblProgress.TabIndex = 3;
            // 
            // txtLog
            // 
            this.txtLog.Anchor = ((AnchorStyles)((((AnchorStyles.Top | AnchorStyles.Bottom) | AnchorStyles.Left) | AnchorStyles.Right)));
            this.txtLog.Location = new System.Drawing.Point(14, 218);
            this.txtLog.Multiline = true;
            this.txtLog.Name = "txtLog";
            this.txtLog.ReadOnly = true;
            this.txtLog.ScrollBars = ScrollBars.Vertical;
            this.txtLog.Size = new System.Drawing.Size(612, 168);
            this.txtLog.TabIndex = 4;
            this.txtLog.TabStop = false;
            // 
            // btnCheck
            // 
            this.btnCheck.Anchor = ((AnchorStyles)((AnchorStyles.Bottom | AnchorStyles.Left)));
            this.btnCheck.Location = new System.Drawing.Point(14, 398);
            this.btnCheck.Name = "btnCheck";
            this.btnCheck.Size = new System.Drawing.Size(120, 28);
            this.btnCheck.TabIndex = 5;
            this.btnCheck.Text = "다시 검사";
            this.btnCheck.UseVisualStyleBackColor = true;
            this.btnCheck.Click += new System.EventHandler(this.btnCheck_Click);
            // 
            // btnInstall
            // 
            this.btnInstall.Anchor = ((AnchorStyles)((AnchorStyles.Bottom | AnchorStyles.Left)));
            this.btnInstall.Enabled = false;
            this.btnInstall.Location = new System.Drawing.Point(142, 398);
            this.btnInstall.Name = "btnInstall";
            this.btnInstall.Size = new System.Drawing.Size(160, 28);
            this.btnInstall.TabIndex = 6;
            this.btnInstall.Text = "패키지 설치 (pip)";
            this.btnInstall.UseVisualStyleBackColor = true;
            this.btnInstall.Click += new System.EventHandler(this.btnInstall_Click);
            // 
            // btnClose
            // 
            this.btnClose.Anchor = ((AnchorStyles)((AnchorStyles.Bottom | AnchorStyles.Right)));
            this.btnClose.DialogResult = System.Windows.Forms.DialogResult.Cancel;
            this.btnClose.Location = new System.Drawing.Point(546, 398);
            this.btnClose.Name = "btnClose";
            this.btnClose.Size = new System.Drawing.Size(80, 28);
            this.btnClose.TabIndex = 7;
            this.btnClose.Text = "닫기";
            this.btnClose.UseVisualStyleBackColor = true;
            this.btnClose.Click += new System.EventHandler(this.btnClose_Click);
            // 
            // PythonExportDependencyDialog
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = AutoScaleMode.Font;
            this.CancelButton = this.btnClose;
            this.ClientSize = new System.Drawing.Size(640, 438);
            this.Controls.Add(this.btnClose);
            this.Controls.Add(this.btnInstall);
            this.Controls.Add(this.btnCheck);
            this.Controls.Add(this.txtLog);
            this.Controls.Add(this.lblProgress);
            this.Controls.Add(this.progressBar);
            this.Controls.Add(this.lblSummary);
            this.Controls.Add(this.lblTitle);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Name = "PythonExportDependencyDialog";
            this.StartPosition = FormStartPosition.CenterParent;
            this.Text = "Python · ONNX 변환 의존성";
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private System.Windows.Forms.Label lblTitle;
        private System.Windows.Forms.Label lblSummary;
        private System.Windows.Forms.ProgressBar progressBar;
        private System.Windows.Forms.Label lblProgress;
        private System.Windows.Forms.TextBox txtLog;
        private System.Windows.Forms.Button btnCheck;
        private System.Windows.Forms.Button btnInstall;
        private System.Windows.Forms.Button btnClose;
    }
}
