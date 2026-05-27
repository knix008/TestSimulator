using System;
using System.Drawing;
using System.IO.Ports;
using System.Net.Sockets;
using System.Text;
using System.Windows.Forms;
using System.Collections.Generic;

namespace TerminalWinV10
{
    public partial class MainForm : Form
    {
        private SerialPort serialPort;
        private TcpClient tcpClient;
        private NetworkStream tcpStream;
        private System.Net.Security.SslStream sslStream;
        private List<TerminalProfile> profiles = new List<TerminalProfile>();
        private bool loadingProfile = false;

        public MainForm()
        {
            InitializeComponent();
            if (System.ComponentModel.LicenseManager.UsageMode != System.ComponentModel.LicenseUsageMode.Designtime)
            {
                LoadProfileList();
                cmbProfile.SelectedIndexChanged += cmbProfile_SelectedIndexChanged;
                cmbConnectionType.SelectedIndexChanged += cmbConnectionType_SelectedIndexChanged;
                InitPortList();
                InitBaudList();
                cmbConnectionType.SelectedIndex = 0;
                UpdateInputFields();
            }
        }

        private void InitPortList()
        {
            cmbPort.Items.Clear();
            foreach (var port in SerialPort.GetPortNames())
                cmbPort.Items.Add(port);
            if (cmbPort.Items.Count == 0)
                cmbPort.Items.Add("COM1");
            cmbPort.SelectedIndex = 0;
        }

        private void InitBaudList()
        {
            cmbBaud.Items.Clear();
            var baudRates = new[] { "9600", "19200", "38400", "57600", "115200" };
            cmbBaud.Items.AddRange(baudRates);
            cmbBaud.SelectedIndex = 0;
        }

        private void cmbConnectionType_SelectedIndexChanged(object sender, EventArgs e)
        {
            UpdateInputFields();
        }

        private void UpdateInputFields()
        {
            string type = cmbConnectionType.SelectedItem?.ToString() ?? "Serial";
            if (type == "Serial")
            {
                cmbPort.Visible = true;
                cmbPort.Enabled = true;
                txtTcpPort.Visible = false;
                cmbBaud.Enabled = true;
                txtIP.Enabled = false;
                txtIP.BackColor = SystemColors.ControlLight;
                cmbPort.BackColor = SystemColors.Window;
                cmbBaud.BackColor = SystemColors.Window;
                chkSsl.Enabled = false;
            }
            else if (type == "TCP/IP")
            {
                cmbPort.Visible = false;
                txtTcpPort.Visible = true;
                cmbBaud.Enabled = false;
                txtIP.Enabled = true;
                txtIP.BackColor = SystemColors.Window;
                cmbBaud.BackColor = SystemColors.ControlLight;
                chkSsl.Enabled = true;
            }
        }

        private void LoadProfileList()
        {
            loadingProfile = true;
            profiles = ProfileManager.LoadProfiles();
            cmbProfile.Items.Clear();
            foreach (var p in profiles)
                cmbProfile.Items.Add(p.Name);
            if (cmbProfile.Items.Count > 0)
                cmbProfile.SelectedIndex = 0;
            loadingProfile = false;
        }

        private void btnSaveProfile_Click(object sender, EventArgs e)
        {
            string name = Microsoft.VisualBasic.Interaction.InputBox("프로필 이름을 입력하세요.", "프로필 저장", "");
            if (string.IsNullOrWhiteSpace(name)) return;
            string connType = cmbConnectionType.SelectedItem?.ToString() ?? "";
            string portVal = connType == "Serial" ? (cmbPort.SelectedItem?.ToString() ?? "") : (txtTcpPort.Text ?? "");
            var profile = new TerminalProfile
            {
                Name = name,
                ConnectionType = connType,
                Port = portVal,
                Baud = cmbBaud.SelectedItem?.ToString() ?? "",
                IP = txtIP.Text
            };
            profiles.RemoveAll(p => p.Name == name);
            profiles.Add(profile);
            ProfileManager.SaveProfiles(profiles);
            LoadProfileList();
            cmbProfile.SelectedItem = name;
        }

