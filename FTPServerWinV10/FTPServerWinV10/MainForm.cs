using System;
using System.Windows.Forms;
using System.Text.Json;
using System.IO;

namespace FTPServerWinV10
{
    public partial class MainForm : Form
    {
        private const string SettingsFile = "server_settings.json";
        private bool allowAnonymous = true;
        private OpenFileDialog openCertDialog = new OpenFileDialog();
        private string sharedFolder = string.Empty;
        private int clientCount = 0;
        private int uploadCount = 0;
        private long uploadBytes = 0;
        private int downloadCount = 0;
        private long downloadBytes = 0;
        private Server.FtpServerManager? ftpServerManager;
        private Server.LogManager? logManager;

        public MainForm()
        {
            InitializeComponent();
            txtUser.Enabled = txtPass.Enabled = !chkAnonymous.Checked;
            this.KeyPreview = true;
            this.KeyDown += MainForm_KeyDown;
            openCertDialog.Filter = "PFX 인증서 (*.pfx)|*.pfx|모든 파일 (*.*)|*.*";
            logManager = new Server.LogManager(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ftpserver.log"));
        }

        private void MainForm_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.F5)
            {
                SaveSettings();
                AddLog("설정 저장 완료 (F5)");
            }
            else if (e.KeyCode == Keys.F6)
            {
                LoadSettings();
                AddLog("설정 불러오기 완료 (F6)");
            }
        }

        private void SaveSettings()
        {
            var settings = new Server.ServerSettings
            {
                SharedFolder = txtFolder.Text,
                CertPath = txtCertPath.Text,
                CertPassword = txtCertPw.Text,
                AllowAnonymous = chkAnonymous.Checked,
                UserId = txtUser.Text,
                UserPassword = txtPass.Text,
                BufferSizeKb = (int)numBuffer.Value,
                MaxThreads = (int)numThreads.Value
            };
            Server.ServerSettings.Save(SettingsFile, settings);
        }

        private void LoadSettings()
        {
            var settings = Server.ServerSettings.Load(SettingsFile);
            if (settings == null) return;
            txtFolder.Text = settings.SharedFolder;
            txtCertPath.Text = settings.CertPath;
            txtCertPw.Text = settings.CertPassword;
            chkAnonymous.Checked = settings.AllowAnonymous;
            txtUser.Text = settings.UserId;
            txtPass.Text = settings.UserPassword;
            numBuffer.Value = Math.Max(numBuffer.Minimum, Math.Min(numBuffer.Maximum, settings.BufferSizeKb));
            numThreads.Value = Math.Max(numThreads.Minimum, Math.Min(numThreads.Maximum, settings.MaxThreads));
        }

        private void chkAnonymous_CheckedChanged(object sender, EventArgs e)
        {
            allowAnonymous = chkAnonymous.Checked;
            txtUser.Enabled = txtPass.Enabled = !allowAnonymous;
        }

        private void btnSelectFolder_Click(object sender, EventArgs e)
        {
            if (folderBrowserDialog1.ShowDialog() == DialogResult.OK)
            {
                sharedFolder = folderBrowserDialog1.SelectedPath;
                txtFolder.Text = sharedFolder;
                AddLog($"공개 폴더 선택: {sharedFolder}");
            }
        }

        private void btnStartServer_Click(object sender, EventArgs e)
        {
            int bufferKb = (int)numBuffer.Value;
            int threads = (int)numThreads.Value;
            if (string.IsNullOrEmpty(sharedFolder))
            {
                MessageBox.Show("공개할 폴더를 먼저 선택하세요.");
                return;
            }
            string certPath = txtCertPath.Text.Trim();
            string certPw = txtCertPw.Text;
            string user = txtUser.Text.Trim();
            string pass = txtPass.Text;
            if (!string.IsNullOrEmpty(certPath))
            {
                ftpServerManager = new Server.FtpsServerManager(sharedFolder, certPath, certPw, 990)
                {
                    AllowAnonymous = allowAnonymous,
                    UserId = user,
                    UserPassword = pass,
                    BufferSizeKb = bufferKb,
                    MaxThreads = threads
                };
                AddLog("FTPS(SSL) 서버 시작 요청됨");
            }
            else
            {
                ftpServerManager = new Server.FtpServerManager(sharedFolder, 21)
                {
                    AllowAnonymous = allowAnonymous,
                    UserId = user,
                    UserPassword = pass,
                    BufferSizeKb = bufferKb,
                    MaxThreads = threads
                };
                AddLog("FTP 서버 시작 요청됨");
            }
            ftpServerManager.OnLog += AddLog;
            ftpServerManager.OnClientCountChanged += UpdateClientCount;
            ftpServerManager.OnFileUploaded += OnFileUploaded;
            ftpServerManager.OnFileDownloaded += OnFileDownloaded;
            ftpServerManager.Start();
        }

        private void btnSelectCert_Click(object sender, EventArgs e)
        {
            if (openCertDialog.ShowDialog() == DialogResult.OK)
            {
                txtCertPath.Text = openCertDialog.FileName;
            }
        }

        private void btnStopServer_Click(object sender, EventArgs e)
        {
            ftpServerManager?.Stop();
            AddLog("FTP 서버 중지 요청됨");
            logManager?.Stop();
            uploadCount = 0;
            uploadBytes = 0;
            downloadCount = 0;
            downloadBytes = 0;
            UpdateStats();
        }

        private void OnFileUploaded(string fileName, long size)
        {
            uploadCount++;
            uploadBytes += size;
            UpdateStats();
        }

        private void OnFileDownloaded(string fileName, long size)
        {
            downloadCount++;
            downloadBytes += size;
            UpdateStats();
        }

        private void UpdateStats()
        {
            if (InvokeRequired)
            {
                Invoke(new Action(UpdateStats));
                return;
            }
            lblUploadStats.Text = $"업로드: {uploadCount} 파일 ({uploadBytes} Bytes)";
            lblDownloadStats.Text = $"다운로드: {downloadCount} 파일 ({downloadBytes} Bytes)";
        }

        private void UpdateClientCount(int count)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => UpdateClientCount(count)));
                return;
            }
            clientCount = count;
            lblClients.Text = $"접속 중인 클라이언트: {clientCount}";
        }

        private void AddLog(string message)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => AddLog(message)));
                return;
            }
            lstLog.Items.Insert(0, $"[{DateTime.Now:HH:mm:ss}] {message}");
            logManager?.WriteLog(message);
        }
    }
}
