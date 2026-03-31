namespace ImageScaler4x1._0
{
    partial class DownloadModelForm
    {
        private System.ComponentModel.IContainer components = null;

        private System.Windows.Forms.Label      lblModelSelect;
        private System.Windows.Forms.ComboBox   cmbModel;
        private System.Windows.Forms.Label      lblUrl;
        private System.Windows.Forms.TextBox    txtUrl;
        private System.Windows.Forms.Label      lblSavePath;
        private System.Windows.Forms.TextBox    txtSavePath;
        private System.Windows.Forms.Button     btnBrowseSave;
        private System.Windows.Forms.ProgressBar progressBar;
        private System.Windows.Forms.Label      lblDownloadStatus;
        private System.Windows.Forms.Button     btnDownload;
        private System.Windows.Forms.Button     btnClose;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            lblModelSelect    = new System.Windows.Forms.Label();
            cmbModel          = new System.Windows.Forms.ComboBox();
            lblUrl            = new System.Windows.Forms.Label();
            txtUrl            = new System.Windows.Forms.TextBox();
            lblSavePath       = new System.Windows.Forms.Label();
            txtSavePath       = new System.Windows.Forms.TextBox();
            btnBrowseSave     = new System.Windows.Forms.Button();
            progressBar       = new System.Windows.Forms.ProgressBar();
            lblDownloadStatus = new System.Windows.Forms.Label();
            btnDownload       = new System.Windows.Forms.Button();
            btnClose          = new System.Windows.Forms.Button();
            SuspendLayout();

            // lblModelSelect
            lblModelSelect.AutoSize = true;
            lblModelSelect.Location = new System.Drawing.Point(12, 14);
            lblModelSelect.Text     = "모델 선택:";

            // cmbModel
            cmbModel.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            cmbModel.Location      = new System.Drawing.Point(12, 32);
            cmbModel.Size          = new System.Drawing.Size(490, 23);
            cmbModel.TabIndex      = 0;
            cmbModel.SelectedIndexChanged += new System.EventHandler(cmbModel_SelectedIndexChanged);

            // lblUrl
            lblUrl.AutoSize = true;
            lblUrl.Location = new System.Drawing.Point(12, 67);
            lblUrl.Text     = "다운로드 URL:";

            // txtUrl
            txtUrl.Location = new System.Drawing.Point(12, 85);
            txtUrl.Size     = new System.Drawing.Size(490, 23);
            txtUrl.TabIndex = 1;

            // lblSavePath
            lblSavePath.AutoSize = true;
            lblSavePath.Location = new System.Drawing.Point(12, 120);
            lblSavePath.Text     = "저장 경로:";

            // txtSavePath
            txtSavePath.Location = new System.Drawing.Point(12, 138);
            txtSavePath.Size     = new System.Drawing.Size(440, 23);
            txtSavePath.TabIndex = 2;

            // btnBrowseSave
            btnBrowseSave.Location            = new System.Drawing.Point(456, 138);
            btnBrowseSave.Size                = new System.Drawing.Size(46, 23);
            btnBrowseSave.TabIndex            = 3;
            btnBrowseSave.Text                = "...";
            btnBrowseSave.UseVisualStyleBackColor = true;
            btnBrowseSave.Click              += new System.EventHandler(btnBrowseSave_Click);

            // progressBar
            progressBar.Location = new System.Drawing.Point(12, 177);
            progressBar.Size     = new System.Drawing.Size(490, 20);
            progressBar.TabIndex = 4;

            // lblDownloadStatus
            lblDownloadStatus.AutoSize = false;
            lblDownloadStatus.Location = new System.Drawing.Point(12, 203);
            lblDownloadStatus.Size     = new System.Drawing.Size(490, 32);
            lblDownloadStatus.Text     = "";

            // btnDownload
            btnDownload.Location            = new System.Drawing.Point(12, 248);
            btnDownload.Size                = new System.Drawing.Size(120, 30);
            btnDownload.TabIndex            = 5;
            btnDownload.Text                = "다운로드";
            btnDownload.UseVisualStyleBackColor = true;
            btnDownload.Click              += new System.EventHandler(btnDownload_Click);

            // btnClose
            btnClose.Location            = new System.Drawing.Point(382, 248);
            btnClose.Size                = new System.Drawing.Size(120, 30);
            btnClose.TabIndex            = 6;
            btnClose.Text                = "닫기";
            btnClose.UseVisualStyleBackColor = true;
            btnClose.Click              += (s, e) => Close();

            // DownloadModelForm
            AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            AutoScaleMode       = System.Windows.Forms.AutoScaleMode.Font;
            ClientSize          = new System.Drawing.Size(516, 294);
            FormBorderStyle     = System.Windows.Forms.FormBorderStyle.FixedDialog;
            MaximizeBox         = false;
            MinimizeBox         = false;
            StartPosition       = System.Windows.Forms.FormStartPosition.CenterParent;
            Name                = "DownloadModelForm";
            Text                = "RealESRGAN 모델 다운로드";
            Controls.Add(lblModelSelect);
            Controls.Add(cmbModel);
            Controls.Add(lblUrl);
            Controls.Add(txtUrl);
            Controls.Add(lblSavePath);
            Controls.Add(txtSavePath);
            Controls.Add(btnBrowseSave);
            Controls.Add(progressBar);
            Controls.Add(lblDownloadStatus);
            Controls.Add(btnDownload);
            Controls.Add(btnClose);
            ResumeLayout(false);
            PerformLayout();
        }
    }
}
