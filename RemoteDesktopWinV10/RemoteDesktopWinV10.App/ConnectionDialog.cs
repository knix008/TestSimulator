using System.Drawing;

namespace RemoteDesktopWinV10.App;

public partial class ConnectionDialog : Form
{
    public string SelectedProfile { get; set; } = "";
    public string SelectedHistory { get; set; } = "";
    public string Protocol { get; set; } = "RDP";
    public string Host { get; set; } = "";
    public string Port { get; set; } = "";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    
    // RDP Options
    public bool EnableCredSsp { get; set; } = true;
    public bool EnableNla { get; set; } = true;
    public bool RelaxedCertificate { get; set; } = false;
    public bool EnableClipboard { get; set; } = true;
    public bool EnableDrives { get; set; } = false;
    public bool EnablePrinters { get; set; } = false;

    private List<ConnectionProfile> _profilesList = new();
    private List<ConnectionHistoryEntry> _historyList = new();

    public ConnectionDialog()
    {
        InitializeComponent();
    }

    public void SetProfiles(List<ConnectionProfile> profiles)
    {
        _profilesList = profiles;
        profilesCombo.Items.Clear();
        profilesCombo.Items.Add("(선택 안함)");
        foreach (var profile in profiles)
        {
            profilesCombo.Items.Add(profile.Name);
        }
        profilesCombo.SelectedIndex = 0;
    }

    public void SetHistory(List<ConnectionHistoryEntry> history)
    {
        _historyList = history;
        historyCombo.Items.Clear();
        historyCombo.Items.Add("(최근 기록 없음)");
        foreach (var entry in history.Take(20))
        {
            historyCombo.Items.Add($"{entry.Host}:{entry.Port}");
        }
        historyCombo.SelectedIndex = 0;
    }

    public void LoadCurrentSettings()
    {
        protocolCombo.SelectedItem = Protocol;
        hostText.Text = Host;
        portText.Text = Port;
        userText.Text = Username;
        passwordText.Text = Password;
        
        credSspCheck.Checked = EnableCredSsp;
        nlaCheck.Checked = EnableNla;
        relaxedCertCheck.Checked = RelaxedCertificate;
        rdpClipboardCheck.Checked = EnableClipboard;
        rdpDrivesCheck.Checked = EnableDrives;
        rdpPrintersCheck.Checked = EnablePrinters;

        UpdateProtocolVisibility();
    }

    private void SaveSettings()
    {
        Protocol = protocolCombo.SelectedItem?.ToString() ?? "RDP";
        Host = hostText.Text;
        Port = portText.Text;
        Username = userText.Text;
        Password = passwordText.Text;
        
        EnableCredSsp = credSspCheck.Checked;
        EnableNla = nlaCheck.Checked;
        RelaxedCertificate = relaxedCertCheck.Checked;
        EnableClipboard = rdpClipboardCheck.Checked;
        EnableDrives = rdpDrivesCheck.Checked;
        EnablePrinters = rdpPrintersCheck.Checked;

        if (profilesCombo.SelectedIndex > 0)
        {
            SelectedProfile = profilesCombo.SelectedItem?.ToString() ?? "";
        }

        if (historyCombo.SelectedIndex > 0)
        {
            SelectedHistory = historyCombo.SelectedItem?.ToString() ?? "";
        }
    }

    private void UpdateProtocolVisibility()
    {
        bool isRdp = protocolCombo.SelectedItem?.ToString() == "RDP";
        groupRdpOptions.Visible = isRdp;
        userText.Enabled = isRdp;
        
        // Update labels for VNC
        if (!isRdp)
        {
            labelPasswordHead.Text = "VNC 암호";
        }
        else
        {
            labelPasswordHead.Text = "암호";
        }
        
        // Resize dialog and reposition buttons based on protocol
        int buttonY;
        if (isRdp)
        {
            ClientSize = new Size(684, 334);
            buttonY = 290;
        }
        else
        {
            ClientSize = new Size(684, 240);
            buttonY = 196;
        }
        
        // Reposition buttons
        saveProfileButton.Location = new Point(12, buttonY);
        connectButton.Location = new Point(512, buttonY);
        cancelButton.Location = new Point(598, buttonY);
    }

    private void OnProtocolChanged(object? sender, EventArgs e)
    {
        UpdateProtocolVisibility();
    }

    private void OnConnectClick(object? sender, EventArgs e)
    {
        SaveSettings();
        DialogResult = DialogResult.OK;
        Close();
    }

    private void OnCancelClick(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }

