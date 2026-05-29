namespace FTPServerWinV10
{
    partial class MainForm
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            pnlHeader = new Panel();
            lblTitle = new Label();
            btnStartServer = new Button();
            pnlProfile = new Panel();
            lblProfileTitle = new Label();
            cmbProfiles = new ComboBox();
            btnSaveProfile = new Button();
            btnDeleteProfile = new Button();
            grpProtocol = new GroupBox();
            chkEnableFtp = new CheckBox();
            numFtpPort = new NumericUpDown();
            chkEnableFtps = new CheckBox();
            numFtpsPort = new NumericUpDown();
            chkEnableSftp = new CheckBox();
            numSftpPort = new NumericUpDown();
            grpServer = new GroupBox();
            lblFolderTitle = new Label();
            lvFolders = new ListView();
            colVirtualName = new ColumnHeader();
            colPhysicalPath = new ColumnHeader();
            btnAddFolder = new Button();
            btnRemoveFolder = new Button();
            lblCert = new Label();
            txtCertPath = new TextBox();
            btnSelectCert = new Button();
            btnGenerateCert = new Button();
            lblCertPw = new Label();
            txtCertPw = new TextBox();
            grpAuth = new GroupBox();
            chkAnonymous = new CheckBox();
            lblUserListTitle = new Label();
            lvUsers = new ListView();
            colUserName = new ColumnHeader();
            colUserPass = new ColumnHeader();
            colUserPerm = new ColumnHeader();
            btnAddUser = new Button();
            btnRemoveUser = new Button();
            lblSpeed = new Label();
            numBuffer = new NumericUpDown();
            lblThreads = new Label();
            numThreads = new NumericUpDown();
            pnlStatus = new Panel();
            lblClients = new Label();
            lblTotalClients = new Label();
            lblUploadStats = new Label();
            lblDownloadStats = new Label();
            grpLog = new GroupBox();
            btnSaveLog = new Button();
            btnCopyLog = new Button();
            lstLog = new ListBox();
            statusStrip1 = new StatusStrip();
            tsslInfo = new ToolStripStatusLabel();
            folderBrowserDialog1 = new FolderBrowserDialog();
            pnlHeader.SuspendLayout();
            pnlProfile.SuspendLayout();
            grpProtocol.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)numFtpPort).BeginInit();
            ((System.ComponentModel.ISupportInitialize)numFtpsPort).BeginInit();
            ((System.ComponentModel.ISupportInitialize)numSftpPort).BeginInit();
            grpServer.SuspendLayout();
            grpAuth.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)numBuffer).BeginInit();
            ((System.ComponentModel.ISupportInitialize)numThreads).BeginInit();
            pnlStatus.SuspendLayout();
            grpLog.SuspendLayout();
            statusStrip1.SuspendLayout();
            SuspendLayout();
            //
            // pnlHeader
            //
            pnlHeader.BackColor = Color.FromArgb(33, 47, 61);
            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(btnStartServer);
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Name = "pnlHeader";
            pnlHeader.Size = new Size(904, 58);
            pnlHeader.TabIndex = 5;
            //
            // lblTitle
            //
            lblTitle.AutoSize = true;
            lblTitle.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(16, 14);
            lblTitle.Name = "lblTitle";
            lblTitle.Size = new Size(193, 25);
            lblTitle.TabIndex = 0;
            lblTitle.Text = "FTP Server Manager";
            //
            // btnStartServer  (toggle: 시작 ↔ 중지)
            //
            btnStartServer.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnStartServer.BackColor = Color.FromArgb(39, 174, 96);
            btnStartServer.Cursor = Cursors.Hand;
            btnStartServer.FlatAppearance.BorderSize = 0;
            btnStartServer.FlatStyle = FlatStyle.Flat;
            btnStartServer.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            btnStartServer.ForeColor = Color.White;
            btnStartServer.Location = new Point(792, 15);
            btnStartServer.Name = "btnStartServer";
            btnStartServer.Size = new Size(100, 28);
            btnStartServer.TabIndex = 1;
            btnStartServer.Text = "▶  시작";
            btnStartServer.UseVisualStyleBackColor = false;
            btnStartServer.Click += btnStartServer_Click;
            //
            // pnlProfile
            //
            pnlProfile.BackColor = Color.FromArgb(235, 242, 248);
            pnlProfile.Controls.Add(lblProfileTitle);
            pnlProfile.Controls.Add(cmbProfiles);
            pnlProfile.Controls.Add(btnSaveProfile);
            pnlProfile.Controls.Add(btnDeleteProfile);
            pnlProfile.Dock = DockStyle.Top;
            pnlProfile.Location = new Point(0, 58);
            pnlProfile.Name = "pnlProfile";
            pnlProfile.Size = new Size(904, 44);
            pnlProfile.TabIndex = 4;
            //
            // lblProfileTitle
            //
            lblProfileTitle.Font = new Font("Segoe UI", 9F);
            lblProfileTitle.Location = new Point(12, 8);
            lblProfileTitle.Name = "lblProfileTitle";
            lblProfileTitle.Size = new Size(60, 27);
            lblProfileTitle.TabIndex = 0;
            lblProfileTitle.Text = "프로파일:";
            lblProfileTitle.TextAlign = ContentAlignment.MiddleLeft;
            //
            // cmbProfiles
            //
            cmbProfiles.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbProfiles.Font = new Font("Segoe UI", 9F);
            cmbProfiles.Location = new Point(76, 9);
            cmbProfiles.Name = "cmbProfiles";
            cmbProfiles.Size = new Size(220, 23);
            cmbProfiles.TabIndex = 1;
            cmbProfiles.SelectedIndexChanged += cmbProfiles_SelectedIndexChanged;
            //
            // btnSaveProfile
            //
            btnSaveProfile.Cursor = Cursors.Hand;
            btnSaveProfile.FlatStyle = FlatStyle.System;
            btnSaveProfile.Font = new Font("Segoe UI", 9F);
            btnSaveProfile.Location = new Point(304, 7);
            btnSaveProfile.Name = "btnSaveProfile";
            btnSaveProfile.Size = new Size(68, 29);
            btnSaveProfile.TabIndex = 2;
            btnSaveProfile.Text = "저장";
            btnSaveProfile.Click += btnSaveProfile_Click;
            //
            // btnDeleteProfile
            //
            btnDeleteProfile.Cursor = Cursors.Hand;
            btnDeleteProfile.FlatStyle = FlatStyle.System;
            btnDeleteProfile.Font = new Font("Segoe UI", 9F);
            btnDeleteProfile.Location = new Point(378, 7);
            btnDeleteProfile.Name = "btnDeleteProfile";
            btnDeleteProfile.Size = new Size(68, 29);
            btnDeleteProfile.TabIndex = 3;
            btnDeleteProfile.Text = "삭제";
            btnDeleteProfile.Click += btnDeleteProfile_Click;
            //
            // grpProtocol
            //
            grpProtocol.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            grpProtocol.Controls.Add(chkEnableFtp);
            grpProtocol.Controls.Add(numFtpPort);
            grpProtocol.Controls.Add(chkEnableFtps);
            grpProtocol.Controls.Add(numFtpsPort);
            grpProtocol.Controls.Add(chkEnableSftp);
            grpProtocol.Controls.Add(numSftpPort);
            grpProtocol.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            grpProtocol.Location = new Point(12, 114);
            grpProtocol.Name = "grpProtocol";
            grpProtocol.Size = new Size(880, 52);
            grpProtocol.TabIndex = 7;
            grpProtocol.TabStop = false;
            grpProtocol.Text = "프로토콜 (동시 실행 가능)";
            //
            // chkEnableFtp
            //
            chkEnableFtp.AutoSize = true;
            chkEnableFtp.Checked = true;
            chkEnableFtp.CheckState = CheckState.Checked;
            chkEnableFtp.Font = new Font("Segoe UI", 9F);
            chkEnableFtp.Location = new Point(14, 22);
            chkEnableFtp.Name = "chkEnableFtp";
            chkEnableFtp.Size = new Size(48, 19);
            chkEnableFtp.TabIndex = 0;
            chkEnableFtp.Text = "FTP";
            chkEnableFtp.CheckedChanged += ProtocolCheckChanged;
            //
            // numFtpPort
            //
            numFtpPort.Font = new Font("Segoe UI", 9F);
            numFtpPort.Location = new Point(68, 20);
            numFtpPort.Maximum = new decimal(new int[] { 65535, 0, 0, 0 });
            numFtpPort.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            numFtpPort.Name = "numFtpPort";
            numFtpPort.Size = new Size(64, 23);
            numFtpPort.TabIndex = 1;
            numFtpPort.Value = new decimal(new int[] { 21, 0, 0, 0 });
            //
            // chkEnableFtps
            //
            chkEnableFtps.AutoSize = true;
            chkEnableFtps.Font = new Font("Segoe UI", 9F);
            chkEnableFtps.Location = new Point(150, 22);
            chkEnableFtps.Name = "chkEnableFtps";
            chkEnableFtps.Size = new Size(56, 19);
            chkEnableFtps.TabIndex = 2;
            chkEnableFtps.Text = "FTPS";
            chkEnableFtps.CheckedChanged += ProtocolCheckChanged;
            //
            // numFtpsPort
            //
            numFtpsPort.Font = new Font("Segoe UI", 9F);
            numFtpsPort.Location = new Point(212, 20);
            numFtpsPort.Maximum = new decimal(new int[] { 65535, 0, 0, 0 });
            numFtpsPort.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            numFtpsPort.Name = "numFtpsPort";
            numFtpsPort.Size = new Size(64, 23);
            numFtpsPort.TabIndex = 3;
            numFtpsPort.Value = new decimal(new int[] { 990, 0, 0, 0 });
            //
            // chkEnableSftp
            //
            chkEnableSftp.AutoSize = true;
            chkEnableSftp.Font = new Font("Segoe UI", 9F);
            chkEnableSftp.Location = new Point(294, 22);
            chkEnableSftp.Name = "chkEnableSftp";
            chkEnableSftp.Size = new Size(54, 19);
            chkEnableSftp.TabIndex = 4;
            chkEnableSftp.Text = "SFTP";
            chkEnableSftp.CheckedChanged += ProtocolCheckChanged;
            //
            // numSftpPort
            //
            numSftpPort.Font = new Font("Segoe UI", 9F);
            numSftpPort.Location = new Point(354, 20);
            numSftpPort.Maximum = new decimal(new int[] { 65535, 0, 0, 0 });
            numSftpPort.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            numSftpPort.Name = "numSftpPort";
            numSftpPort.Size = new Size(64, 23);
            numSftpPort.TabIndex = 5;
            numSftpPort.Value = new decimal(new int[] { 22, 0, 0, 0 });
            //
            // grpServer
            //
            grpServer.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            grpServer.Controls.Add(lblFolderTitle);
            grpServer.Controls.Add(lvFolders);
            grpServer.Controls.Add(btnAddFolder);
            grpServer.Controls.Add(btnRemoveFolder);
            grpServer.Controls.Add(lblCert);
            grpServer.Controls.Add(txtCertPath);
            grpServer.Controls.Add(btnSelectCert);
            grpServer.Controls.Add(btnGenerateCert);
            grpServer.Controls.Add(lblCertPw);
            grpServer.Controls.Add(txtCertPw);
            grpServer.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            grpServer.Location = new Point(12, 172);
            grpServer.Name = "grpServer";
            grpServer.Size = new Size(880, 271);
            grpServer.TabIndex = 3;
            grpServer.TabStop = false;
            grpServer.Text = "서버 설정";
            //
            // lblFolderTitle
            //
            lblFolderTitle.Font = new Font("Segoe UI", 9F);
            lblFolderTitle.Location = new Point(12, 22);
            lblFolderTitle.Name = "lblFolderTitle";
            lblFolderTitle.Size = new Size(90, 24);
            lblFolderTitle.TabIndex = 0;
            lblFolderTitle.Text = "공유 폴더 목록";
            lblFolderTitle.TextAlign = ContentAlignment.MiddleLeft;
            //
            // lvFolders
            //
            lvFolders.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lvFolders.Columns.AddRange(new ColumnHeader[] { colVirtualName, colPhysicalPath });
            lvFolders.Font = new Font("Segoe UI", 9F);
            lvFolders.FullRowSelect = true;
            lvFolders.GridLines = true;
            lvFolders.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            lvFolders.Location = new Point(12, 54);
            lvFolders.MultiSelect = false;
            lvFolders.Name = "lvFolders";
            lvFolders.Size = new Size(856, 176);
            lvFolders.TabIndex = 1;
            lvFolders.UseCompatibleStateImageBehavior = false;
            lvFolders.View = View.Details;
            //
            // colVirtualName
            //
            colVirtualName.Text = "가상 이름 (FTP 경로)";
            colVirtualName.Width = 180;
            //
            // colPhysicalPath
            //
            colPhysicalPath.Text = "실제 경로";
            colPhysicalPath.Width = 760;
            //
            // btnAddFolder
            //
            btnAddFolder.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnAddFolder.Cursor = Cursors.Hand;
            btnAddFolder.FlatStyle = FlatStyle.System;
            btnAddFolder.Font = new Font("Segoe UI", 9F);
            btnAddFolder.Location = new Point(728, 21);
            btnAddFolder.Name = "btnAddFolder";
            btnAddFolder.Size = new Size(68, 27);
            btnAddFolder.TabIndex = 2;
            btnAddFolder.Text = "추가";
            btnAddFolder.Click += btnAddFolder_Click;
            //
            // btnRemoveFolder
            //
            btnRemoveFolder.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnRemoveFolder.Cursor = Cursors.Hand;
            btnRemoveFolder.FlatStyle = FlatStyle.System;
            btnRemoveFolder.Font = new Font("Segoe UI", 9F);
            btnRemoveFolder.Location = new Point(800, 21);
            btnRemoveFolder.Name = "btnRemoveFolder";
            btnRemoveFolder.Size = new Size(68, 27);
            btnRemoveFolder.TabIndex = 3;
            btnRemoveFolder.Text = "제거";
            btnRemoveFolder.Click += btnRemoveFolder_Click;
            //
            // lblCert
            //
            lblCert.Font = new Font("Segoe UI", 9F);
            lblCert.Location = new Point(12, 238);
            lblCert.Name = "lblCert";
            lblCert.Size = new Size(72, 27);
            lblCert.TabIndex = 4;
            lblCert.Text = "SSL 인증서";
            lblCert.TextAlign = ContentAlignment.MiddleLeft;
            //
            // txtCertPath
            //
            txtCertPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            txtCertPath.Font = new Font("Segoe UI", 9F);
            txtCertPath.Location = new Point(88, 239);
            txtCertPath.Name = "txtCertPath";
            txtCertPath.Size = new Size(440, 23);
            txtCertPath.TabIndex = 5;
            //
            // btnSelectCert
            //
            btnSelectCert.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnSelectCert.Cursor = Cursors.Hand;
            btnSelectCert.FlatStyle = FlatStyle.System;
            btnSelectCert.Font = new Font("Segoe UI", 9F);
            btnSelectCert.Location = new Point(534, 236);
            btnSelectCert.Name = "btnSelectCert";
            btnSelectCert.Size = new Size(68, 29);
            btnSelectCert.TabIndex = 6;
            btnSelectCert.Text = "찾기";
            btnSelectCert.Click += btnSelectCert_Click;
            //
            // btnGenerateCert
            //
            btnGenerateCert.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnGenerateCert.Cursor = Cursors.Hand;
            btnGenerateCert.FlatStyle = FlatStyle.System;
            btnGenerateCert.Font = new Font("Segoe UI", 9F);
            btnGenerateCert.Location = new Point(608, 236);
            btnGenerateCert.Name = "btnGenerateCert";
            btnGenerateCert.Size = new Size(68, 29);
            btnGenerateCert.TabIndex = 7;
            btnGenerateCert.Text = "생성";
            btnGenerateCert.Click += btnGenerateCert_Click;
            //
            // lblCertPw
            //
            lblCertPw.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            lblCertPw.Font = new Font("Segoe UI", 9F);
            lblCertPw.Location = new Point(682, 238);
            lblCertPw.Name = "lblCertPw";
            lblCertPw.Size = new Size(72, 27);
            lblCertPw.TabIndex = 8;
            lblCertPw.Text = "인증서 암호";
            lblCertPw.TextAlign = ContentAlignment.MiddleLeft;
            //
            // txtCertPw
            //
            txtCertPw.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            txtCertPw.Font = new Font("Segoe UI", 9F);
            txtCertPw.Location = new Point(758, 239);
            txtCertPw.Name = "txtCertPw";
            txtCertPw.PasswordChar = '*';
            txtCertPw.Size = new Size(110, 23);
            txtCertPw.TabIndex = 9;
            //
            // grpAuth
            //
            grpAuth.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            grpAuth.Controls.Add(chkAnonymous);
            grpAuth.Controls.Add(lblUserListTitle);
            grpAuth.Controls.Add(lvUsers);
            grpAuth.Controls.Add(btnAddUser);
            grpAuth.Controls.Add(btnRemoveUser);
            grpAuth.Controls.Add(lblSpeed);
            grpAuth.Controls.Add(numBuffer);
            grpAuth.Controls.Add(lblThreads);
            grpAuth.Controls.Add(numThreads);
            grpAuth.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            grpAuth.Location = new Point(12, 449);
            grpAuth.Name = "grpAuth";
            grpAuth.Size = new Size(880, 196);
            grpAuth.TabIndex = 2;
            grpAuth.TabStop = false;
            grpAuth.Text = "인증 및 성능 설정";
            //
            // chkAnonymous
            //
            chkAnonymous.Font = new Font("Segoe UI", 9F);
            chkAnonymous.Location = new Point(12, 20);
            chkAnonymous.Name = "chkAnonymous";
            chkAnonymous.Size = new Size(90, 22);
            chkAnonymous.TabIndex = 0;
            chkAnonymous.Text = "익명 허용";
            chkAnonymous.CheckedChanged += chkAnonymous_CheckedChanged;
            //
            // lblUserListTitle
            //
            lblUserListTitle.Font = new Font("Segoe UI", 9F);
            lblUserListTitle.Location = new Point(12, 50);
            lblUserListTitle.Name = "lblUserListTitle";
            lblUserListTitle.Size = new Size(80, 22);
            lblUserListTitle.TabIndex = 1;
            lblUserListTitle.Text = "사용자 목록:";
            lblUserListTitle.TextAlign = ContentAlignment.MiddleLeft;
            //
            // lvUsers
            //
            lvUsers.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lvUsers.Columns.AddRange(new ColumnHeader[] { colUserName, colUserPass, colUserPerm });
            lvUsers.Font = new Font("Segoe UI", 9F);
            lvUsers.FullRowSelect = true;
            lvUsers.GridLines = true;
            lvUsers.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            lvUsers.Location = new Point(12, 74);
            lvUsers.MultiSelect = false;
            lvUsers.Name = "lvUsers";
            lvUsers.Size = new Size(754, 78);
            lvUsers.TabIndex = 2;
            lvUsers.UseCompatibleStateImageBehavior = false;
            lvUsers.View = View.Details;
            //
            // colUserName
            //
            colUserName.Text = "사용자 이름";
            colUserName.Width = 140;
            //
            // colUserPass
            //
            colUserPass.Text = "암호";
            colUserPass.Width = 100;
            //
            // colUserPerm
            //
            colUserPerm.Text = "권한";
            colUserPerm.Width = 120;
            //
            // btnAddUser
            //
            btnAddUser.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnAddUser.Cursor = Cursors.Hand;
            btnAddUser.FlatStyle = FlatStyle.System;
            btnAddUser.Font = new Font("Segoe UI", 9F);
            btnAddUser.Location = new Point(772, 74);
            btnAddUser.Name = "btnAddUser";
            btnAddUser.Size = new Size(96, 26);
            btnAddUser.TabIndex = 3;
            btnAddUser.Text = "＋ 추가";
            btnAddUser.Click += btnAddUser_Click;
            //
            // btnRemoveUser
            //
            btnRemoveUser.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnRemoveUser.Cursor = Cursors.Hand;
            btnRemoveUser.FlatStyle = FlatStyle.System;
            btnRemoveUser.Font = new Font("Segoe UI", 9F);
            btnRemoveUser.Location = new Point(772, 104);
            btnRemoveUser.Name = "btnRemoveUser";
            btnRemoveUser.Size = new Size(96, 26);
            btnRemoveUser.TabIndex = 4;
            btnRemoveUser.Text = "－ 삭제";
            btnRemoveUser.Click += btnRemoveUser_Click;
            //
            // lblSpeed
            //
            lblSpeed.Font = new Font("Segoe UI", 9F);
            lblSpeed.Location = new Point(12, 164);
            lblSpeed.Name = "lblSpeed";
            lblSpeed.Size = new Size(58, 24);
            lblSpeed.TabIndex = 5;
            lblSpeed.Text = "버퍼(KB)";
            lblSpeed.TextAlign = ContentAlignment.MiddleLeft;
            //
            // numBuffer
            //
            numBuffer.Font = new Font("Segoe UI", 9F);
            numBuffer.Location = new Point(74, 162);
            numBuffer.Maximum = new decimal(new int[] { 1024, 0, 0, 0 });
            numBuffer.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            numBuffer.Name = "numBuffer";
            numBuffer.Size = new Size(80, 23);
            numBuffer.TabIndex = 6;
            numBuffer.Value = new decimal(new int[] { 64, 0, 0, 0 });
            //
            // lblThreads
            //
            lblThreads.Font = new Font("Segoe UI", 9F);
            lblThreads.Location = new Point(166, 164);
            lblThreads.Name = "lblThreads";
            lblThreads.Size = new Size(50, 24);
            lblThreads.TabIndex = 7;
            lblThreads.Text = "스레드";
            lblThreads.TextAlign = ContentAlignment.MiddleLeft;
            //
            // numThreads
            //
            numThreads.Font = new Font("Segoe UI", 9F);
            numThreads.Location = new Point(220, 162);
            numThreads.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            numThreads.Name = "numThreads";
            numThreads.Size = new Size(80, 23);
            numThreads.TabIndex = 8;
            numThreads.Value = new decimal(new int[] { 10, 0, 0, 0 });
            //
            // pnlStatus
            //
            pnlStatus.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            pnlStatus.BackColor = Color.FromArgb(236, 240, 241);
            pnlStatus.Controls.Add(lblClients);
            pnlStatus.Controls.Add(lblTotalClients);
            pnlStatus.Controls.Add(lblUploadStats);
            pnlStatus.Controls.Add(lblDownloadStats);
            pnlStatus.Location = new Point(12, 657);
            pnlStatus.Name = "pnlStatus";
            pnlStatus.Size = new Size(880, 36);
            pnlStatus.TabIndex = 1;
            //
            // lblClients
            //
            lblClients.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblClients.ForeColor = Color.FromArgb(33, 47, 61);
            lblClients.Location = new Point(12, 10);
            lblClients.Name = "lblClients";
            lblClients.Size = new Size(110, 20);
            lblClients.TabIndex = 0;
            lblClients.Text = "현재 접속: 0";
            //
            // lblTotalClients
            //
            lblTotalClients.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblTotalClients.ForeColor = Color.FromArgb(127, 140, 141);
            lblTotalClients.Location = new Point(128, 10);
            lblTotalClients.Name = "lblTotalClients";
            lblTotalClients.Size = new Size(110, 20);
            lblTotalClients.TabIndex = 3;
            lblTotalClients.Text = "총 접속: 0";
            //
            // lblUploadStats
            //
            lblUploadStats.Font = new Font("Segoe UI", 9F);
            lblUploadStats.ForeColor = Color.FromArgb(39, 174, 96);
            lblUploadStats.Location = new Point(280, 10);
            lblUploadStats.Name = "lblUploadStats";
            lblUploadStats.Size = new Size(300, 20);
            lblUploadStats.TabIndex = 1;
            lblUploadStats.Text = "↑ 업로드: 0 파일 (0 B)";
            //
            // lblDownloadStats
            //
            lblDownloadStats.Font = new Font("Segoe UI", 9F);
            lblDownloadStats.ForeColor = Color.FromArgb(41, 128, 185);
            lblDownloadStats.Location = new Point(600, 10);
            lblDownloadStats.Name = "lblDownloadStats";
            lblDownloadStats.Size = new Size(300, 20);
            lblDownloadStats.TabIndex = 2;
            lblDownloadStats.Text = "↓ 다운로드: 0 파일 (0 B)";
            //
            // grpLog
            //
            grpLog.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            grpLog.Controls.Add(btnSaveLog);
            grpLog.Controls.Add(btnCopyLog);
            grpLog.Controls.Add(lstLog);
            grpLog.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            grpLog.Location = new Point(12, 705);
            grpLog.Name = "grpLog";
            grpLog.Size = new Size(880, 183);
            grpLog.TabIndex = 0;
            grpLog.TabStop = false;
            grpLog.Text = "실시간 로그";
            //
            // btnSaveLog
            //
            btnSaveLog.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            btnSaveLog.Cursor = Cursors.Hand;
            btnSaveLog.FlatStyle = FlatStyle.System;
            btnSaveLog.Font = new Font("Segoe UI", 9F);
            btnSaveLog.Location = new Point(648, 150);
            btnSaveLog.Name = "btnSaveLog";
            btnSaveLog.Size = new Size(106, 26);
            btnSaveLog.TabIndex = 2;
            btnSaveLog.Text = "로그 저장";
            //
            // btnCopyLog
            //
            btnCopyLog.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            btnCopyLog.Cursor = Cursors.Hand;
            btnCopyLog.FlatStyle = FlatStyle.System;
            btnCopyLog.Font = new Font("Segoe UI", 9F);
            btnCopyLog.Location = new Point(762, 150);
            btnCopyLog.Name = "btnCopyLog";
            btnCopyLog.Size = new Size(106, 26);
            btnCopyLog.TabIndex = 1;
            btnCopyLog.Text = "전체 복사";
            //
            // lstLog
            //
            lstLog.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            lstLog.BackColor = Color.FromArgb(25, 25, 25);
            lstLog.BorderStyle = BorderStyle.None;
            lstLog.Font = new Font("Consolas", 9F);
            lstLog.ForeColor = Color.FromArgb(180, 220, 180);
            lstLog.FormattingEnabled = true;
            lstLog.ItemHeight = 14;
            lstLog.Location = new Point(10, 24);
            lstLog.Name = "lstLog";
            lstLog.ScrollAlwaysVisible = true;
            lstLog.SelectionMode = SelectionMode.MultiExtended;
            lstLog.Size = new Size(858, 120);
            lstLog.TabIndex = 0;
            //
            // statusStrip1
            //
            statusStrip1.BackColor = Color.FromArgb(213, 219, 224);
            statusStrip1.Items.AddRange(new ToolStripItem[] { tsslInfo });
            statusStrip1.Location = new Point(0, 896);
            statusStrip1.Name = "statusStrip1";
            statusStrip1.Size = new Size(904, 22);
            statusStrip1.SizingGrip = false;
            statusStrip1.TabIndex = 6;
            //
            // tsslInfo
            //
            tsslInfo.Font = new Font("Segoe UI", 8.5F);
            tsslInfo.ForeColor = Color.FromArgb(70, 80, 90);
            tsslInfo.Name = "tsslInfo";
            tsslInfo.Size = new Size(374, 17);
            tsslInfo.Text = "F5: 저장  |  F6: 불러오기  |  FTP·FTPS·SFTP 개별 선택 후 동시 실행 가능";
            //
            // MainForm
            //
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(245, 246, 248);
            ClientSize = new Size(904, 918);
            Controls.Add(grpLog);
            Controls.Add(pnlStatus);
            Controls.Add(grpAuth);
            Controls.Add(grpServer);
            Controls.Add(grpProtocol);
            Controls.Add(pnlProfile);
            Controls.Add(pnlHeader);
            Controls.Add(statusStrip1);
            Font = new Font("Segoe UI", 9F);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MinimumSize = new Size(920, 820);
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "FTP Server Manager";
            FormClosing += MainForm_FormClosing;
            pnlHeader.ResumeLayout(false);
            pnlHeader.PerformLayout();
            pnlProfile.ResumeLayout(false);
            grpProtocol.ResumeLayout(false);
            grpProtocol.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)numFtpPort).EndInit();
            ((System.ComponentModel.ISupportInitialize)numFtpsPort).EndInit();
            ((System.ComponentModel.ISupportInitialize)numSftpPort).EndInit();
            grpServer.ResumeLayout(false);
            grpServer.PerformLayout();
            grpAuth.ResumeLayout(false);
            grpAuth.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)numBuffer).EndInit();
            ((System.ComponentModel.ISupportInitialize)numThreads).EndInit();
            pnlStatus.ResumeLayout(false);
            grpLog.ResumeLayout(false);
            statusStrip1.ResumeLayout(false);
            statusStrip1.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private System.Windows.Forms.Label lblSpeed;
        private System.Windows.Forms.NumericUpDown numBuffer;
        private System.Windows.Forms.NumericUpDown numThreads;
        private System.Windows.Forms.CheckBox chkAnonymous;
        private System.Windows.Forms.Label lblCert;
        private System.Windows.Forms.TextBox txtCertPath;
        private System.Windows.Forms.Button btnSelectCert;
        private System.Windows.Forms.Label lblCertPw;
        private System.Windows.Forms.TextBox txtCertPw;
        private System.Windows.Forms.FolderBrowserDialog folderBrowserDialog1;
        private System.Windows.Forms.Button btnStartServer;
        private System.Windows.Forms.Label lblClients;
        private System.Windows.Forms.Label lblTotalClients;
        private System.Windows.Forms.ListBox lstLog;
        private System.Windows.Forms.Button btnSaveLog;
        private System.Windows.Forms.Button btnCopyLog;
        private System.Windows.Forms.Label lblUploadStats;
        private System.Windows.Forms.Label lblDownloadStats;
        private System.Windows.Forms.Panel pnlHeader;
        private System.Windows.Forms.Label lblTitle;
        private System.Windows.Forms.Panel pnlProfile;
        private System.Windows.Forms.Label lblProfileTitle;
        private System.Windows.Forms.ComboBox cmbProfiles;
        private System.Windows.Forms.Button btnSaveProfile;
        private System.Windows.Forms.Button btnDeleteProfile;
        private System.Windows.Forms.GroupBox grpProtocol;
        private System.Windows.Forms.CheckBox chkEnableFtp;
        private System.Windows.Forms.NumericUpDown numFtpPort;
        private System.Windows.Forms.CheckBox chkEnableFtps;
        private System.Windows.Forms.NumericUpDown numFtpsPort;
        private System.Windows.Forms.CheckBox chkEnableSftp;
        private System.Windows.Forms.NumericUpDown numSftpPort;
        private System.Windows.Forms.GroupBox grpServer;
        private System.Windows.Forms.Label lblFolderTitle;
        private System.Windows.Forms.ListView lvFolders;
        private System.Windows.Forms.ColumnHeader colVirtualName;
        private System.Windows.Forms.ColumnHeader colPhysicalPath;
        private System.Windows.Forms.Button btnAddFolder;
        private System.Windows.Forms.Button btnRemoveFolder;
        private System.Windows.Forms.Button btnGenerateCert;
        private System.Windows.Forms.GroupBox grpAuth;
        private System.Windows.Forms.Label lblUserListTitle;
        private System.Windows.Forms.ListView lvUsers;
        private System.Windows.Forms.ColumnHeader colUserName;
        private System.Windows.Forms.ColumnHeader colUserPass;
        private System.Windows.Forms.ColumnHeader colUserPerm;
        private System.Windows.Forms.Button btnAddUser;
        private System.Windows.Forms.Button btnRemoveUser;
        private System.Windows.Forms.Label lblThreads;
        private System.Windows.Forms.Panel pnlStatus;
        private System.Windows.Forms.GroupBox grpLog;
        private System.Windows.Forms.StatusStrip statusStrip1;
        private System.Windows.Forms.ToolStripStatusLabel tsslInfo;
    }
}
