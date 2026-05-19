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
    private GroupBox groupRecording;
    private Label labelRecordingFps;
    private ComboBox recordingFpsCombo;
    private Label labelRecordingFolder;
    private TextBox recordingFolderText;
    private Button recordingFolderBrowseButton;
    private Label labelRecordingHint;
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
        groupRecording = new GroupBox();
        labelRecordingFps = new Label();
        recordingFpsCombo = new ComboBox();
        labelRecordingFolder = new Label();
        recordingFolderText = new TextBox();
        recordingFolderBrowseButton = new Button();
        labelRecordingHint = new Label();
        buttonOk = new Button();
        buttonCancel = new Button();
        groupVncOptions.SuspendLayout();
        groupRecording.SuspendLayout();
        SuspendLayout();
        // 
        // groupVncOptions
        // 
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
        // 
        // vncViewOnlyCheck
        // 
        vncViewOnlyCheck.AutoSize = true;
        vncViewOnlyCheck.Location = new Point(12, 24);
        vncViewOnlyCheck.Name = "vncViewOnlyCheck";
        vncViewOnlyCheck.Size = new Size(126, 19);
        vncViewOnlyCheck.TabIndex = 0;
        vncViewOnlyCheck.Text = "화면 전용(뷰 온리)";
        vncViewOnlyCheck.UseVisualStyleBackColor = true;
        // 
        // vncShareDesktopCheck
        // 
        vncShareDesktopCheck.AutoSize = true;
        vncShareDesktopCheck.Checked = true;
        vncShareDesktopCheck.CheckState = CheckState.Checked;
        vncShareDesktopCheck.Location = new Point(160, 24);
        vncShareDesktopCheck.Name = "vncShareDesktopCheck";
        vncShareDesktopCheck.Size = new Size(78, 19);
        vncShareDesktopCheck.TabIndex = 1;
        vncShareDesktopCheck.Text = "화면 공유";
        vncShareDesktopCheck.UseVisualStyleBackColor = true;
        // 
        // vncRemoteCursorCheck
        // 
        vncRemoteCursorCheck.AutoSize = true;
        vncRemoteCursorCheck.Checked = true;
        vncRemoteCursorCheck.CheckState = CheckState.Checked;
        vncRemoteCursorCheck.Location = new Point(280, 24);
        vncRemoteCursorCheck.Name = "vncRemoteCursorCheck";
        vncRemoteCursorCheck.Size = new Size(78, 19);
        vncRemoteCursorCheck.TabIndex = 2;
        vncRemoteCursorCheck.Text = "원격 커서";
        vncRemoteCursorCheck.UseVisualStyleBackColor = true;
        // 
        // vncAutoReconnectCheck
        // 
        vncAutoReconnectCheck.AutoSize = true;
        vncAutoReconnectCheck.Location = new Point(390, 24);
        vncAutoReconnectCheck.Name = "vncAutoReconnectCheck";
        vncAutoReconnectCheck.Size = new Size(90, 19);
        vncAutoReconnectCheck.TabIndex = 3;
        vncAutoReconnectCheck.Text = "자동 재연결";
        vncAutoReconnectCheck.UseVisualStyleBackColor = true;
        // 
        // vncClipFromServerCheck
        // 
        vncClipFromServerCheck.AutoSize = true;
        vncClipFromServerCheck.Checked = true;
        vncClipFromServerCheck.CheckState = CheckState.Checked;
        vncClipFromServerCheck.Location = new Point(12, 52);
        vncClipFromServerCheck.Name = "vncClipFromServerCheck";
        vncClipFromServerCheck.Size = new Size(102, 19);
        vncClipFromServerCheck.TabIndex = 4;
        vncClipFromServerCheck.Text = "클립보드 수신";
        vncClipFromServerCheck.UseVisualStyleBackColor = true;
        // 
        // vncClipToServerCheck
        // 
        vncClipToServerCheck.AutoSize = true;
        vncClipToServerCheck.Checked = true;
        vncClipToServerCheck.CheckState = CheckState.Checked;
        vncClipToServerCheck.Location = new Point(160, 52);
        vncClipToServerCheck.Name = "vncClipToServerCheck";
        vncClipToServerCheck.Size = new Size(102, 19);
        vncClipToServerCheck.TabIndex = 5;
        vncClipToServerCheck.Text = "클립보드 송신";
        vncClipToServerCheck.UseVisualStyleBackColor = true;
        // 
        // labelVncSizeMode
        // 
        labelVncSizeMode.AutoSize = false;
        labelVncSizeMode.Location = new Point(12, 80);
        labelVncSizeMode.Name = "labelVncSizeMode";
        labelVncSizeMode.Size = new Size(70, 23);
        labelVncSizeMode.TabIndex = 6;
        labelVncSizeMode.Text = "화면 맞춤:";
        labelVncSizeMode.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // vncSizeModeCombo
        // 
        vncSizeModeCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        vncSizeModeCombo.FormattingEnabled = true;
        vncSizeModeCombo.Items.AddRange(new object[] { "Zoom", "Stretch", "Clip", "AutoSize", "Center" });
        vncSizeModeCombo.Location = new Point(88, 80);
        vncSizeModeCombo.Name = "vncSizeModeCombo";
        vncSizeModeCombo.Size = new Size(110, 23);
        vncSizeModeCombo.TabIndex = 7;
        // 
        // labelVncMaxFps
        // 
        labelVncMaxFps.AutoSize = false;
        labelVncMaxFps.Location = new Point(207, 80);
        labelVncMaxFps.Name = "labelVncMaxFps";
        labelVncMaxFps.Size = new Size(72, 23);
        labelVncMaxFps.TabIndex = 8;
        labelVncMaxFps.Text = "최대 FPS:";
        labelVncMaxFps.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // vncMaxFpsCombo
        // 
        vncMaxFpsCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        vncMaxFpsCombo.FormattingEnabled = true;
        vncMaxFpsCombo.Items.AddRange(new object[] { "기본값 (15 fps)", "30 fps", "15 fps", "10 fps", "5 fps" });
        vncMaxFpsCombo.Location = new Point(285, 80);
        vncMaxFpsCombo.Name = "vncMaxFpsCombo";
        vncMaxFpsCombo.Size = new Size(130, 23);
        vncMaxFpsCombo.TabIndex = 9;
        // 
        // vncUseTlsCheck
        // 
        vncUseTlsCheck.AutoSize = true;
        vncUseTlsCheck.Location = new Point(12, 112);
        vncUseTlsCheck.Name = "vncUseTlsCheck";
        vncUseTlsCheck.Size = new Size(85, 19);
        vncUseTlsCheck.TabIndex = 10;
        vncUseTlsCheck.Text = "TLS 암호화";
        vncUseTlsCheck.UseVisualStyleBackColor = true;
        // 
        // vncIgnoreTlsCertCheck
        // 
        vncIgnoreTlsCertCheck.AutoSize = true;
        vncIgnoreTlsCertCheck.Location = new Point(160, 112);
        vncIgnoreTlsCertCheck.Name = "vncIgnoreTlsCertCheck";
        vncIgnoreTlsCertCheck.Size = new Size(118, 19);
        vncIgnoreTlsCertCheck.TabIndex = 11;
        vncIgnoreTlsCertCheck.Text = "인증서 오류 무시";
        vncIgnoreTlsCertCheck.UseVisualStyleBackColor = true;
        // 
        // groupRecording
        // 
        groupRecording.Controls.Add(labelRecordingFps);
        groupRecording.Controls.Add(recordingFpsCombo);
        groupRecording.Controls.Add(labelRecordingFolder);
        groupRecording.Controls.Add(recordingFolderText);
        groupRecording.Controls.Add(recordingFolderBrowseButton);
        groupRecording.Controls.Add(labelRecordingHint);
        groupRecording.Location = new Point(12, 158);
        groupRecording.Name = "groupRecording";
        groupRecording.Padding = new Padding(8);
        groupRecording.Size = new Size(520, 134);
        groupRecording.TabIndex = 1;
        groupRecording.TabStop = false;
        groupRecording.Text = "화면 녹화 (H.264 MP4)";
        // 
        // labelRecordingFps
        // 
        labelRecordingFps.AutoSize = false;
        labelRecordingFps.Location = new Point(12, 24);
        labelRecordingFps.Name = "labelRecordingFps";
        labelRecordingFps.Size = new Size(70, 23);
        labelRecordingFps.TabIndex = 0;
        labelRecordingFps.Text = "녹화 FPS:";
        labelRecordingFps.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // recordingFpsCombo
        // 
        recordingFpsCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        recordingFpsCombo.FormattingEnabled = true;
        recordingFpsCombo.Items.AddRange(new object[] { "30 fps", "24 fps", "15 fps", "10 fps", "5 fps" });
        recordingFpsCombo.Location = new Point(88, 24);
        recordingFpsCombo.Name = "recordingFpsCombo";
        recordingFpsCombo.Size = new Size(120, 23);
        recordingFpsCombo.TabIndex = 1;
        // 
        // labelRecordingFolder
        // 
        labelRecordingFolder.AutoSize = false;
        labelRecordingFolder.Location = new Point(12, 52);
        labelRecordingFolder.Name = "labelRecordingFolder";
        labelRecordingFolder.Size = new Size(70, 23);
        labelRecordingFolder.TabIndex = 2;
        labelRecordingFolder.Text = "저장 폴더:";
        labelRecordingFolder.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // recordingFolderText
        // 
        recordingFolderText.Location = new Point(88, 52);
        recordingFolderText.Name = "recordingFolderText";
        recordingFolderText.PlaceholderText = "비워 두면 동영상\\RemoteDesktopWinV10";
        recordingFolderText.Size = new Size(314, 23);
        recordingFolderText.TabIndex = 3;
        //
        // recordingFolderBrowseButton
        //
        recordingFolderBrowseButton.Location = new Point(408, 48);
        recordingFolderBrowseButton.Name = "recordingFolderBrowseButton";
        recordingFolderBrowseButton.Size = new Size(98, 32);
        recordingFolderBrowseButton.TabIndex = 4;
        recordingFolderBrowseButton.Text = "찾아보기…";
        recordingFolderBrowseButton.UseVisualStyleBackColor = true;
        // 
        // labelRecordingHint
        // 
        labelRecordingHint.ForeColor = SystemColors.GrayText;
        labelRecordingHint.Location = new Point(12, 84);
        labelRecordingHint.Name = "labelRecordingHint";
        labelRecordingHint.Size = new Size(496, 36);
        labelRecordingHint.TabIndex = 5;
        labelRecordingHint.Text = "Windows Media Foundation H.264 인코더를 사용합니다. 별도 코덱 설치가 필요 없습니다.";
        // 
        // buttonOk
        // 
        buttonOk.DialogResult = DialogResult.OK;
        buttonOk.Location = new Point(356, 302);
        buttonOk.Name = "buttonOk";
        buttonOk.Size = new Size(80, 32);
        buttonOk.TabIndex = 2;
        buttonOk.Text = "확인";
        buttonOk.UseVisualStyleBackColor = true;
        // 
        // buttonCancel
        // 
        buttonCancel.DialogResult = DialogResult.Cancel;
        buttonCancel.Location = new Point(452, 302);
        buttonCancel.Name = "buttonCancel";
        buttonCancel.Size = new Size(80, 32);
        buttonCancel.TabIndex = 3;
        buttonCancel.Text = "취소";
        buttonCancel.UseVisualStyleBackColor = true;
        // 
        // VncAdvancedSettingsDialog
        // 
        AcceptButton = buttonOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = buttonCancel;
        ClientSize = new Size(544, 346);
        Controls.Add(groupVncOptions);
        Controls.Add(groupRecording);
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
        groupRecording.ResumeLayout(false);
        groupRecording.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}

#nullable restore