    private void OnProfileSelected(object? sender, EventArgs e)
    {
        if (profilesCombo.SelectedIndex <= 0) return;

        var profileName = profilesCombo.SelectedItem?.ToString();
        var profile = _profilesList.FirstOrDefault(p => p.Name == profileName);
        if (profile != null)
        {
            ApplyProfile(profile);
        }
    }

    private void OnHistorySelected(object? sender, EventArgs e)
    {
        if (historyCombo.SelectedIndex <= 0) return;

        var historyText = historyCombo.SelectedItem?.ToString();
        var entry = _historyList.FirstOrDefault(h => $"{h.Host}:{h.Port}" == historyText);
        if (entry != null)
        {
            ApplyHistoryEntry(entry);
        }
    }

    private void ApplyProfile(ConnectionProfile profile)
    {
        protocolCombo.SelectedItem = profile.Protocol == RemoteDesktopProtocol.Rdp ? "RDP" : "VNC";
        hostText.Text = profile.Host;
        portText.Text = profile.Port.ToString();
        userText.Text = profile.User ?? "";
        
        if (profile.Protocol == RemoteDesktopProtocol.Rdp)
        {
            credSspCheck.Checked = profile.CredSspEnabled ?? true;
            nlaCheck.Checked = profile.NegotiateSecurityLayer ?? true;
            relaxedCertCheck.Checked = profile.RelaxedCertificateValidation ?? false;
            rdpClipboardCheck.Checked = profile.RdpRedirectClipboard ?? true;
            rdpDrivesCheck.Checked = profile.RdpRedirectDrives ?? false;
            rdpPrintersCheck.Checked = profile.RdpRedirectPrinters ?? false;
        }
        
        UpdateProtocolVisibility();
    }

    private void ApplyHistoryEntry(ConnectionHistoryEntry entry)
    {
        protocolCombo.SelectedItem = entry.Protocol == RemoteDesktopProtocol.Rdp ? "RDP" : "VNC";
        hostText.Text = entry.Host;
        portText.Text = entry.Port.ToString();
        UpdateProtocolVisibility();
    }

    private void OnSaveProfileClick(object? sender, EventArgs e)
    {
        var profileName = Microsoft.VisualBasic.Interaction.InputBox(
            "프로필 이름을 입력하세요:",
            "프로필 저장",
            "");
        
        if (string.IsNullOrWhiteSpace(profileName))
        {
            return;
        }

        var profile = new ConnectionProfile
        {
            Name = profileName.Trim(),
            Protocol = protocolCombo.SelectedItem?.ToString() == "RDP" ? RemoteDesktopProtocol.Rdp : RemoteDesktopProtocol.Vnc,
            Host = hostText.Text.Trim(),
            Port = int.TryParse(portText.Text.Trim(), out var p) ? p : (protocolCombo.SelectedItem?.ToString() == "RDP" ? 3389 : 5900),
            User = userText.Text.Trim()
        };

        if (profile.Protocol == RemoteDesktopProtocol.Rdp)
        {
            profile.CredSspEnabled = credSspCheck.Checked;
            profile.NegotiateSecurityLayer = nlaCheck.Checked;
            profile.RelaxedCertificateValidation = relaxedCertCheck.Checked;
            profile.RdpRedirectClipboard = rdpClipboardCheck.Checked;
            profile.RdpRedirectDrives = rdpDrivesCheck.Checked;
            profile.RdpRedirectPrinters = rdpPrintersCheck.Checked;
        }

        // Save password if provided
        if (!string.IsNullOrEmpty(passwordText.Text))
        {
            try
            {
                var encrypted = System.Security.Cryptography.ProtectedData.Protect(
                    System.Text.Encoding.UTF8.GetBytes(passwordText.Text),
                    null,
                    System.Security.Cryptography.DataProtectionScope.CurrentUser);
                profile.EncryptedPasswordBase64 = Convert.ToBase64String(encrypted);
            }
            catch
            {
                // Ignore password encryption errors
            }
        }

        try
        {
            var profiles = ConnectionProfileStore.Load();
            profiles.Add(profile);
            ConnectionProfileStore.Save(profiles);
            
            MessageBox.Show(this, $"프로필 '{profileName}'이(가) 저장되었습니다.", "성공", MessageBoxButtons.OK, MessageBoxIcon.Information);
            
            // Reload profiles in combo
            SetProfiles(profiles);
            profilesCombo.SelectedIndex = profilesCombo.Items.Count - 1;
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"프로필 저장 실패: {ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
