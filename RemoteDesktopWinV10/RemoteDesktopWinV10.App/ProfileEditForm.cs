using System.Globalization;

namespace RemoteDesktopWinV10.App;

public partial class ProfileEditForm : Form
{
    private readonly bool _isNew;

    public ProfileEditForm(ConnectionProfile? existing)
    {
        InitializeComponent();

        UiTheme.ApplyDialogChrome(this);
        UiTheme.StylePanelRoot(panelRoot);
        UiTheme.StyleGroupBox(groupVnc);
        UiTheme.StyleInputsRecursive(panelRoot);
        UiTheme.StylePrimaryButton(buttonOk);
        UiTheme.StyleSecondaryButton(buttonCancel);

        ArrangeVncOnlyUi();

        Profile = existing?.Clone() ?? new ConnectionProfile
        {
            Name = "",
            Host = "",
            Port = VncConnectionDefaults.DefaultPort,
        };
        _isNew = existing == null;
        Text = _isNew ? "프로필 추가" : "프로필 편집";

        nameText.Text = Profile.Name;
        hostText.Text = Profile.Host;
        portText.Text = Profile.Port > 0
            ? Profile.Port.ToString(CultureInfo.InvariantCulture)
            : VncConnectionDefaults.DefaultPort.ToString(CultureInfo.InvariantCulture);

        var saved = ConnectionProfileStore.UnprotectPassword(Profile.EncryptedPasswordBase64);
        if (!string.IsNullOrEmpty(saved))
        {
            passwordText.Text = saved;
        }

        vncViewOnlyCheck.Checked = Profile.VncViewOnly ?? false;
        vncShareDesktopCheck.Checked = Profile.VncShareDesktop ?? true;
        vncClipFromServerCheck.Checked = Profile.VncClipboardFromServer ?? true;
        vncClipToServerCheck.Checked = Profile.VncClipboardToServer ?? true;
        vncRemoteCursorCheck.Checked = Profile.VncRemoteCursor ?? true;
        vncAutoReconnectCheck.Checked = Profile.VncAutoReconnect ?? false;
        vncSizeModeCombo.SelectedIndex = (int)(Profile.VncSizeMode ?? VncScaleMode.Zoom);
        vncMaxFpsCombo.SelectedIndex = FpsValueToComboIndex(Profile.VncMaxFps ?? 0);
        vncUseTlsCheck.Checked = Profile.VncUseTls ?? false;
        vncIgnoreTlsCertCheck.Checked = Profile.VncIgnoreTlsCertErrors ?? false;
    }

    public ConnectionProfile Profile { get; private set; } = null!;

    private void ArrangeVncOnlyUi()
    {
        protocolCombo.Visible = false;
        labelProtocol.Visible = false;
        groupRdp.Visible = false;
        groupVnc.Visible = true;
        userText.Visible = false;
        labelUser.Visible = false;
        hostText.PlaceholderText = "localhost 또는 서버 IP";
        passwordText.PlaceholderText = "VNC 암호(없으면 빈 칸; 표준 인증은 앞 8자만)";
    }

    private void buttonOk_Click(object sender, EventArgs e)
    {
        var name = nameText.Text.Trim();
        if (name.Length == 0)
        {
            MessageBox.Show(this, "프로필 이름을 입력하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (!int.TryParse(portText.Text.Trim(), out var port) || port is < 1 or > 65535)
        {
            MessageBox.Show(this, "포트는 1~65535 사이여야 합니다.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var savePassword = false;
        if (passwordText.TextLength > 0)
        {
            var r = MessageBox.Show(this,
                "암호를 이 PC의 현재 Windows 사용자로만 복호화 가능하도록 저장할까요?",
                Text,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            savePassword = r == DialogResult.Yes;
        }

        Profile.Name = name;
        Profile.Host = hostText.Text.Trim();
        Profile.Port = port;
        Profile.User = "";

        Profile.VncViewOnly = vncViewOnlyCheck.Checked;
        Profile.VncShareDesktop = vncShareDesktopCheck.Checked;
        Profile.VncClipboardFromServer = vncClipFromServerCheck.Checked;
        Profile.VncClipboardToServer = vncClipToServerCheck.Checked;
        Profile.VncRemoteCursor = vncRemoteCursorCheck.Checked;
        Profile.VncAutoReconnect = vncAutoReconnectCheck.Checked;
        Profile.VncSizeMode = (VncScaleMode)vncSizeModeCombo.SelectedIndex;
        var fps = FpsComboToValue(vncMaxFpsCombo.SelectedIndex);
        Profile.VncMaxFps = fps > 0 ? fps : null;
        Profile.VncUseTls = vncUseTlsCheck.Checked;
        Profile.VncIgnoreTlsCertErrors = vncIgnoreTlsCertCheck.Checked;

        if (savePassword && passwordText.TextLength > 0)
        {
            try
            {
                var blob = ConnectionProfileStore.ProtectPassword(passwordText.Text);
                Profile.EncryptedPasswordBase64 = blob != null ? Convert.ToBase64String(blob) : null;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    this,
                    ExceptionMessageFormatter.Format(ex, "암호를 보호(암호화)하여 저장할 수 없습니다."),
                    Text,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }
        }
        else
        {
            Profile.EncryptedPasswordBase64 = null;
        }

        DialogResult = DialogResult.OK;
    }

    private void buttonCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
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
