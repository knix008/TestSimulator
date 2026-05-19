namespace RemoteDesktopWinV10.App;

public partial class VncAdvancedSettingsDialog : Form
{
    public VncAdvancedSettingsDialog()
    {
        InitializeComponent();
        UiTheme.ApplyDialogChrome(this);
        UiTheme.StyleGroupBox(groupVncOptions);
        UiTheme.StyleGroupBox(groupRecording);
        UiTheme.StyleInputsRecursive(this);
        UiTheme.StylePrimaryButton(buttonOk);
        UiTheme.StyleSecondaryButton(buttonCancel);
        UiTheme.StyleSecondaryButton(recordingFolderBrowseButton);
        recordingFolderBrowseButton.Click += OnBrowseRecordingFolder;
    }

    public void LoadSettings(VncClientSettings settings)
    {
        vncViewOnlyCheck.Checked = settings.ViewOnly;
        vncShareDesktopCheck.Checked = settings.ShareDesktop;
        vncClipFromServerCheck.Checked = settings.ClipboardFromServer;
        vncClipToServerCheck.Checked = settings.ClipboardToServer;
        vncRemoteCursorCheck.Checked = settings.RemoteCursor;
        vncAutoReconnectCheck.Checked = settings.AutoReconnect;
        vncSizeModeCombo.SelectedIndex = (int)settings.SizeMode;
        vncMaxFpsCombo.SelectedIndex = FpsValueToComboIndex((int)settings.MaxUpdateRate);
        vncUseTlsCheck.Checked = settings.UseTls;
        vncIgnoreTlsCertCheck.Checked = settings.IgnoreTlsCertErrors;

        recordingFpsCombo.SelectedIndex = RecordingFpsToComboIndex(settings.RecordingFps);
        recordingFolderText.Text = settings.RecordingOutputFolder ?? "";
    }

    public VncClientSettings ToSettings()
    {
        var fps = FpsComboToValue(vncMaxFpsCombo.SelectedIndex);
        var folder = recordingFolderText.Text.Trim();

        return new VncClientSettings
        {
            ViewOnly = vncViewOnlyCheck.Checked,
            ShareDesktop = vncShareDesktopCheck.Checked,
            ClipboardFromServer = vncClipFromServerCheck.Checked,
            ClipboardToServer = vncClipToServerCheck.Checked,
            RemoteCursor = vncRemoteCursorCheck.Checked,
            AutoReconnect = vncAutoReconnectCheck.Checked,
            SizeMode = (VncScaleMode)vncSizeModeCombo.SelectedIndex,
            MaxUpdateRate = fps,  // 0 = "기본값"; 실제 연결 시 ApplyControlSettings에서 15로 처리
            UseTls = vncUseTlsCheck.Checked,
            IgnoreTlsCertErrors = vncIgnoreTlsCertCheck.Checked,
            RecordingFps = RecordingFpsComboToValue(recordingFpsCombo.SelectedIndex),
            RecordingOutputFolder = string.IsNullOrEmpty(folder) ? null : folder,
        };
    }

    private void OnBrowseRecordingFolder(object? sender, EventArgs e)
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = "녹화 파일을 저장할 폴더를 선택하세요.",
            UseDescriptionForTitle = true,
            SelectedPath = string.IsNullOrWhiteSpace(recordingFolderText.Text)
                ? Environment.GetFolderPath(Environment.SpecialFolder.MyVideos)
                : recordingFolderText.Text,
        };

        if (dlg.ShowDialog(this) == DialogResult.OK)
        {
            recordingFolderText.Text = dlg.SelectedPath;
        }
    }

    private static readonly int[] FpsPresets = { 0, 30, 15, 10, 5 };
    private static readonly int[] RecordingFpsPresets = { 30, 24, 15, 10, 5 };

    private static int FpsComboToValue(int index) =>
        (uint)index < (uint)FpsPresets.Length ? FpsPresets[index] : 0;

    private static int FpsValueToComboIndex(int fps)
    {
        var idx = Array.IndexOf(FpsPresets, fps);
        return idx >= 0 ? idx : 2;
    }

    private static int RecordingFpsToComboIndex(int fps)
    {
        var idx = Array.IndexOf(RecordingFpsPresets, fps);
        return idx >= 0 ? idx : 2;
    }

    private static int RecordingFpsComboToValue(int index) =>
        (uint)index < (uint)RecordingFpsPresets.Length ? RecordingFpsPresets[index] : 15;
}
