using System.ComponentModel;
using System.Windows.Forms;
using VNCServer.Settings;

namespace VNCServer;

public partial class AdvancedSettingsForm : Form
{
    private ServerSettings _settings;

    public AdvancedSettingsForm() : this(new ServerSettings())
    {
    }

    public AdvancedSettingsForm(ServerSettings settings)
    {
        _settings = settings;
        InitializeComponent();

        if (LicenseManager.UsageMode != LicenseUsageMode.Designtime)
        {
            LoadSettings();
        }
    }

    private void LoadSettings()
    {
        // 보안 탭
        chkEnableTLS.Checked = _settings.EnableTLS;
        txtCertificatePath.Text = _settings.CertificatePath ?? string.Empty;

        // 성능 탭
        trackImageQuality.Value = _settings.ImageQuality;
        lblImageQualityValue.Text = _settings.ImageQuality.ToString();
        numFrameRate.Value = _settings.FrameRate;
        chkAdaptiveFrameRate.Checked = _settings.EnableAdaptiveFrameRate;
        numMinFrameRate.Value = _settings.MinFrameRate;
        numMinFrameRate.Enabled = _settings.EnableAdaptiveFrameRate;
        numCompressionLevel.Value = _settings.CompressionLevel;

        // 기능 탭
        chkClipboardSync.Checked = _settings.EnableClipboardSync;
        chkLogging.Checked = _settings.EnableLogging;
        chkViewOnlyMode.Checked = _settings.ViewOnlyMode;
        chkAllowControlRequest.Checked = _settings.AllowControlRequest;

        // 네트워크 탭
        chkEnableIPv6.Checked = _settings.EnableIPv6;
        txtBindAddress.Text = _settings.BindAddress;
        chkEnableUPnP.Checked = _settings.EnableUPnP;
        chkAutoMapPort.Checked = _settings.AutoMapPortOnStart;

        // 화면 탭
        chkUseSelectedArea.Checked = _settings.UseSelectedArea;
        numAreaX.Value = _settings.SelectedAreaX;
        numAreaY.Value = _settings.SelectedAreaY;
        numAreaWidth.Value = _settings.SelectedAreaWidth;
        numAreaHeight.Value = _settings.SelectedAreaHeight;
        cmbMonitorMode.SelectedIndex = GetMonitorModeIndex(_settings.MonitorCaptureMode);
        numMonitorIndex.Value = _settings.SelectedMonitorIndex;

        // 녹화 탭
        numRecordingFPS.Value = _settings.FrameRate;
        numRecordingQuality.Value = _settings.ImageQuality;

        // 웹 관리 탭
        chkEnableWebManagement.Checked = _settings.EnableWebManagement;
        numWebPort.Value = _settings.WebManagementPort;

        // 미디어 탭
        chkEnableAudio.Checked = _settings.EnableAudioStreaming;
        numAudioSampleRate.Value = _settings.AudioSampleRate;
        numAudioChannels.Value = _settings.AudioChannels;
        chkEnableVideo.Checked = _settings.EnableVideoCodec;
        cmbVideoCodec.SelectedIndex = GetVideoCodecIndex(_settings.VideoCodecType);
        cmbVideoQuality.SelectedIndex = GetVideoQualityIndex(_settings.VideoQuality);

        // 고급 탭
        chkEnableTouch.Checked = _settings.EnableTouchInput;
        numMaxTouchPoints.Value = _settings.MaxTouchPoints;
        chkEnableReconnect.Checked = _settings.EnableSessionReconnect;
        numSessionTimeout.Value = _settings.SessionTimeoutMinutes;
        numMaxReconnectAttempts.Value = _settings.MaxReconnectAttempts;
    }

