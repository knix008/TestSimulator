namespace RemoteDesktopWinV10.App;

#nullable disable
partial class VncAdvancedSettingsDialog
{
    private System.ComponentModel.IContainer components = null;
    private GroupBox groupVncOptions;
    private CheckBox vncViewOnlyCheck;
    private CheckBox vncShareDesktopCheck;
    private CheckBox vncRemoteCursorCheck;
    private CheckBox vncAutoReconnectCheck;
    private CheckBox vncClipFromServerCheck;
    private CheckBox vncClipToServerCheck;
    private Label labelVncSizeMode;
    private ComboBox vncSizeModeCombo;
    private Label labelVncMaxFps;
    private ComboBox vncMaxFpsCombo;
    private CheckBox vncUseTlsCheck;
    private CheckBox vncIgnoreTlsCertCheck;
    private Button buttonOk;
    private Button buttonCancel;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        groupVncOptions = new GroupBox();
        vncViewOnlyCheck = new CheckBox();
        vncShareDesktopCheck = new CheckBox();
        vncRemoteCursorCheck = new CheckBox();
        vncAutoReconnectCheck = new CheckBox();
        vncClipFromServerCheck = new CheckBox();
        vncClipToServerCheck = new CheckBox();
        labelVncSizeMode = new Label();
        vncSizeModeCombo = new ComboBox();
        labelVncMaxFps = new Label();
        vncMaxFpsCombo = new ComboBox();
        vncUseTlsCheck = new CheckBox();
        vncIgnoreTlsCertCheck = new CheckBox();
        buttonOk = new Button();
        buttonCancel = new Button();
        groupVncOptions.SuspendLayout();
        SuspendLayout();

        groupVncOptions.Controls.Add(vncViewOnlyCheck);
        groupVncOptions.Controls.Add(vncShareDesktopCheck);
        groupVncOptions.Controls.Add(vncRemoteCursorCheck);
        groupVncOptions.Controls.Add(vncAutoReconnectCheck);
        groupVncOptions.Controls.Add(vncClipFromServerCheck);
        groupVncOptions.Controls.Add(vncClipToServerCheck);
        groupVncOptions.Controls.Add(labelVncSizeMode);
        groupVncOptions.Controls.Add(vncSizeModeCombo);
        groupVncOptions.Controls.Add(labelVncMaxFps);
        groupVncOptions.Controls.Add(vncMaxFpsCombo);
        groupVncOptions.Controls.Add(vncUseTlsCheck);
        groupVncOptions.Controls.Add(vncIgnoreTlsCertCheck);
        groupVncOptions.Location = new Point(12, 12);
        groupVncOptions.Name = "groupVncOptions";
        groupVncOptions.Padding = new Padding(8);
        groupVncOptions.Size = new Size(520, 140);
        groupVncOptions.TabIndex = 0;
        groupVncOptions.TabStop = false;
        groupVncOptions.Text = "VNC 고급 옵션";

        vncViewOnlyCheck.AutoSize = true;
        vncViewOnlyCheck.Location = new Point(12, 24);
        vncViewOnlyCheck.Text = "화면 전용(뷰 온리)";
        vncViewOnlyCheck.UseVisualStyleBackColor = true;

        vncShareDesktopCheck.AutoSize = true;
        vncShareDesktopCheck.Checked = true;
        vncShareDesktopCheck.CheckState = CheckState.Checked;
        vncShareDesktopCheck.Location = new Point(160, 24);
        vncShareDesktopCheck.Text = "화면 공유";
        vncShareDesktopCheck.UseVisualStyleBackColor = true;

        vncRemoteCursorCheck.AutoSize = true;
        vncRemoteCursorCheck.Checked = true;
        vncRemoteCursorCheck.CheckState = CheckState.Checked;
        vncRemoteCursorCheck.Location = new Point(280, 24);
        vncRemoteCursorCheck.Text = "원격 커서";
        vncRemoteCursorCheck.UseVisualStyleBackColor = true;

        vncAutoReconnectCheck.AutoSize = true;
        vncAutoReconnectCheck.Location = new Point(390, 24);
        vncAutoReconnectCheck.Text = "자동 재연결";
        vncAutoReconnectCheck.UseVisualStyleBackColor = true;

        vncClipFromServerCheck.AutoSize = true;
        vncClipFromServerCheck.Checked = true;
        vncClipFromServerCheck.CheckState = CheckState.Checked;
        vncClipFromServerCheck.Location = new Point(12, 52);
        vncClipFromServerCheck.Text = "클립보드 수신";
        vncClipFromServerCheck.UseVisualStyleBackColor = true;

        vncClipToServerCheck.AutoSize = true;
        vncClipToServerCheck.Checked = true;
        vncClipToServerCheck.CheckState = CheckState.Checked;
        vncClipToServerCheck.Location = new Point(160, 52);
        vncClipToServerCheck.Text = "클립보드 송신";
        vncClipToServerCheck.UseVisualStyleBackColor = true;

        labelVncSizeMode.AutoSize = true;
        labelVncSizeMode.Location = new Point(12, 84);
        labelVncSizeMode.Text = "화면 맞춤:";

        vncSizeModeCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        vncSizeModeCombo.FormattingEnabled = true;
        vncSizeModeCombo.Items.AddRange(new object[] { "Zoom", "Stretch", "Clip", "AutoSize", "Center" });
        vncSizeModeCombo.Location = new Point(88, 80);
        vncSizeModeCombo.Size = new Size(110, 23);
        vncSizeModeCombo.SelectedIndex = 0;

        labelVncMaxFps.AutoSize = true;
        labelVncMaxFps.Location = new Point(215, 84);
        labelVncMaxFps.Text = "최대 FPS:";

        vncMaxFpsCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        vncMaxFpsCombo.FormattingEnabled = true;
        vncMaxFpsCombo.Items.AddRange(new object[] { "기본값 (15 fps)", "30 fps", "15 fps", "10 fps", "5 fps" });
        vncMaxFpsCombo.Location = new Point(285, 80);
        vncMaxFpsCombo.Size = new Size(130, 23);
        vncMaxFpsCombo.SelectedIndex = 2;

        vncUseTlsCheck.AutoSize = true;
        vncUseTlsCheck.Location = new Point(12, 112);
        vncUseTlsCheck.Text = "TLS 암호화";
        vncUseTlsCheck.UseVisualStyleBackColor = true;

        vncIgnoreTlsCertCheck.AutoSize = true;
        vncIgnoreTlsCertCheck.Location = new Point(160, 112);
        vncIgnoreTlsCertCheck.Text = "인증서 오류 무시";
        vncIgnoreTlsCertCheck.UseVisualStyleBackColor = true;

        buttonOk.DialogResult = DialogResult.OK;
        buttonOk.Location = new Point(356, 164);
        buttonOk.Size = new Size(80, 32);
        buttonOk.Text = "확인";
        buttonOk.UseVisualStyleBackColor = true;

        buttonCancel.DialogResult = DialogResult.Cancel;
        buttonCancel.Location = new Point(452, 164);
        buttonCancel.Size = new Size(80, 32);
        buttonCancel.Text = "취소";
        buttonCancel.UseVisualStyleBackColor = true;

        AcceptButton = buttonOk;
        CancelButton = buttonCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(544, 208);
        Controls.Add(groupVncOptions);
        Controls.Add(buttonOk);
        Controls.Add(buttonCancel);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "VncAdvancedSettingsDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "VNC 고급 설정";

        groupVncOptions.ResumeLayout(false);
        groupVncOptions.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}

#nullable restore