        private void btnDeleteProfile_Click(object sender, EventArgs e)
        {
            if (cmbProfile.SelectedItem == null) return;
            string name = cmbProfile.SelectedItem.ToString();
            profiles.RemoveAll(p => p.Name == name);
            ProfileManager.SaveProfiles(profiles);
            LoadProfileList();
        }

        private void cmbProfile_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (loadingProfile) return;
            if (cmbProfile.SelectedItem == null) return;
            var profile = profiles.Find(p => p.Name == cmbProfile.SelectedItem.ToString());
            if (profile == null) return;
            cmbConnectionType.SelectedItem = profile.ConnectionType;
            if (profile.ConnectionType == "Serial")
            {
                if (cmbPort.Items.Contains(profile.Port))
                    cmbPort.SelectedItem = profile.Port;
                else if (cmbPort.Items.Count > 0)
                    cmbPort.SelectedIndex = 0;
                txtTcpPort.Text = "";
            }
            else if (profile.ConnectionType == "TCP/IP")
            {
                txtTcpPort.Text = profile.Port;
            }
            if (cmbBaud.Items.Contains(profile.Baud))
                cmbBaud.SelectedItem = profile.Baud;
            else if (cmbBaud.Items.Count > 0)
                cmbBaud.SelectedIndex = 0;
            txtIP.Text = profile.IP;
            UpdateInputFields();
        }

        private void btnConnect_Click(object sender, EventArgs e)
        {
            if (cmbConnectionType.SelectedItem.ToString() == "Serial")
            {
                serialPort = new SerialPort(cmbPort.SelectedItem.ToString(), int.Parse(cmbBaud.SelectedItem.ToString()));
                serialPort.DataReceived += SerialPort_DataReceived;
                serialPort.Open();
                AppendText($"[Serial] Connected to {cmbPort.SelectedItem}\n");
            }
            else if (cmbConnectionType.SelectedItem.ToString() == "TCP/IP")
            {
                tcpClient = new TcpClient(txtIP.Text, int.Parse(txtTcpPort.Text));
                tcpStream = tcpClient.GetStream();
                if (chkSsl.Checked)
                {
                    sslStream = new System.Net.Security.SslStream(tcpStream, false, (sender2, cert, chain, errors) => true);
                    sslStream.AuthenticateAsClient(txtIP.Text);
                    BeginReadTCP(true);
                    AppendText($"[TCP/IP:SSL] Connected to {txtIP.Text}:{cmbPort.SelectedItem}\n");
                }
                else
                {
                    BeginReadTCP(false);
                    AppendText($"[TCP/IP] Connected to {txtIP.Text}:{cmbPort.SelectedItem}\n");
                }
            }
        }

        private void btnDisconnect_Click(object sender, EventArgs e)
        {
            if (serialPort != null && serialPort.IsOpen)
            {
                serialPort.Close();
                AppendText("[Serial] Disconnected\n");
            }
            if (tcpClient != null && tcpClient.Connected)
            {
                tcpStream?.Close();
                sslStream?.Close();
                tcpClient.Close();
                AppendText("[TCP/IP] Disconnected\n");
            }
        }

        private void SerialPort_DataReceived(object sender, SerialDataReceivedEventArgs e)
        {
            string data = serialPort.ReadExisting();
            AppendText(data);
        }

        private void BeginReadTCP(bool useSsl)
        {
            byte[] buffer = new byte[1024];
            if (useSsl)
            {
                sslStream.BeginRead(buffer, 0, buffer.Length, ar =>
                {
                    int bytesRead = sslStream.EndRead(ar);
                    if (bytesRead > 0)
                    {
                        string data = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        AppendText(data);
                        BeginReadTCP(true);
                    }
                }, null);
            }
            else
            {
                tcpStream.BeginRead(buffer, 0, buffer.Length, ar =>
                {
                    int bytesRead = tcpStream.EndRead(ar);
                    if (bytesRead > 0)
                    {
                        string data = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        AppendText(data);
                        BeginReadTCP(false);
                    }
                }, null);
            }
        }

        private void AppendText(string text)
        {
            if (InvokeRequired)
            {
                Invoke(new Action<string>(AppendText), text);
                return;
            }
            rtbTerminal.AppendText(text);
            rtbTerminal.ScrollToCaret();
        }
    }
}
