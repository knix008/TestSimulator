namespace RemoteDesktopWinV10.App;

public partial class VncAdvancedSettingsDialog : Form
{
    public VncAdvancedSettingsDialog()
    {
        InitializeComponent();
        UiTheme.ApplyDialogChrome(this);
        UiTheme.StyleGroupBox(groupVncOptions);
        UiTheme.StyleInputsRecursive(this);
        UiTheme.StylePrimaryButton(buttonOk);
        UiTheme.StyleSecondaryButton(buttonCancel);
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
    }

    public VncClientSettings ToSettings()
    {
        var fps = FpsComboToValue(vncMaxFpsCombo.SelectedIndex);
        return new VncClientSettings
        {
            ViewOnly = vncViewOnlyCheck.Checked,
            ShareDesktop = vncShareDesktopCheck.Checked,
            ClipboardFromServer = vncClipFromServerCheck.Checked,
            ClipboardToServer = vncClipToServerCheck.Checked,
            RemoteCursor = vncRemoteCursorCheck.Checked,
            AutoReconnect = vncAutoReconnectCheck.Checked,
            SizeMode = (VncScaleMode)vncSizeModeCombo.SelectedIndex,
            MaxUpdateRate = fps > 0 ? fps : 15,
            UseTls = vncUseTlsCheck.Checked,
            IgnoreTlsCertErrors = vncIgnoreTlsCertCheck.Checked,
        };
    }

    private static readonly int[] FpsPresets = { 0, 30, 15, 10, 5 };

    private static int FpsComboToValue(int index) =>
        (uint)index < (uint)FpsPresets.Length ? FpsPresets[index] : 0;

    private static int FpsValueToComboIndex(int fps)
    {
        var idx = Array.IndexOf(FpsPresets, fps);
        return idx >= 0 ? idx : 2;
    }
}
