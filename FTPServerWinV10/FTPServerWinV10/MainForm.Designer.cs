namespace FTPServerWinV10
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

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            this.lblSpeed = new System.Windows.Forms.Label();
            this.numBuffer = new System.Windows.Forms.NumericUpDown();
            this.numThreads = new System.Windows.Forms.NumericUpDown();
            this.chkAnonymous = new System.Windows.Forms.CheckBox();
            this.lblUser = new System.Windows.Forms.Label();
            this.txtUser = new System.Windows.Forms.TextBox();
            this.lblPass = new System.Windows.Forms.Label();
            this.txtPass = new System.Windows.Forms.TextBox();
            this.lblCert = new System.Windows.Forms.Label();
            this.txtCertPath = new System.Windows.Forms.TextBox();
            this.btnSelectCert = new System.Windows.Forms.Button();
            this.lblCertPw = new System.Windows.Forms.Label();
            this.txtCertPw = new System.Windows.Forms.TextBox();
            this.folderBrowserDialog1 = new System.Windows.Forms.FolderBrowserDialog();
            this.btnSelectFolder = new System.Windows.Forms.Button();
            this.txtFolder = new System.Windows.Forms.TextBox();
            this.btnStartServer = new System.Windows.Forms.Button();
            this.btnStopServer = new System.Windows.Forms.Button();
            this.lblClients = new System.Windows.Forms.Label();
            this.lstLog = new System.Windows.Forms.ListBox();
            this.lblUploadStats = new System.Windows.Forms.Label();
            this.lblDownloadStats = new System.Windows.Forms.Label();
            ((System.ComponentModel.ISupportInitialize)(this.numBuffer)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.numThreads)).BeginInit();
            this.SuspendLayout();
            //
            // btnSelectFolder
            //
            this.btnSelectFolder.Location = new System.Drawing.Point(20, 20);
            this.btnSelectFolder.Name = "btnSelectFolder";
            this.btnSelectFolder.Size = new System.Drawing.Size(120, 30);
            this.btnSelectFolder.Text = "공개 폴더 선택";
            this.btnSelectFolder.UseVisualStyleBackColor = true;
            this.btnSelectFolder.Click += new System.EventHandler(this.btnSelectFolder_Click);
            //
            // txtFolder
            //
            this.txtFolder.Location = new System.Drawing.Point(150, 22);
            this.txtFolder.Name = "txtFolder";
            this.txtFolder.ReadOnly = true;
            this.txtFolder.Size = new System.Drawing.Size(500, 27);
            //
            // btnStartServer
            //
            this.btnStartServer.Location = new System.Drawing.Point(670, 20);
            this.btnStartServer.Name = "btnStartServer";
            this.btnStartServer.Size = new System.Drawing.Size(100, 30);
            this.btnStartServer.Text = "서버 시작";
            this.btnStartServer.UseVisualStyleBackColor = true;
            this.btnStartServer.Click += new System.EventHandler(this.btnStartServer_Click);
            //
            // btnStopServer
            //
            this.btnStopServer.Location = new System.Drawing.Point(780, 20);
            this.btnStopServer.Name = "btnStopServer";
            this.btnStopServer.Size = new System.Drawing.Size(100, 30);
            this.btnStopServer.Text = "서버 중지";
            this.btnStopServer.UseVisualStyleBackColor = true;
            this.btnStopServer.Click += new System.EventHandler(this.btnStopServer_Click);
            //
            // lblCert
            //
            this.lblCert.Location = new System.Drawing.Point(20, 50);
            this.lblCert.Name = "lblCert";
            this.lblCert.Size = new System.Drawing.Size(100, 23);
            this.lblCert.Text = "SSL 인증서";
            //
            // txtCertPath
            //
            this.txtCertPath.Location = new System.Drawing.Point(120, 50);
            this.txtCertPath.Name = "txtCertPath";
            this.txtCertPath.Size = new System.Drawing.Size(400, 27);
            //
            // btnSelectCert
            //
            this.btnSelectCert.Location = new System.Drawing.Point(530, 48);
            this.btnSelectCert.Name = "btnSelectCert";
            this.btnSelectCert.Size = new System.Drawing.Size(80, 30);
            this.btnSelectCert.Text = "찾기";
            this.btnSelectCert.UseVisualStyleBackColor = true;
            this.btnSelectCert.Click += new System.EventHandler(this.btnSelectCert_Click);
            //
            // lblCertPw
            //
            this.lblCertPw.Location = new System.Drawing.Point(620, 50);
            this.lblCertPw.Name = "lblCertPw";
            this.lblCertPw.Size = new System.Drawing.Size(80, 23);
            this.lblCertPw.Text = "비밀번호";
            //
            // txtCertPw
            //
            this.txtCertPw.Location = new System.Drawing.Point(700, 50);
            this.txtCertPw.Name = "txtCertPw";
            this.txtCertPw.Size = new System.Drawing.Size(180, 27);
            this.txtCertPw.PasswordChar = '*';
            //
            // chkAnonymous
            //
            this.chkAnonymous.Location = new System.Drawing.Point(20, 82);
            this.chkAnonymous.Name = "chkAnonymous";
            this.chkAnonymous.Size = new System.Drawing.Size(100, 23);
            this.chkAnonymous.Text = "익명 허용";
            this.chkAnonymous.UseVisualStyleBackColor = true;
            this.chkAnonymous.CheckedChanged += new System.EventHandler(this.chkAnonymous_CheckedChanged);
            //
            // lblUser
            //
            this.lblUser.Location = new System.Drawing.Point(130, 84);
            this.lblUser.Name = "lblUser";
            this.lblUser.Size = new System.Drawing.Size(60, 23);
            this.lblUser.Text = "사용자";
            //
            // txtUser
            //
            this.txtUser.Location = new System.Drawing.Point(195, 82);
            this.txtUser.Name = "txtUser";
            this.txtUser.Size = new System.Drawing.Size(120, 27);
            //
            // lblPass
            //
            this.lblPass.Location = new System.Drawing.Point(325, 84);
            this.lblPass.Name = "lblPass";
            this.lblPass.Size = new System.Drawing.Size(60, 23);
            this.lblPass.Text = "비밀번호";
            //
            // txtPass
            //
            this.txtPass.Location = new System.Drawing.Point(390, 82);
            this.txtPass.Name = "txtPass";
            this.txtPass.PasswordChar = '*';
            this.txtPass.Size = new System.Drawing.Size(120, 27);
            //
            // lblSpeed
            //
            this.lblSpeed.Location = new System.Drawing.Point(525, 84);
            this.lblSpeed.Name = "lblSpeed";
            this.lblSpeed.Size = new System.Drawing.Size(100, 23);
            this.lblSpeed.Text = "버퍼(KB)/스레드";
            //
            // numBuffer
            //
            this.numBuffer.Location = new System.Drawing.Point(630, 82);
            this.numBuffer.Maximum = new decimal(new int[] { 1024, 0, 0, 0 });
            this.numBuffer.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            this.numBuffer.Name = "numBuffer";
            this.numBuffer.Size = new System.Drawing.Size(70, 27);
            this.numBuffer.Value = new decimal(new int[] { 64, 0, 0, 0 });
            //
            // numThreads
            //
            this.numThreads.Location = new System.Drawing.Point(710, 82);
            this.numThreads.Maximum = new decimal(new int[] { 100, 0, 0, 0 });
            this.numThreads.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            this.numThreads.Name = "numThreads";
            this.numThreads.Size = new System.Drawing.Size(70, 27);
            this.numThreads.Value = new decimal(new int[] { 10, 0, 0, 0 });
            //
            // lblClients
            //
            this.lblClients.Location = new System.Drawing.Point(20, 110);
            this.lblClients.Name = "lblClients";
            this.lblClients.Size = new System.Drawing.Size(300, 23);
            this.lblClients.Text = "접속 중인 클라이언트: 0";
            //
            // lblUploadStats
            //
            this.lblUploadStats.Location = new System.Drawing.Point(350, 110);
            this.lblUploadStats.Name = "lblUploadStats";
            this.lblUploadStats.Size = new System.Drawing.Size(250, 23);
            this.lblUploadStats.Text = "업로드: 0 파일 (0 Bytes)";
            //
            // lblDownloadStats
            //
            this.lblDownloadStats.Location = new System.Drawing.Point(620, 110);
            this.lblDownloadStats.Name = "lblDownloadStats";
            this.lblDownloadStats.Size = new System.Drawing.Size(250, 23);
            this.lblDownloadStats.Text = "다운로드: 0 파일 (0 Bytes)";
            //
            // lstLog
            //
            this.lstLog.FormattingEnabled = true;
            this.lstLog.ItemHeight = 20;
            this.lstLog.Location = new System.Drawing.Point(20, 150);
            this.lstLog.Name = "lstLog";
            this.lstLog.Size = new System.Drawing.Size(860, 460);
            //
            // MainForm
            //
            this.AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(900, 640);
            this.Controls.Add(this.btnSelectFolder);
            this.Controls.Add(this.txtFolder);
            this.Controls.Add(this.btnStartServer);
            this.Controls.Add(this.btnStopServer);
            this.Controls.Add(this.lblCert);
            this.Controls.Add(this.txtCertPath);
            this.Controls.Add(this.btnSelectCert);
            this.Controls.Add(this.lblCertPw);
            this.Controls.Add(this.txtCertPw);
            this.Controls.Add(this.chkAnonymous);
            this.Controls.Add(this.lblUser);
            this.Controls.Add(this.txtUser);
            this.Controls.Add(this.lblPass);
            this.Controls.Add(this.txtPass);
            this.Controls.Add(this.lblClients);
            this.Controls.Add(this.lblUploadStats);
            this.Controls.Add(this.lblDownloadStats);
            this.Controls.Add(this.lstLog);
            this.Controls.Add(this.lblSpeed);
            this.Controls.Add(this.numBuffer);
            this.Controls.Add(this.numThreads);
            this.Name = "MainForm";
            this.Text = "FTPServerWinV10";
            ((System.ComponentModel.ISupportInitialize)(this.numBuffer)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.numThreads)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.Label lblSpeed;
        private System.Windows.Forms.NumericUpDown numBuffer;
        private System.Windows.Forms.NumericUpDown numThreads;
        private System.Windows.Forms.CheckBox chkAnonymous;
        private System.Windows.Forms.Label lblUser;
        private System.Windows.Forms.TextBox txtUser;
        private System.Windows.Forms.Label lblPass;
        private System.Windows.Forms.TextBox txtPass;
        private System.Windows.Forms.Label lblCert;
        private System.Windows.Forms.TextBox txtCertPath;
        private System.Windows.Forms.Button btnSelectCert;
        private System.Windows.Forms.Label lblCertPw;
        private System.Windows.Forms.TextBox txtCertPw;
        private System.Windows.Forms.FolderBrowserDialog folderBrowserDialog1;
        private System.Windows.Forms.Button btnSelectFolder;
        private System.Windows.Forms.TextBox txtFolder;
        private System.Windows.Forms.Button btnStartServer;
        private System.Windows.Forms.Button btnStopServer;
        private System.Windows.Forms.Label lblClients;
        private System.Windows.Forms.ListBox lstLog;
        private System.Windows.Forms.Label lblUploadStats;
        private System.Windows.Forms.Label lblDownloadStats;
    }
}
