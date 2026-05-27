using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO.Ports;
using System.Windows.Forms;

namespace TerminalWinV10
{
    public partial class MainForm : Form
    {
        private List<TerminalProfile> profiles = new List<TerminalProfile>();
        private bool loadingProfile;
        private bool syncingToolbar;
        private int _tabCounter;

        public MainForm()
        {
            InitializeComponent();
            if (System.ComponentModel.LicenseManager.UsageMode != System.ComponentModel.LicenseUsageMode.Designtime)
            {
                terminalTabs.AddTabRequested += (_, _) => AddTerminalTab();
                terminalTabs.SelectedPanelChanged += (_, e) => SyncToolbarFromPanel(e.Panel);
                LoadProfileList();
                InitPortList();
                InitBaudList();
                cmbConnectionType.SelectedIndex = 0;
                UpdateInputFields();
                AddTerminalTab();
            }
        }

        private TerminalPanel? ActivePanel => terminalTabs.SelectedPanel;

        private void AddTerminalTab()
        {
            try
            {
                _tabCounter++;
                var panel = terminalTabs.AddTab($"Terminal {_tabCounter}");
                SyncToolbarFromPanel(panel);
            }
            catch (Exception ex)
            {
                TerminalErrorDetailsForm.Show(this, "Terminal add error", ex);
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
            cmbBaud.Items.AddRange(new object[] { "9600", "19200", "38400", "57600", "115200" });
            cmbBaud.SelectedIndex = 0;
        }

        private void cmbConnectionType_SelectedIndexChanged(object sender, EventArgs e)
        {
            UpdateInputFields();
            PushToolbarToActivePanel();
        }

        private void UpdateInputFields()
        {
            string type = cmbConnectionType.SelectedItem?.ToString() ?? ConnectionTypes.Local;

            bool serial = type == ConnectionTypes.Serial;
            bool tcp = type == ConnectionTypes.TcpIp;
            bool local = type == ConnectionTypes.Local;

            SetFieldEnabled(cmbPort, serial);
            SetFieldEnabled(cmbBaud, serial);
            SetFieldEnabled(txtTcpPort, tcp);
            SetFieldEnabled(txtIP, tcp);
            chkSsl.Enabled = tcp;
            SetFieldEnabled(lblLocalShell, local);
            SetFieldEnabled(txtLocalShell, local);
        }

        private static void SetFieldEnabled(Control control, bool enabled)
        {
            control.Enabled = enabled;
            if (control is TextBox or ComboBox)
                control.BackColor = enabled ? SystemColors.Window : SystemColors.ControlLight;
        }

        private TerminalConnectionSettings ReadToolbarSettings()
        {
            var type = cmbConnectionType.SelectedItem?.ToString() ?? ConnectionTypes.Local;
            return new TerminalConnectionSettings
            {
                ConnectionType = type,
                SerialPort = cmbPort.SelectedItem?.ToString() ?? "COM1",
                Baud = cmbBaud.SelectedItem?.ToString() ?? "9600",
                Ip = txtIP.Text.Trim(),
                TcpPort = txtTcpPort.Text.Trim(),
                UseSsl = chkSsl.Checked,
                LocalShell = txtLocalShell.Text.Trim()
            };
        }

        private void PushToolbarToActivePanel()
        {
            if (syncingToolbar) return;
            var panel = ActivePanel;
            if (panel == null) return;
            panel.ApplySettings(ReadToolbarSettings());
            UpdateActiveTabTitle();
        }

        private void SyncToolbarFromPanel(TerminalPanel panel)
        {
            syncingToolbar = true;
            try
            {
                var s = panel.Settings;
                cmbConnectionType.SelectedItem = s.ConnectionType;
                if (cmbConnectionType.SelectedIndex < 0)
                    cmbConnectionType.SelectedIndex = 0;

                if (cmbPort.Items.Contains(s.SerialPort))
                    cmbPort.SelectedItem = s.SerialPort;

                if (cmbBaud.Items.Contains(s.Baud))
                    cmbBaud.SelectedItem = s.Baud;

                txtIP.Text = s.Ip;
                txtTcpPort.Text = string.IsNullOrEmpty(s.TcpPort) ? "8443" : s.TcpPort;
                txtLocalShell.Text = s.LocalShell ?? "";
                chkSsl.Checked = s.UseSsl;
                UpdateInputFields();
                UpdateConnectButtons();
            }
            finally
            {
                syncingToolbar = false;
            }
        }

        private void UpdateActiveTabTitle()
        {
            var panel = ActivePanel;
            if (panel != null)
                terminalTabs.SetTabTitle(panel, panel.GetTabTitle());
        }

        private void UpdateConnectButtons()
        {
            var panel = ActivePanel;
            bool connected = panel != null && panel.IsConnected;
            btnConnect.Enabled = !connected;
            btnDisconnect.Enabled = connected;
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
            string name = Microsoft.VisualBasic.Interaction.InputBox("Profile name", "Save profile", "");
            if (string.IsNullOrWhiteSpace(name)) return;

            var s = ReadToolbarSettings();
            string portVal = s.ConnectionType switch
            {
                ConnectionTypes.Serial => s.SerialPort,
                ConnectionTypes.TcpIp => s.TcpPort,
                ConnectionTypes.Local => s.LocalShell,
                _ => ""
            };

            var profile = new TerminalProfile
            {
                Name = name,
                ConnectionType = s.ConnectionType,
                Port = portVal,
                Baud = s.Baud,
                IP = s.Ip,
                UseSsl = s.UseSsl,
                LocalShell = s.LocalShell
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
            string name = cmbProfile.SelectedItem.ToString()!;
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
            if (cmbConnectionType.SelectedIndex < 0)
                cmbConnectionType.Text = profile.ConnectionType;

            if (profile.ConnectionType == ConnectionTypes.Serial)
            {
                if (cmbPort.Items.Contains(profile.Port))
                    cmbPort.SelectedItem = profile.Port;
                txtTcpPort.Text = "8443";
                txtLocalShell.Text = "";
            }
            else if (profile.ConnectionType == ConnectionTypes.TcpIp)
            {
                txtTcpPort.Text = profile.Port;
                txtLocalShell.Text = "";
            }
            else if (profile.ConnectionType == ConnectionTypes.Local)
            {
                txtLocalShell.Text = !string.IsNullOrEmpty(profile.LocalShell)
                    ? profile.LocalShell
                    : profile.Port ?? "";
                txtTcpPort.Text = "8443";
            }

            if (cmbBaud.Items.Contains(profile.Baud))
                cmbBaud.SelectedItem = profile.Baud;
            txtIP.Text = string.IsNullOrEmpty(profile.IP) ? "127.0.0.1" : profile.IP;
            chkSsl.Checked = profile.UseSsl;
            UpdateInputFields();
            PushToolbarToActivePanel();
        }

        private void btnConnect_Click(object sender, EventArgs e)
        {
            var panel = ActivePanel;
            if (panel == null) return;

            try
            {
                panel.Connect(ReadToolbarSettings());
                UpdateActiveTabTitle();
                UpdateConnectButtons();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "Connection failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void btnDisconnect_Click(object sender, EventArgs e)
        {
            ActivePanel?.Disconnect();
            UpdateActiveTabTitle();
            UpdateConnectButtons();
            MessageBox.Show(this, "Disconnected.", "Connection closed", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e) =>
            terminalTabs.DisconnectAll();
    }
}
