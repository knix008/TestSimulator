using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace FTPClientWin
{
    partial class MainForm
    {
        private IContainer components = null!;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            components = new Container();
            panelTop = new Panel();
            btnProfileDelete = new Button();
            btnProfileSave = new Button();
            comboProfile = new ComboBox();
            lblProfile = new Label();
            btnConnect = new Button();
            txtPassword = new TextBox();
            txtUser = new TextBox();
            txtPort = new TextBox();
            txtHost = new TextBox();
            comboProtocol = new ComboBox();
            lblPass = new Label();
            lblUser = new Label();
            lblPort = new Label();
            lblHost = new Label();
            lblProtocol = new Label();
            separatorH = new Panel();
            splitMain = new SplitContainer();
            splitFiles = new SplitContainer();
            panelServer = new Panel();
            treeViewServer = new TreeView();
            imageListFiles = new ImageList(components);
            lblServer = new Label();
            panelLocal = new Panel();
            treeViewLocal = new TreeView();
            lblLocal = new Label();
            panelLog = new Panel();
            richTextLog = new RichTextBox();
            lblLog = new Label();
            statusStrip = new StatusStrip();
            statusLabel = new ToolStripStatusLabel();
            statusProgress = new ToolStripProgressBar();
            panelTop.SuspendLayout();
            ((ISupportInitialize)splitMain).BeginInit();
            splitMain.Panel1.SuspendLayout();
            splitMain.Panel2.SuspendLayout();
            splitMain.SuspendLayout();
            ((ISupportInitialize)splitFiles).BeginInit();
            splitFiles.Panel1.SuspendLayout();
            splitFiles.Panel2.SuspendLayout();
            splitFiles.SuspendLayout();
            panelServer.SuspendLayout();
            panelLocal.SuspendLayout();
            panelLog.SuspendLayout();
            statusStrip.SuspendLayout();
            SuspendLayout();
            // 
            // panelTop
            // 
            panelTop.BackColor = Color.FromArgb(245, 245, 248);
            panelTop.Controls.Add(btnProfileDelete);
            panelTop.Controls.Add(btnProfileSave);
            panelTop.Controls.Add(comboProfile);
            panelTop.Controls.Add(lblProfile);
            panelTop.Controls.Add(btnConnect);
            panelTop.Controls.Add(txtPassword);
            panelTop.Controls.Add(txtUser);
            panelTop.Controls.Add(txtPort);
            panelTop.Controls.Add(txtHost);
            panelTop.Controls.Add(comboProtocol);
            panelTop.Controls.Add(lblPass);
            panelTop.Controls.Add(lblUser);
            panelTop.Controls.Add(lblPort);
            panelTop.Controls.Add(lblHost);
            panelTop.Controls.Add(lblProtocol);
            panelTop.Dock = DockStyle.Top;
            panelTop.Location = new Point(0, 0);
            panelTop.Name = "panelTop";
            panelTop.Size = new Size(1040, 102);
            panelTop.TabIndex = 0;
            // 
            // btnProfileDelete
            // 
            btnProfileDelete.FlatStyle = FlatStyle.System;
            btnProfileDelete.Location = new Point(341, 64);
            btnProfileDelete.Name = "btnProfileDelete";
            btnProfileDelete.Size = new Size(65, 26);
            btnProfileDelete.TabIndex = 14;
            btnProfileDelete.Text = "삭제";
            btnProfileDelete.UseVisualStyleBackColor = true;
            btnProfileDelete.Click += BtnProfileDelete_Click;
            // 
            // btnProfileSave
            // 
            btnProfileSave.FlatStyle = FlatStyle.System;
            btnProfileSave.Location = new Point(268, 64);
            btnProfileSave.Name = "btnProfileSave";
            btnProfileSave.Size = new Size(65, 26);
            btnProfileSave.TabIndex = 13;
            btnProfileSave.Text = "저장";
            btnProfileSave.UseVisualStyleBackColor = true;
            btnProfileSave.Click += BtnProfileSave_Click;
            // 
            // comboProfile
            // 
            comboProfile.DropDownStyle = ComboBoxStyle.DropDownList;
            comboProfile.FormattingEnabled = true;
            comboProfile.Location = new Point(60, 66);
            comboProfile.Name = "comboProfile";
            comboProfile.Size = new Size(200, 23);
            comboProfile.TabIndex = 12;
            comboProfile.SelectedIndexChanged += ComboProfile_SelectedIndexChanged;
            // 
            // lblProfile
            // 
            lblProfile.AutoSize = true;
            lblProfile.ForeColor = Color.FromArgb(80, 80, 90);
            lblProfile.Location = new Point(10, 70);
            lblProfile.Name = "lblProfile";
            lblProfile.Size = new Size(41, 15);
            lblProfile.TabIndex = 11;
            lblProfile.Text = "Profile";
            // 
            // btnConnect
            // 
            btnConnect.FlatAppearance.BorderSize = 0;
            btnConnect.FlatStyle = FlatStyle.Flat;
            btnConnect.Location = new Point(620, 26);
            btnConnect.Name = "btnConnect";
            btnConnect.Size = new Size(95, 28);
            btnConnect.TabIndex = 10;
            btnConnect.Text = "Connect";
            btnConnect.UseVisualStyleBackColor = false;
            btnConnect.Click += BtnConnect_Click;
            // 
            // txtPassword
            // 
            txtPassword.Location = new Point(505, 28);
            txtPassword.Name = "txtPassword";
            txtPassword.PlaceholderText = "password";
            txtPassword.Size = new Size(105, 23);
            txtPassword.TabIndex = 9;
            txtPassword.UseSystemPasswordChar = true;
            // 
            // txtUser
            // 
            txtUser.Location = new Point(390, 28);
            txtUser.Name = "txtUser";
            txtUser.PlaceholderText = "username";
            txtUser.Size = new Size(105, 23);
            txtUser.TabIndex = 8;
            // 
            // txtPort
            // 
            txtPort.Location = new Point(315, 28);
            txtPort.Name = "txtPort";
            txtPort.PlaceholderText = "21";
            txtPort.Size = new Size(65, 23);
            txtPort.TabIndex = 7;
            // 
            // txtHost
            // 
            txtHost.Location = new Point(105, 28);
            txtHost.Name = "txtHost";
            txtHost.PlaceholderText = "hostname or IP";
            txtHost.Size = new Size(200, 23);
            txtHost.TabIndex = 6;
            // 
            // comboProtocol
            // 
            comboProtocol.DropDownStyle = ComboBoxStyle.DropDownList;
            comboProtocol.FormattingEnabled = true;
            comboProtocol.Items.AddRange(new object[] { "FTP", "FTPS", "SFTP" });
            comboProtocol.SelectedIndex = 0;
            comboProtocol.Location = new Point(10, 28);
            comboProtocol.Name = "comboProtocol";
            comboProtocol.Size = new Size(85, 23);
            comboProtocol.TabIndex = 5;
            // 
            // lblPass
            // 
            lblPass.AutoSize = true;
            lblPass.ForeColor = Color.FromArgb(80, 80, 90);
            lblPass.Location = new Point(505, 10);
            lblPass.Name = "lblPass";
            lblPass.Size = new Size(57, 15);
            lblPass.TabIndex = 4;
            lblPass.Text = "Password";
            // 
            // lblUser
            // 
            lblUser.AutoSize = true;
            lblUser.ForeColor = Color.FromArgb(80, 80, 90);
            lblUser.Location = new Point(390, 10);
            lblUser.Name = "lblUser";
            lblUser.Size = new Size(30, 15);
            lblUser.TabIndex = 3;
            lblUser.Text = "User";
            // 
            // lblPort
            // 
            lblPort.AutoSize = true;
            lblPort.ForeColor = Color.FromArgb(80, 80, 90);
            lblPort.Location = new Point(315, 10);
            lblPort.Name = "lblPort";
            lblPort.Size = new Size(29, 15);
            lblPort.TabIndex = 2;
            lblPort.Text = "Port";
            // 
            // lblHost
            // 
            lblHost.AutoSize = true;
            lblHost.ForeColor = Color.FromArgb(80, 80, 90);
            lblHost.Location = new Point(105, 10);
            lblHost.Name = "lblHost";
            lblHost.Size = new Size(32, 15);
            lblHost.TabIndex = 1;
            lblHost.Text = "Host";
            // 
            // lblProtocol
            // 
            lblProtocol.AutoSize = true;
            lblProtocol.ForeColor = Color.FromArgb(80, 80, 90);
            lblProtocol.Location = new Point(10, 10);
            lblProtocol.Name = "lblProtocol";
            lblProtocol.Size = new Size(52, 15);
            lblProtocol.TabIndex = 0;
            lblProtocol.Text = "Protocol";
            // 
            // separatorH
            // 
            separatorH.BackColor = Color.FromArgb(195, 195, 205);
            separatorH.Dock = DockStyle.Top;
            separatorH.Location = new Point(0, 102);
            separatorH.Name = "separatorH";
            separatorH.Size = new Size(1040, 1);
            separatorH.TabIndex = 1;
            // 
            // splitMain
            // 
            splitMain.Dock = DockStyle.Fill;
            splitMain.Location = new Point(0, 103);
            splitMain.Name = "splitMain";
            splitMain.Orientation = Orientation.Horizontal;
            // 
            // splitMain.Panel1
            // 
            splitMain.Panel1.Controls.Add(splitFiles);
            // 
            // splitMain.Panel2
            // 
            splitMain.Panel2.Controls.Add(panelLog);
            splitMain.Size = new Size(1040, 575);
            splitMain.SplitterDistance = 402;
            splitMain.SplitterWidth = 5;
            splitMain.TabIndex = 2;
            // 
            // splitFiles
            // 
            splitFiles.Dock = DockStyle.Fill;
            splitFiles.Location = new Point(0, 0);
            splitFiles.Name = "splitFiles";
            // 
            // splitFiles.Panel1
            // 
            splitFiles.Panel1.Controls.Add(panelServer);
            // 
            // splitFiles.Panel2
            // 
            splitFiles.Panel2.Controls.Add(panelLocal);
            splitFiles.Size = new Size(1040, 402);
            splitFiles.SplitterDistance = 527;
            splitFiles.SplitterWidth = 60;
            splitFiles.TabIndex = 0;
            // 
            // panelServer
            // 
            panelServer.Controls.Add(treeViewServer);
            panelServer.Controls.Add(lblServer);
            panelServer.Dock = DockStyle.Fill;
            panelServer.Location = new Point(0, 0);
            panelServer.Name = "panelServer";
            panelServer.Size = new Size(527, 402);
            panelServer.TabIndex = 0;
            // 
            // treeViewServer
            // 
            treeViewServer.BorderStyle = BorderStyle.None;
            treeViewServer.Dock = DockStyle.Fill;
            treeViewServer.ImageIndex = 0;
            treeViewServer.ImageList = imageListFiles;
            treeViewServer.Location = new Point(0, 26);
            treeViewServer.Name = "treeViewServer";
            treeViewServer.SelectedImageIndex = 0;
            treeViewServer.Size = new Size(527, 376);
            treeViewServer.TabIndex = 0;
            // 
            // imageListFiles
            // 
            imageListFiles.ColorDepth = ColorDepth.Depth32Bit;
            imageListFiles.ImageSize = new Size(16, 16);
            imageListFiles.TransparentColor = Color.Transparent;
            // 
            // lblServer
            // 
            lblServer.BackColor = Color.FromArgb(228, 236, 250);
            lblServer.Dock = DockStyle.Top;
            lblServer.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblServer.ForeColor = Color.FromArgb(25, 55, 115);
            lblServer.Location = new Point(0, 0);
            lblServer.Name = "lblServer";
            lblServer.Padding = new Padding(6, 0, 0, 0);
            lblServer.Size = new Size(527, 26);
            lblServer.TabIndex = 1;
            lblServer.Text = "서버 (Server)";
            lblServer.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // panelLocal
            // 
            panelLocal.Controls.Add(treeViewLocal);
            panelLocal.Controls.Add(lblLocal);
            panelLocal.Dock = DockStyle.Fill;
            panelLocal.Location = new Point(0, 0);
            panelLocal.Name = "panelLocal";
            panelLocal.Size = new Size(508, 402);
            panelLocal.TabIndex = 0;
            // 
            // treeViewLocal
            // 
            treeViewLocal.BorderStyle = BorderStyle.None;
            treeViewLocal.Dock = DockStyle.Fill;
            treeViewLocal.ImageIndex = 0;
            treeViewLocal.ImageList = imageListFiles;
            treeViewLocal.Location = new Point(0, 26);
            treeViewLocal.Name = "treeViewLocal";
            treeViewLocal.SelectedImageIndex = 0;
            treeViewLocal.Size = new Size(508, 376);
            treeViewLocal.TabIndex = 0;
            // 
            // lblLocal
            // 
            lblLocal.BackColor = Color.FromArgb(228, 236, 250);
            lblLocal.Dock = DockStyle.Top;
            lblLocal.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblLocal.ForeColor = Color.FromArgb(25, 55, 115);
            lblLocal.Location = new Point(0, 0);
            lblLocal.Name = "lblLocal";
            lblLocal.Padding = new Padding(6, 0, 0, 0);
            lblLocal.Size = new Size(508, 26);
            lblLocal.TabIndex = 1;
            lblLocal.Text = "로컬 (Local)";
            lblLocal.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // panelLog
            // 
            panelLog.Controls.Add(richTextLog);
            panelLog.Controls.Add(lblLog);
            panelLog.Dock = DockStyle.Fill;
            panelLog.Location = new Point(0, 0);
            panelLog.Name = "panelLog";
            panelLog.Size = new Size(1040, 168);
            panelLog.TabIndex = 0;
            // 
            // richTextLog
            // 
            richTextLog.BackColor = Color.FromArgb(30, 30, 30);
            richTextLog.BorderStyle = BorderStyle.None;
            richTextLog.Dock = DockStyle.Fill;
            richTextLog.Font = new Font("Consolas", 9F);
            richTextLog.ForeColor = Color.FromArgb(180, 220, 180);
            richTextLog.Location = new Point(0, 24);
            richTextLog.Name = "richTextLog";
            richTextLog.ReadOnly = true;
            richTextLog.ScrollBars = RichTextBoxScrollBars.Vertical;
            richTextLog.Size = new Size(1040, 144);
            richTextLog.TabIndex = 0;
            richTextLog.Text = "";
            richTextLog.WordWrap = false;
            // 
            // lblLog
            // 
            lblLog.BackColor = Color.FromArgb(50, 50, 50);
            lblLog.Dock = DockStyle.Top;
            lblLog.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblLog.ForeColor = Color.White;
            lblLog.Location = new Point(0, 0);
            lblLog.Name = "lblLog";
            lblLog.Padding = new Padding(6, 0, 0, 0);
            lblLog.Size = new Size(1040, 24);
            lblLog.TabIndex = 1;
            lblLog.Text = "로그 (Log)";
            lblLog.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // statusStrip
            // 
            statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel, statusProgress });
            statusStrip.Location = new Point(0, 678);
            statusStrip.Name = "statusStrip";
            statusStrip.Size = new Size(1040, 22);
            statusStrip.TabIndex = 3;
            statusStrip.Text = "statusStrip";
            // 
            // statusLabel
            // 
            statusLabel.Name = "statusLabel";
            statusLabel.Size = new Size(1025, 17);
            statusLabel.Spring = true;
            statusLabel.Text = "준비됨";
            statusLabel.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // statusProgress
            // 
            statusProgress.Name = "statusProgress";
            statusProgress.Size = new Size(120, 16);
            statusProgress.Style = ProgressBarStyle.Marquee;
            statusProgress.Visible = false;
            // 
            // MainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1040, 700);
            Controls.Add(splitMain);
            Controls.Add(statusStrip);
            Controls.Add(separatorH);
            Controls.Add(panelTop);
            Font = new Font("Segoe UI", 9F);
            MinimumSize = new Size(840, 540);
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "FTP Client";
            Load += OnFormLoad;
            panelTop.ResumeLayout(false);
            panelTop.PerformLayout();
            splitMain.Panel1.ResumeLayout(false);
            splitMain.Panel2.ResumeLayout(false);
            ((ISupportInitialize)splitMain).EndInit();
            splitMain.ResumeLayout(false);
            splitFiles.Panel1.ResumeLayout(false);
            splitFiles.Panel2.ResumeLayout(false);
            ((ISupportInitialize)splitFiles).EndInit();
            splitFiles.ResumeLayout(false);
            panelServer.ResumeLayout(false);
            panelLocal.ResumeLayout(false);
            panelLog.ResumeLayout(false);
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Panel               panelTop        = null!;
        private Label               lblProtocol     = null!;
        private Label               lblHost         = null!;
        private Label               lblPort         = null!;
        private Label               lblUser         = null!;
        private Label               lblPass         = null!;
        private ComboBox            comboProtocol   = null!;
        private TextBox             txtHost         = null!;
        private TextBox             txtPort         = null!;
        private TextBox             txtUser         = null!;
        private TextBox             txtPassword     = null!;
        private Button              btnConnect      = null!;
        private Label               lblProfile      = null!;
        private ComboBox            comboProfile    = null!;
        private Button              btnProfileSave  = null!;
        private Button              btnProfileDelete= null!;
        private Panel               separatorH      = null!;
        private SplitContainer      splitMain       = null!;
        private SplitContainer      splitFiles      = null!;
        private Panel               panelServer     = null!;
        private Label               lblServer       = null!;
        private TreeView            treeViewServer  = null!;
        private Panel               panelLocal      = null!;
        private Label               lblLocal        = null!;
        private TreeView            treeViewLocal   = null!;
        private Panel               panelLog        = null!;
        private Label               lblLog          = null!;
        private RichTextBox         richTextLog     = null!;
        private StatusStrip           statusStrip     = null!;
        private ToolStripStatusLabel  statusLabel     = null!;
        private ToolStripProgressBar  statusProgress  = null!;
        private ImageList             imageListFiles  = null!;
    }
}