    private void SaveSettings()
    {
        // 보안 탭
        _settings.EnableTLS = chkEnableTLS.Checked;
        _settings.CertificatePath = txtCertificatePath.Text;

        // 성능 탭
        _settings.ImageQuality = trackImageQuality.Value;
        _settings.FrameRate = (int)numFrameRate.Value;
        _settings.EnableAdaptiveFrameRate = chkAdaptiveFrameRate.Checked;
        _settings.MinFrameRate = Math.Min((int)numMinFrameRate.Value, _settings.FrameRate);
        _settings.CompressionLevel = (int)numCompressionLevel.Value;

        // 기능 탭
        _settings.EnableClipboardSync = chkClipboardSync.Checked;
        _settings.EnableLogging = chkLogging.Checked;
        _settings.ViewOnlyMode = chkViewOnlyMode.Checked;
        _settings.AllowControlRequest = chkAllowControlRequest.Checked;

        // 네트워크 탭
        _settings.EnableIPv6 = chkEnableIPv6.Checked;
        _settings.BindAddress = txtBindAddress.Text;
        _settings.EnableUPnP = chkEnableUPnP.Checked;
        _settings.AutoMapPortOnStart = chkAutoMapPort.Checked;

        // 화면 탭
        _settings.UseSelectedArea = chkUseSelectedArea.Checked;
        _settings.SelectedAreaX = (int)numAreaX.Value;
        _settings.SelectedAreaY = (int)numAreaY.Value;
        _settings.SelectedAreaWidth = (int)numAreaWidth.Value;
        _settings.SelectedAreaHeight = (int)numAreaHeight.Value;
        _settings.MonitorCaptureMode = GetMonitorModeString(cmbMonitorMode.SelectedIndex);
        _settings.SelectedMonitorIndex = (int)numMonitorIndex.Value;

        // 웹 관리 탭
        _settings.EnableWebManagement = chkEnableWebManagement.Checked;
        _settings.WebManagementPort = (int)numWebPort.Value;

        // 미디어 탭
        _settings.EnableAudioStreaming = chkEnableAudio.Checked;
        _settings.AudioSampleRate = (int)numAudioSampleRate.Value;
        _settings.AudioChannels = (int)numAudioChannels.Value;
        _settings.EnableVideoCodec = chkEnableVideo.Checked;
        _settings.VideoCodecType = GetVideoCodecString(cmbVideoCodec.SelectedIndex);
        _settings.VideoQuality = GetVideoQualityString(cmbVideoQuality.SelectedIndex);

        // 고급 탭
        _settings.EnableTouchInput = chkEnableTouch.Checked;
        _settings.MaxTouchPoints = (int)numMaxTouchPoints.Value;
        _settings.EnableSessionReconnect = chkEnableReconnect.Checked;
        _settings.SessionTimeoutMinutes = (int)numSessionTimeout.Value;
        _settings.MaxReconnectAttempts = (int)numMaxReconnectAttempts.Value;

        _settings.Save();
        
        MessageBox.Show("설정이 저장되었습니다.\n일부 설정은 서버 재시작 후 적용됩니다.", 
            "설정 저장", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private int GetMonitorModeIndex(string mode)
    {
        return mode switch
        {
            "AllMonitors" => 0,
            "PrimaryMonitor" => 1,
            "SpecificMonitor" => 2,
            _ => 0
        };
    }

    private string GetMonitorModeString(int index)
    {
        return index switch
        {
            0 => "AllMonitors",
            1 => "PrimaryMonitor",
            2 => "SpecificMonitor",
            _ => "AllMonitors"
        };
    }

    private int GetVideoCodecIndex(string codec)
    {
        return codec switch
        {
            "H264" => 0,
            "H265" => 1,
            "VP8" => 2,
            "VP9" => 3,
            _ => 0
        };
    }

    private string GetVideoCodecString(int index)
    {
        return index switch
        {
            0 => "H264",
            1 => "H265",
            2 => "VP8",
            3 => "VP9",
            _ => "H264"
        };
    }

    private int GetVideoQualityIndex(string quality)
    {
        return quality switch
        {
            "Low" => 0,
            "Medium" => 1,
            "High" => 2,
            "VeryHigh" => 3,
            "Lossless" => 4,
            _ => 1
        };
    }

    private string GetVideoQualityString(int index)
    {
        return index switch
        {
            0 => "Low",
            1 => "Medium",
            2 => "High",
            3 => "VeryHigh",
            4 => "Lossless",
            _ => "Medium"
        };
    }

    private void BtnBrowseCertificate_Click(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter = "Certificate Files (*.pfx;*.p12)|*.pfx;*.p12|All Files (*.*)|*.*",
            Title = "인증서 파일 선택"
        };

        if (dialog.ShowDialog() == DialogResult.OK)
        {
            txtCertificatePath.Text = dialog.FileName;
        }
    }

    private void BtnSave_Click(object? sender, EventArgs e)
    {
        SaveSettings();
        DialogResult = DialogResult.OK;
        Close();
    }

    private void BtnCancel_Click(object? sender, EventArgs e)
    {
        this.Close();
    }

    private void BtnApply_Click(object? sender, EventArgs e)
    {
        SaveSettings();
    }

    private void TrackImageQuality_Scroll(object? sender, EventArgs e)
    {
        lblImageQualityValue.Text = trackImageQuality.Value.ToString();
    }

    private void ChkUseSelectedArea_CheckedChanged(object? sender, EventArgs e)
    {
        numAreaX.Enabled = chkUseSelectedArea.Checked;
        numAreaY.Enabled = chkUseSelectedArea.Checked;
        numAreaWidth.Enabled = chkUseSelectedArea.Checked;
        numAreaHeight.Enabled = chkUseSelectedArea.Checked;
    }

    private void CmbMonitorMode_SelectedIndexChanged(object? sender, EventArgs e)
    {
        numMonitorIndex.Enabled = cmbMonitorMode.SelectedIndex == 2; // SpecificMonitor
    }

    private void ChkEnableTLS_CheckedChanged(object? sender, EventArgs e)
    {
        txtCertificatePath.Enabled = chkEnableTLS.Checked;
        btnBrowseCertificate.Enabled = chkEnableTLS.Checked;
    }

    private void BtnReset_Click(object? sender, EventArgs e)
    {
        var result = MessageBox.Show(
            "모든 설정을 기본값으로 초기화하시겠습니까?",
            "확인",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);

        if (result == DialogResult.Yes)
        {
            _settings.ResetToDefaults();
            LoadSettings();
            MessageBox.Show("기본값으로 초기화되었습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
