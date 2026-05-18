using System.Drawing;

namespace RemoteDesktopWinV10.App;

public partial class ConnectionDialog : Form
{
    public string SelectedProfile { get; set; } = "";
    public string SelectedHistory { get; set; } = "";
    public string Host { get; set; } = "";
    public string Port { get; set; } = "";
    public string Password { get; set; } = "";

    public bool VncViewOnly { get; set; }
    public bool VncShareDesktop { get; set; } = true;
    public bool VncClipboardFromServer { get; set; } = true;
    public bool VncClipboardToServer { get; set; } = true;
    public bool VncRemoteCursor { get; set; } = true;
    public bool VncAutoReconnect { get; set; }
    public VncScaleMode VncSizeMode { get; set; } = VncScaleMode.Zoom;
    /// <summary>0 = 기본값(15 fps)</summary>
    public int VncMaxFps { get; set; }
    public bool VncUseTls { get; set; }
    public bool VncIgnoreTlsCertErrors { get; set; }

    private List<ConnectionProfile> _profilesList = new();
    private List<ConnectionHistoryEntry> _historyList = new();

    public ConnectionDialog()
    {
        InitializeComponent();
        ArrangeVncOnlyUi();
    }

    private void ArrangeVncOnlyUi()
    {
        Text = "VNC 연결";
        groupRdpOptions.Visible = false;
        groupVncOptions.Visible = true;
        labelProtocolHead.Visible = false;
        protocolCombo.Visible = false;
        labelUserHead.Visible = false;
        userText.Visible = false;
        labelPasswordHead.Text = "VNC 암호";
        hostText.PlaceholderText = "localhost 또는 서버 IP";
        passwordText.PlaceholderText = "VNC 암호(없으면 빈 칸; 표준 인증은 앞 8자만)";
        if (string.IsNullOrWhiteSpace(portText.Text))
        {
            portText.Text = VncConnectionDefaults.DefaultPort.ToString();
        }

        ClientSize = new Size(684, 372);
        const int buttonY = 328;
        saveProfileButton.Location = new Point(12, buttonY);
        connectButton.Location = new Point(512, buttonY);
        cancelButton.Location = new Point(598, buttonY);
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
        hostText.Text = Host;
        portText.Text = string.IsNullOrWhiteSpace(Port)
            ? VncConnectionDefaults.DefaultPort.ToString()
            : Port;
        passwordText.Text = Password;

        vncViewOnlyCheck.Checked = VncViewOnly;
        vncShareDesktopCheck.Checked = VncShareDesktop;
        vncClipFromServerCheck.Checked = VncClipboardFromServer;
        vncClipToServerCheck.Checked = VncClipboardToServer;
        vncRemoteCursorCheck.Checked = VncRemoteCursor;
        vncAutoReconnectCheck.Checked = VncAutoReconnect;
        vncSizeModeCombo.SelectedIndex = (int)VncSizeMode;
        vncMaxFpsCombo.SelectedIndex = FpsValueToComboIndex(VncMaxFps);
        vncUseTlsCheck.Checked = VncUseTls;
        vncIgnoreTlsCertCheck.Checked = VncIgnoreTlsCertErrors;
    }

    private void SaveSettings()
    {
        Host = hostText.Text;
        Port = portText.Text;
        Password = passwordText.Text;

        VncViewOnly = vncViewOnlyCheck.Checked;
        VncShareDesktop = vncShareDesktopCheck.Checked;
        VncClipboardFromServer = vncClipFromServerCheck.Checked;
        VncClipboardToServer = vncClipToServerCheck.Checked;
        VncRemoteCursor = vncRemoteCursorCheck.Checked;
        VncAutoReconnect = vncAutoReconnectCheck.Checked;
        VncSizeMode = (VncScaleMode)vncSizeModeCombo.SelectedIndex;
        VncMaxFps = FpsComboToValue(vncMaxFpsCombo.SelectedIndex);
        VncUseTls = vncUseTlsCheck.Checked;
        VncIgnoreTlsCertErrors = vncIgnoreTlsCertCheck.Checked;

        if (profilesCombo.SelectedIndex > 0)
        {
            SelectedProfile = profilesCombo.SelectedItem?.ToString() ?? "";
        }

        if (historyCombo.SelectedIndex > 0)
        {
            SelectedHistory = historyCombo.SelectedItem?.ToString() ?? "";
        }
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
        hostText.Text = profile.Host;
        portText.Text = profile.Port > 0
            ? profile.Port.ToString()
            : VncConnectionDefaults.DefaultPort.ToString();

        var savedPw = ConnectionProfileStore.UnprotectPassword(profile.EncryptedPasswordBase64);
        passwordText.Text = savedPw ?? "";

        vncViewOnlyCheck.Checked = profile.VncViewOnly ?? false;
        vncShareDesktopCheck.Checked = profile.VncShareDesktop ?? true;
        vncClipFromServerCheck.Checked = profile.VncClipboardFromServer ?? true;
        vncClipToServerCheck.Checked = profile.VncClipboardToServer ?? true;
        vncRemoteCursorCheck.Checked = profile.VncRemoteCursor ?? true;
        vncAutoReconnectCheck.Checked = profile.VncAutoReconnect ?? false;
        vncSizeModeCombo.SelectedIndex = (int)(profile.VncSizeMode ?? VncScaleMode.Zoom);
        vncMaxFpsCombo.SelectedIndex = FpsValueToComboIndex(profile.VncMaxFps ?? 0);
        vncUseTlsCheck.Checked = profile.VncUseTls ?? false;
        vncIgnoreTlsCertCheck.Checked = profile.VncIgnoreTlsCertErrors ?? false;
    }

