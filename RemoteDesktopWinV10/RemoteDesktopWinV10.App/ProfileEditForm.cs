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
        UiTheme.StyleGroupBox(groupRdp);
        UiTheme.StyleInputsRecursive(panelRoot);
        UiTheme.StylePrimaryButton(buttonOk);
        UiTheme.StyleSecondaryButton(buttonCancel);

        Profile = existing?.Clone() ?? new ConnectionProfile
        {
            Name = "",
            Protocol = RemoteDesktopProtocol.Rdp,
            Host = "",
            Port = 3389,
        };
        _isNew = existing == null;
        Text = _isNew ? "프로필 추가" : "프로필 편집";

        protocolCombo.Items.AddRange(new object[] { "RDP", "VNC" });
        protocolCombo.SelectedIndex = Profile.Protocol == RemoteDesktopProtocol.Rdp ? 0 : 1;

        nameText.Text = Profile.Name;
        hostText.Text = Profile.Host;
        portText.Text = Profile.Port.ToString(CultureInfo.InvariantCulture);
        userText.Text = Profile.User;
        var saved = ConnectionProfileStore.UnprotectPassword(Profile.EncryptedPasswordBase64);
        if (!string.IsNullOrEmpty(saved))
        {
            passwordText.Text = saved;
        }

        if (Profile.CredSspEnabled.HasValue)
        {
            credSspCheck.Checked = Profile.CredSspEnabled.Value;
        }

        if (Profile.NegotiateSecurityLayer.HasValue)
        {
            nlaCheck.Checked = Profile.NegotiateSecurityLayer.Value;
        }

        if (Profile.RelaxedCertificateValidation.HasValue)
        {
            relaxedCertCheck.Checked = Profile.RelaxedCertificateValidation.Value;
        }

        if (Profile.RdpRedirectClipboard.HasValue)
        {
            rdpClipboardCheck.Checked = Profile.RdpRedirectClipboard.Value;
        }

        if (Profile.RdpRedirectDrives.HasValue)
        {
            rdpDrivesCheck.Checked = Profile.RdpRedirectDrives.Value;
        }

        if (Profile.RdpRedirectPrinters.HasValue)
        {
            rdpPrintersCheck.Checked = Profile.RdpRedirectPrinters.Value;
        }

        ApplyProtocolUi();
        protocolCombo.SelectedIndexChanged += (_, _) => ApplyProtocolUi();
    }

    public ConnectionProfile Profile { get; private set; } = null!;

    private bool IsRdp => protocolCombo.SelectedIndex == 0;

    private void ApplyProtocolUi()
    {
        var rdp = IsRdp;
        userText.Enabled = rdp;
        rdpClipboardCheck.Enabled = rdp;
        rdpDrivesCheck.Enabled = rdp;
        rdpPrintersCheck.Enabled = rdp;
        credSspCheck.Enabled = rdp;
        nlaCheck.Enabled = rdp;
        relaxedCertCheck.Enabled = rdp;
        hostText.PlaceholderText = rdp
            ? "호스트 이름 또는 IP"
            : "localhost 또는 서버 IP (같은 PC면 localhost)";
        passwordText.PlaceholderText = rdp
            ? ""
            : "VNC 암호(없으면 빈 칸; 표준 인증은 앞 8자만)";

        if (_isNew)
        {
            portText.Text = rdp ? "3389" : VncConnectionDefaults.DefaultPort.ToString(CultureInfo.InvariantCulture);
        }
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

        if (IsRdp && userText.Text.Trim().Length == 0)
        {
            MessageBox.Show(this, "RDP 사용자 이름을 입력하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
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
        Profile.Protocol = IsRdp ? RemoteDesktopProtocol.Rdp : RemoteDesktopProtocol.Vnc;
        Profile.Host = hostText.Text.Trim();
        Profile.Port = port;
        Profile.User = userText.Text.Trim();
        Profile.CredSspEnabled = credSspCheck.Checked;
        Profile.NegotiateSecurityLayer = nlaCheck.Checked;
        Profile.RelaxedCertificateValidation = relaxedCertCheck.Checked;
        Profile.RdpRedirectClipboard = rdpClipboardCheck.Checked;
        Profile.RdpRedirectDrives = rdpDrivesCheck.Checked;
        Profile.RdpRedirectPrinters = rdpPrintersCheck.Checked;

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
}
