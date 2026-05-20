using System;
using System.Windows.Forms;

namespace FTPClientWin
{
    public class MainForm : Form
    {
        private TreeView treeViewServer;
        private TreeView treeViewLocal;
        private ComboBox comboProtocol;
        private TextBox txtHost;
        private TextBox txtPort;
        private TextBox txtUser;
        private TextBox txtPassword;
        private Button btnConnect;
        private Button btnUpload;
        private Button btnDownload;
        private SplitContainer splitContainer;
        private Label lblStatus;

        public MainForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "FTP Client";
            this.Width = 1000;
            this.Height = 600;

            splitContainer = new SplitContainer();
            splitContainer.Dock = DockStyle.Fill;
            splitContainer.Orientation = Orientation.Vertical;
            splitContainer.SplitterDistance = 500;

            treeViewServer = new TreeView { Dock = DockStyle.Fill };
            treeViewLocal = new TreeView { Dock = DockStyle.Fill };

            splitContainer.Panel1.Controls.Add(treeViewServer);
            splitContainer.Panel2.Controls.Add(treeViewLocal);

            comboProtocol = new ComboBox { Left = 10, Top = 10, Width = 80 };
            comboProtocol.Items.AddRange(new string[] { "FTP", "FTPS", "SFTP" });
            comboProtocol.SelectedIndex = 0;

            txtHost = new TextBox { Left = 100, Top = 10, Width = 150, PlaceholderText = "Host" };
            txtPort = new TextBox { Left = 260, Top = 10, Width = 50, PlaceholderText = "Port" };
            txtUser = new TextBox { Left = 320, Top = 10, Width = 100, PlaceholderText = "User" };
            txtPassword = new TextBox { Left = 430, Top = 10, Width = 100, PlaceholderText = "Password", UseSystemPasswordChar = true };
            btnConnect = new Button { Left = 540, Top = 8, Width = 80, Text = "Connect" };
            btnConnect.Click += BtnConnect_Click;

            btnUpload = new Button { Left = 630, Top = 8, Width = 80, Text = "Upload" };
            btnDownload = new Button { Left = 720, Top = 8, Width = 80, Text = "Download" };

            lblStatus = new Label { Left = 10, Top = 40, Width = 800, Height = 20, Text = "Status: Ready" };

            var panelTop = new Panel { Height = 70, Dock = DockStyle.Top };
            panelTop.Controls.Add(comboProtocol);
            panelTop.Controls.Add(txtHost);
            panelTop.Controls.Add(txtPort);
            panelTop.Controls.Add(txtUser);
            panelTop.Controls.Add(txtPassword);
            panelTop.Controls.Add(btnConnect);
            panelTop.Controls.Add(btnUpload);
            panelTop.Controls.Add(btnDownload);
            panelTop.Controls.Add(lblStatus);

            this.Controls.Add(splitContainer);
            this.Controls.Add(panelTop);
        }

        private void BtnConnect_Click(object sender, EventArgs e)
        {
            // 연결 로직 구현 예정
            lblStatus.Text = $"Status: {comboProtocol.SelectedItem} 연결 시도 중...";
        }
    }
}