    private void ApplyHistoryEntry(ConnectionHistoryEntry entry)
    {
        hostText.Text = entry.Host;
        portText.Text = entry.Port.ToString();
    }

    private void OnSaveProfileClick(object? sender, EventArgs e)
    {
        var defaultName = profilesCombo.SelectedIndex > 0
            ? profilesCombo.SelectedItem?.ToString() ?? ""
            : "";

        var existingNames = _profilesList.Select(p => p.Name).ToList();
        using var saveDlg = new SaveProfileDialog(existingNames, defaultName);
        if (saveDlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var profileName = saveDlg.ProfileName;
        var newProfile = new ConnectionProfile
        {
            Name = profileName,
            Host = hostText.Text.Trim(),
            Port = int.TryParse(portText.Text.Trim(), out var p)
                ? p
                : VncConnectionDefaults.DefaultPort,
            VncViewOnly = vncViewOnlyCheck.Checked,
            VncShareDesktop = vncShareDesktopCheck.Checked,
            VncClipboardFromServer = vncClipFromServerCheck.Checked,
            VncClipboardToServer = vncClipToServerCheck.Checked,
            VncRemoteCursor = vncRemoteCursorCheck.Checked,
            VncAutoReconnect = vncAutoReconnectCheck.Checked,
            VncSizeMode = (VncScaleMode)vncSizeModeCombo.SelectedIndex,
            VncUseTls = vncUseTlsCheck.Checked,
            VncIgnoreTlsCertErrors = vncIgnoreTlsCertCheck.Checked,
        };

        var fps = FpsComboToValue(vncMaxFpsCombo.SelectedIndex);
        newProfile.VncMaxFps = fps > 0 ? fps : null;

        if (!string.IsNullOrEmpty(passwordText.Text))
        {
            try
            {
                var protectedBytes = ConnectionProfileStore.ProtectPassword(passwordText.Text);
                if (protectedBytes != null)
                {
                    newProfile.EncryptedPasswordBase64 = Convert.ToBase64String(protectedBytes);
                }
            }
            catch { }
        }

        try
        {
            var profiles = ConnectionProfileStore.Load();
            var existingIdx = profiles.FindIndex(
                p => string.Equals(p.Name, profileName, StringComparison.OrdinalIgnoreCase));

            var isUpdate = existingIdx >= 0;
            if (isUpdate)
            {
                newProfile.Id = profiles[existingIdx].Id;
                if (string.IsNullOrEmpty(passwordText.Text))
                {
                    newProfile.EncryptedPasswordBase64 = profiles[existingIdx].EncryptedPasswordBase64;
                }
                profiles[existingIdx] = newProfile;
            }
            else
            {
                profiles.Add(newProfile);
            }

            ConnectionProfileStore.Save(profiles);

            var resultMsg = isUpdate
                ? $"프로필 '{profileName}'이(가) 업데이트되었습니다."
                : $"프로필 '{profileName}'이(가) 새로 저장되었습니다.";
            MessageBox.Show(this, resultMsg, "성공", MessageBoxButtons.OK, MessageBoxIcon.Information);

            SetProfiles(profiles);
            var savedIdx = profiles.FindIndex(
                p => string.Equals(p.Name, profileName, StringComparison.OrdinalIgnoreCase));
            if (savedIdx >= 0)
            {
                profilesCombo.SelectedIndex = savedIdx + 1;
            }
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, $"프로필 저장 실패: {ex.Message}", "오류", MessageBoxIcon.Error);
        }
    }

    private static readonly int[] FpsPresets = { 0, 30, 15, 10, 5 };

    private static int FpsComboToValue(int index) =>
        (uint)index < (uint)FpsPresets.Length ? FpsPresets[index] : 0;

    private static int FpsValueToComboIndex(int fps)
    {
        var idx = Array.IndexOf(FpsPresets, fps);
        return idx >= 0 ? idx : 0;
    }
}
