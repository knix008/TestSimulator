namespace VNCServer;

partial class AdvancedSettingsForm
{
    private System.ComponentModel.IContainer components = null;

    // Tab Control
    private TabControl tabControl;
    private TabPage tabSecurity;
    private TabPage tabPerformance;
    private TabPage tabFeatures;
    private TabPage tabNetwork;
    private TabPage tabScreen;
    private TabPage tabRecording;
    private TabPage tabWebManagement;
    private TabPage tabMedia;
    private TabPage tabAdvanced;

    // Buttons
    private Button btnSave;
    private Button btnCancel;
    private Button btnApply;
    private Button btnReset;

    // 보안 탭
    private CheckBox chkEnableTLS;
    private Label lblCertificatePath;
    private TextBox txtCertificatePath;
    private Button btnBrowseCertificate;
    private Label lblSecurityInfo;

    // 성능 탭
    private Label lblImageQuality;
    private TrackBar trackImageQuality;
    private Label lblImageQualityValue;
    private Label lblFrameRate;
    private NumericUpDown numFrameRate;
    private Label lblCompressionLevel;
    private NumericUpDown numCompressionLevel;
    private Label lblPerformanceInfo;

    // 기능 탭
    private CheckBox chkClipboardSync;
    private CheckBox chkLogging;
    private CheckBox chkViewOnlyMode;
    private CheckBox chkAllowControlRequest;
    private Label lblFeaturesInfo;

    // 네트워크 탭
    private CheckBox chkEnableIPv6;
    private Label lblBindAddress;
    private TextBox txtBindAddress;
    private CheckBox chkEnableUPnP;
    private CheckBox chkAutoMapPort;
    private Label lblNetworkInfo;

    // 화면 탭
    private CheckBox chkUseSelectedArea;
    private Label lblAreaX;
    private NumericUpDown numAreaX;
    private Label lblAreaY;
    private NumericUpDown numAreaY;
    private Label lblAreaWidth;
    private NumericUpDown numAreaWidth;
    private Label lblAreaHeight;
    private NumericUpDown numAreaHeight;
    private Label lblMonitorMode;
    private ComboBox cmbMonitorMode;
    private Label lblMonitorIndex;
    private NumericUpDown numMonitorIndex;
    private Label lblScreenInfo;

    // 녹화 탭
    private Label lblRecordingFPS;
    private NumericUpDown numRecordingFPS;
    private Label lblRecordingQuality;
    private NumericUpDown numRecordingQuality;
    private Label lblRecordingInfo;

    // 웹 관리 탭
    private CheckBox chkEnableWebManagement;
    private Label lblWebPort;
    private NumericUpDown numWebPort;
    private Label lblWebManagementInfo;

    // 미디어 탭
    private GroupBox grpAudio;
    private CheckBox chkEnableAudio;
    private Label lblAudioSampleRate;
    private NumericUpDown numAudioSampleRate;
    private Label lblAudioChannels;
    private NumericUpDown numAudioChannels;
    private GroupBox grpVideo;
    private CheckBox chkEnableVideo;
    private Label lblVideoCodec;
    private ComboBox cmbVideoCodec;
    private Label lblVideoQuality;
    private ComboBox cmbVideoQuality;

    // 고급 탭
    private GroupBox grpTouch;
    private CheckBox chkEnableTouch;
    private Label lblMaxTouchPoints;
    private NumericUpDown numMaxTouchPoints;
    private GroupBox grpReconnect;
    private CheckBox chkEnableReconnect;
    private Label lblSessionTimeout;
    private NumericUpDown numSessionTimeout;
    private Label lblMaxReconnectAttempts;
    private NumericUpDown numMaxReconnectAttempts;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        this.components = new System.ComponentModel.Container();
        
        // Initialize controls
        this.tabControl = new TabControl();
        this.tabSecurity = new TabPage();
        this.tabPerformance = new TabPage();
        this.tabFeatures = new TabPage();
        this.tabNetwork = new TabPage();
        this.tabScreen = new TabPage();
        this.tabRecording = new TabPage();
        this.tabWebManagement = new TabPage();
        this.tabMedia = new TabPage();
        this.tabAdvanced = new TabPage();

        this.btnSave = new Button();
        this.btnCancel = new Button();
        this.btnApply = new Button();
        this.btnReset = new Button();

        InitializeSecurityTab();
        InitializePerformanceTab();
        InitializeFeaturesTab();
        InitializeNetworkTab();
        InitializeScreenTab();
        InitializeRecordingTab();
        InitializeWebManagementTab();
        InitializeMediaTab();
        InitializeAdvancedTab();

        // TabControl
        this.tabControl.Controls.Add(this.tabSecurity);
        this.tabControl.Controls.Add(this.tabPerformance);
        this.tabControl.Controls.Add(this.tabFeatures);
        this.tabControl.Controls.Add(this.tabNetwork);
        this.tabControl.Controls.Add(this.tabScreen);
        this.tabControl.Controls.Add(this.tabRecording);
        this.tabControl.Controls.Add(this.tabWebManagement);
        this.tabControl.Controls.Add(this.tabMedia);
        this.tabControl.Controls.Add(this.tabAdvanced);
        this.tabControl.Location = new Point(12, 12);
        this.tabControl.Name = "tabControl";
        this.tabControl.SelectedIndex = 0;
        this.tabControl.Size = new Size(660, 430);
        this.tabControl.TabIndex = 0;

        // Buttons
        this.btnReset.Location = new Point(12, 450);
        this.btnReset.Name = "btnReset";
        this.btnReset.Size = new Size(120, 30);
        this.btnReset.TabIndex = 0;
        this.btnReset.Text = "기본값으로 초기화";
        this.btnReset.UseVisualStyleBackColor = true;
        this.btnReset.Click += BtnReset_Click;

        this.btnSave.Location = new Point(430, 450);
        this.btnSave.Name = "btnSave";
        this.btnSave.Size = new Size(75, 30);
        this.btnSave.TabIndex = 1;
        this.btnSave.Text = "저장";
        this.btnSave.UseVisualStyleBackColor = true;
        this.btnSave.Click += BtnSave_Click;

        this.btnApply.Location = new Point(511, 450);
        this.btnApply.Name = "btnApply";
        this.btnApply.Size = new Size(75, 30);
        this.btnApply.TabIndex = 2;
        this.btnApply.Text = "적용";
        this.btnApply.UseVisualStyleBackColor = true;
        this.btnApply.Click += BtnApply_Click;

        this.btnCancel.Location = new Point(592, 450);
        this.btnCancel.Name = "btnCancel";
        this.btnCancel.Size = new Size(75, 30);
        this.btnCancel.TabIndex = 3;
        this.btnCancel.Text = "취소";
        this.btnCancel.UseVisualStyleBackColor = true;
        this.btnCancel.Click += BtnCancel_Click;

        // Form
        this.AutoScaleDimensions = new SizeF(7F, 15F);
        this.AutoScaleMode = AutoScaleMode.Font;
        this.ClientSize = new Size(684, 491);
        this.Controls.Add(this.btnReset);
        this.Controls.Add(this.btnCancel);
        this.Controls.Add(this.btnApply);
        this.Controls.Add(this.btnSave);
        this.Controls.Add(this.tabControl);
        this.FormBorderStyle = FormBorderStyle.FixedDialog;
        this.MaximizeBox = false;
        this.MinimizeBox = false;
        this.Name = "AdvancedSettingsForm";
        this.StartPosition = FormStartPosition.CenterParent;
        this.Text = "고급 설정";

        this.tabControl.ResumeLayout(false);
        this.ResumeLayout(false);
    }

    private void InitializeSecurityTab()
    {
        this.chkEnableTLS = new CheckBox();
        this.lblCertificatePath = new Label();
        this.txtCertificatePath = new TextBox();
        this.btnBrowseCertificate = new Button();
        this.lblSecurityInfo = new Label();

        this.tabSecurity.Controls.Add(this.lblSecurityInfo);
        this.tabSecurity.Controls.Add(this.btnBrowseCertificate);
        this.tabSecurity.Controls.Add(this.txtCertificatePath);
        this.tabSecurity.Controls.Add(this.lblCertificatePath);
        this.tabSecurity.Controls.Add(this.chkEnableTLS);
        this.tabSecurity.Location = new Point(4, 24);
        this.tabSecurity.Name = "tabSecurity";
        this.tabSecurity.Padding = new Padding(3);
        this.tabSecurity.Size = new Size(652, 402);
        this.tabSecurity.TabIndex = 0;
        this.tabSecurity.Text = "보안";
        this.tabSecurity.UseVisualStyleBackColor = true;

        this.chkEnableTLS.AutoSize = true;
        this.chkEnableTLS.Location = new Point(20, 20);
        this.chkEnableTLS.Name = "chkEnableTLS";
        this.chkEnableTLS.Size = new Size(200, 19);
        this.chkEnableTLS.TabIndex = 0;
        this.chkEnableTLS.Text = "TLS/SSL 암호화 활성화";
        this.chkEnableTLS.UseVisualStyleBackColor = true;
        this.chkEnableTLS.CheckedChanged += ChkEnableTLS_CheckedChanged;

        this.lblCertificatePath.AutoSize = true;
        this.lblCertificatePath.Location = new Point(20, 55);
        this.lblCertificatePath.Name = "lblCertificatePath";
        this.lblCertificatePath.Size = new Size(120, 15);
        this.lblCertificatePath.TabIndex = 1;
        this.lblCertificatePath.Text = "인증서 파일 경로:";

        this.txtCertificatePath.Location = new Point(20, 75);
        this.txtCertificatePath.Name = "txtCertificatePath";
        this.txtCertificatePath.Size = new Size(450, 23);
        this.txtCertificatePath.TabIndex = 2;
        this.txtCertificatePath.Enabled = false;

        this.btnBrowseCertificate.Location = new Point(480, 73);
        this.btnBrowseCertificate.Name = "btnBrowseCertificate";
        this.btnBrowseCertificate.Size = new Size(80, 25);
        this.btnBrowseCertificate.TabIndex = 3;
        this.btnBrowseCertificate.Text = "찾아보기...";
        this.btnBrowseCertificate.UseVisualStyleBackColor = true;
        this.btnBrowseCertificate.Enabled = false;
        this.btnBrowseCertificate.Click += BtnBrowseCertificate_Click;

        this.lblSecurityInfo.Location = new Point(20, 120);
        this.lblSecurityInfo.Name = "lblSecurityInfo";
        this.lblSecurityInfo.Size = new Size(600, 60);
        this.lblSecurityInfo.TabIndex = 4;
        this.lblSecurityInfo.Text = "✓ TLS 암호화로 안전한 원격 연결을 보장합니다.\n" +
                                   "✓ 인증서는 .pfx 또는 .p12 형식을 지원합니다.\n" +
                                   "✓ 비워두면 자동으로 자체 서명 인증서를 생성합니다.";
    }

    private void InitializePerformanceTab()
    {
        this.lblImageQuality = new Label();
        this.trackImageQuality = new TrackBar();
        this.lblImageQualityValue = new Label();
        this.lblFrameRate = new Label();
        this.numFrameRate = new NumericUpDown();
        this.lblCompressionLevel = new Label();
        this.numCompressionLevel = new NumericUpDown();
        this.lblPerformanceInfo = new Label();

        this.tabPerformance.Controls.Add(this.lblPerformanceInfo);
        this.tabPerformance.Controls.Add(this.numCompressionLevel);
        this.tabPerformance.Controls.Add(this.lblCompressionLevel);
        this.tabPerformance.Controls.Add(this.numFrameRate);
        this.tabPerformance.Controls.Add(this.lblFrameRate);
        this.tabPerformance.Controls.Add(this.lblImageQualityValue);
        this.tabPerformance.Controls.Add(this.trackImageQuality);
        this.tabPerformance.Controls.Add(this.lblImageQuality);
        this.tabPerformance.Location = new Point(4, 24);
        this.tabPerformance.Name = "tabPerformance";
        this.tabPerformance.Padding = new Padding(3);
        this.tabPerformance.Size = new Size(652, 402);
        this.tabPerformance.TabIndex = 1;
        this.tabPerformance.Text = "성능";
        this.tabPerformance.UseVisualStyleBackColor = true;

        this.lblImageQuality.AutoSize = true;
        this.lblImageQuality.Location = new Point(20, 20);
        this.lblImageQuality.Name = "lblImageQuality";
        this.lblImageQuality.Size = new Size(150, 15);
        this.lblImageQuality.TabIndex = 0;
        this.lblImageQuality.Text = "이미지 품질 (1-100):";

        this.trackImageQuality.Location = new Point(20, 40);
        this.trackImageQuality.Maximum = 100;
        this.trackImageQuality.Minimum = 1;
        this.trackImageQuality.Name = "trackImageQuality";
        this.trackImageQuality.Size = new Size(500, 45);
        this.trackImageQuality.TabIndex = 1;
        this.trackImageQuality.TickFrequency = 10;
        this.trackImageQuality.Value = 75;
        this.trackImageQuality.Scroll += TrackImageQuality_Scroll;

        this.lblImageQualityValue.AutoSize = true;
        this.lblImageQualityValue.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        this.lblImageQualityValue.Location = new Point(530, 50);
        this.lblImageQualityValue.Name = "lblImageQualityValue";
        this.lblImageQualityValue.Size = new Size(25, 15);
        this.lblImageQualityValue.TabIndex = 2;
        this.lblImageQualityValue.Text = "75";

        this.lblFrameRate.AutoSize = true;
        this.lblFrameRate.Location = new Point(20, 100);
        this.lblFrameRate.Name = "lblFrameRate";
        this.lblFrameRate.Size = new Size(150, 15);
        this.lblFrameRate.TabIndex = 3;
        this.lblFrameRate.Text = "프레임레이트 (FPS):";

        this.numFrameRate.Location = new Point(200, 97);
        this.numFrameRate.Maximum = new decimal(new int[] { 60, 0, 0, 0 });
        this.numFrameRate.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        this.numFrameRate.Name = "numFrameRate";
        this.numFrameRate.Size = new Size(120, 23);
        this.numFrameRate.TabIndex = 4;
        this.numFrameRate.Value = new decimal(new int[] { 30, 0, 0, 0 });

        this.lblCompressionLevel.AutoSize = true;
        this.lblCompressionLevel.Location = new Point(20, 140);
        this.lblCompressionLevel.Name = "lblCompressionLevel";
        this.lblCompressionLevel.Size = new Size(150, 15);
        this.lblCompressionLevel.TabIndex = 5;
        this.lblCompressionLevel.Text = "압축 레벨 (0-9):";

        this.numCompressionLevel.Location = new Point(200, 137);
        this.numCompressionLevel.Maximum = new decimal(new int[] { 9, 0, 0, 0 });
        this.numCompressionLevel.Minimum = new decimal(new int[] { 0, 0, 0, 0 });
        this.numCompressionLevel.Name = "numCompressionLevel";
        this.numCompressionLevel.Size = new Size(120, 23);
        this.numCompressionLevel.TabIndex = 6;
        this.numCompressionLevel.Value = new decimal(new int[] { 6, 0, 0, 0 });

        this.lblPerformanceInfo.Location = new Point(20, 180);
        this.lblPerformanceInfo.Name = "lblPerformanceInfo";
        this.lblPerformanceInfo.Size = new Size(600, 80);
        this.lblPerformanceInfo.TabIndex = 7;
        this.lblPerformanceInfo.Text = "성능 최적화 가이드:\n" +
                                       "• 낮은 품질 (30): 저속 네트워크용, CPU 사용량 낮음\n" +
                                       "• 중간 품질 (60): 권장 설정, 균형있는 성능\n" +
                                       "• 높은 품질 (85): 고속 네트워크용, 최상의 화질\n" +
                                       "• 압축 레벨이 높을수록 전송량 감소, CPU 사용량 증가";
    }

    private void InitializeFeaturesTab()
    {
        this.chkClipboardSync = new CheckBox();
        this.chkLogging = new CheckBox();
        this.chkViewOnlyMode = new CheckBox();
        this.chkAllowControlRequest = new CheckBox();
        this.lblFeaturesInfo = new Label();

        this.tabFeatures.Controls.Add(this.lblFeaturesInfo);
        this.tabFeatures.Controls.Add(this.chkAllowControlRequest);
        this.tabFeatures.Controls.Add(this.chkViewOnlyMode);
        this.tabFeatures.Controls.Add(this.chkLogging);
        this.tabFeatures.Controls.Add(this.chkClipboardSync);
        this.tabFeatures.Location = new Point(4, 24);
        this.tabFeatures.Name = "tabFeatures";
        this.tabFeatures.Size = new Size(652, 402);
        this.tabFeatures.TabIndex = 2;
        this.tabFeatures.Text = "기능";
        this.tabFeatures.UseVisualStyleBackColor = true;

        this.chkClipboardSync.AutoSize = true;
        this.chkClipboardSync.Location = new Point(20, 20);
        this.chkClipboardSync.Name = "chkClipboardSync";
        this.chkClipboardSync.Size = new Size(200, 19);
        this.chkClipboardSync.TabIndex = 0;
        this.chkClipboardSync.Text = "클립보드 동기화 (텍스트+이미지)";
        this.chkClipboardSync.UseVisualStyleBackColor = true;

        this.chkLogging.AutoSize = true;
        this.chkLogging.Location = new Point(20, 50);
        this.chkLogging.Name = "chkLogging";
        this.chkLogging.Size = new Size(180, 19);
        this.chkLogging.TabIndex = 1;
        this.chkLogging.Text = "접속 로그 및 통계 기록";
        this.chkLogging.UseVisualStyleBackColor = true;

        this.chkViewOnlyMode.AutoSize = true;
        this.chkViewOnlyMode.Location = new Point(20, 80);
        this.chkViewOnlyMode.Name = "chkViewOnlyMode";
        this.chkViewOnlyMode.Size = new Size(200, 19);
        this.chkViewOnlyMode.TabIndex = 2;
        this.chkViewOnlyMode.Text = "보기 전용 모드 (입력 차단)";
        this.chkViewOnlyMode.UseVisualStyleBackColor = true;

        this.chkAllowControlRequest.AutoSize = true;
        this.chkAllowControlRequest.Location = new Point(20, 110);
        this.chkAllowControlRequest.Name = "chkAllowControlRequest";
        this.chkAllowControlRequest.Size = new Size(180, 19);
        this.chkAllowControlRequest.TabIndex = 3;
        this.chkAllowControlRequest.Text = "제어 권한 요청 허용";
        this.chkAllowControlRequest.UseVisualStyleBackColor = true;

        this.lblFeaturesInfo.Location = new Point(20, 150);
        this.lblFeaturesInfo.Name = "lblFeaturesInfo";
        this.lblFeaturesInfo.Size = new Size(600, 60);
        this.lblFeaturesInfo.TabIndex = 4;
        this.lblFeaturesInfo.Text = "✓ 클립보드 동기화: 서버와 클라이언트 간 복사/붙여넣기\n" +
                                   "✓ 보기 전용: 화면만 공유하고 제어는 차단";
    }

    private void InitializeNetworkTab()
    {
        this.chkEnableIPv6 = new CheckBox();
        this.lblBindAddress = new Label();
        this.txtBindAddress = new TextBox();
        this.chkEnableUPnP = new CheckBox();
        this.chkAutoMapPort = new CheckBox();
        this.lblNetworkInfo = new Label();

        this.tabNetwork.Controls.Add(this.lblNetworkInfo);
        this.tabNetwork.Controls.Add(this.chkAutoMapPort);
        this.tabNetwork.Controls.Add(this.chkEnableUPnP);
        this.tabNetwork.Controls.Add(this.txtBindAddress);
        this.tabNetwork.Controls.Add(this.lblBindAddress);
        this.tabNetwork.Controls.Add(this.chkEnableIPv6);
        this.tabNetwork.Location = new Point(4, 24);
        this.tabNetwork.Name = "tabNetwork";
        this.tabNetwork.Size = new Size(652, 402);
        this.tabNetwork.TabIndex = 3;
        this.tabNetwork.Text = "네트워크";
        this.tabNetwork.UseVisualStyleBackColor = true;

        this.chkEnableIPv6.AutoSize = true;
        this.chkEnableIPv6.Location = new Point(20, 20);
        this.chkEnableIPv6.Name = "chkEnableIPv6";
        this.chkEnableIPv6.Size = new Size(200, 19);
        this.chkEnableIPv6.TabIndex = 0;
        this.chkEnableIPv6.Text = "IPv6 지원 활성화";
        this.chkEnableIPv6.UseVisualStyleBackColor = true;

        this.lblBindAddress.AutoSize = true;
        this.lblBindAddress.Location = new Point(20, 55);
        this.lblBindAddress.Name = "lblBindAddress";
        this.lblBindAddress.Size = new Size(200, 15);
        this.lblBindAddress.TabIndex = 1;
        this.lblBindAddress.Text = "바인딩 주소 (0.0.0.0 / ::0):";

        this.txtBindAddress.Location = new Point(20, 75);
        this.txtBindAddress.Name = "txtBindAddress";
        this.txtBindAddress.Size = new Size(300, 23);
        this.txtBindAddress.TabIndex = 2;
        this.txtBindAddress.Text = "0.0.0.0";

        this.chkEnableUPnP.AutoSize = true;
        this.chkEnableUPnP.Location = new Point(20, 115);
        this.chkEnableUPnP.Name = "chkEnableUPnP";
        this.chkEnableUPnP.Size = new Size(250, 19);
        this.chkEnableUPnP.TabIndex = 3;
        this.chkEnableUPnP.Text = "UPnP 자동 포트 포워딩 활성화";
        this.chkEnableUPnP.UseVisualStyleBackColor = true;

        this.chkAutoMapPort.AutoSize = true;
        this.chkAutoMapPort.Location = new Point(40, 145);
        this.chkAutoMapPort.Name = "chkAutoMapPort";
        this.chkAutoMapPort.Size = new Size(230, 19);
        this.chkAutoMapPort.TabIndex = 4;
        this.chkAutoMapPort.Text = "서버 시작 시 자동으로 매핑";
        this.chkAutoMapPort.UseVisualStyleBackColor = true;

        this.lblNetworkInfo.Location = new Point(20, 185);
        this.lblNetworkInfo.Name = "lblNetworkInfo";
        this.lblNetworkInfo.Size = new Size(600, 80);
        this.lblNetworkInfo.TabIndex = 5;
        this.lblNetworkInfo.Text = "네트워크 설정 가이드:\n" +
                                   "• IPv6: 차세대 인터넷 프로토콜 지원 (::0은 듀얼 스택)\n" +
                                   "• 0.0.0.0: 모든 네트워크 인터페이스에서 연결 허용\n" +
                                   "• UPnP: 라우터에서 자동으로 포트를 열어 외부 접속 가능\n" +
                                   "• 라우터가 UPnP를 지원해야 자동 매핑이 작동합니다";
    }

    private void InitializeScreenTab()
    {
        this.chkUseSelectedArea = new CheckBox();
        this.lblAreaX = new Label();
        this.numAreaX = new NumericUpDown();
        this.lblAreaY = new Label();
        this.numAreaY = new NumericUpDown();
        this.lblAreaWidth = new Label();
        this.numAreaWidth = new NumericUpDown();
        this.lblAreaHeight = new Label();
        this.numAreaHeight = new NumericUpDown();
        this.lblMonitorMode = new Label();
        this.cmbMonitorMode = new ComboBox();
        this.lblMonitorIndex = new Label();
        this.numMonitorIndex = new NumericUpDown();
        this.lblScreenInfo = new Label();

        this.tabScreen.Controls.Add(this.lblScreenInfo);
        this.tabScreen.Controls.Add(this.numMonitorIndex);
        this.tabScreen.Controls.Add(this.lblMonitorIndex);
        this.tabScreen.Controls.Add(this.cmbMonitorMode);
        this.tabScreen.Controls.Add(this.lblMonitorMode);
        this.tabScreen.Controls.Add(this.numAreaHeight);
        this.tabScreen.Controls.Add(this.lblAreaHeight);
        this.tabScreen.Controls.Add(this.numAreaWidth);
        this.tabScreen.Controls.Add(this.lblAreaWidth);
        this.tabScreen.Controls.Add(this.numAreaY);
        this.tabScreen.Controls.Add(this.lblAreaY);
        this.tabScreen.Controls.Add(this.numAreaX);
        this.tabScreen.Controls.Add(this.lblAreaX);
        this.tabScreen.Controls.Add(this.chkUseSelectedArea);
        this.tabScreen.Location = new Point(4, 24);
        this.tabScreen.Name = "tabScreen";
        this.tabScreen.Size = new Size(652, 402);
        this.tabScreen.TabIndex = 4;
        this.tabScreen.Text = "화면";
        this.tabScreen.UseVisualStyleBackColor = true;

        this.chkUseSelectedArea.AutoSize = true;
        this.chkUseSelectedArea.Location = new Point(20, 20);
        this.chkUseSelectedArea.Name = "chkUseSelectedArea";
        this.chkUseSelectedArea.Size = new Size(180, 19);
        this.chkUseSelectedArea.TabIndex = 0;
        this.chkUseSelectedArea.Text = "선택 영역만 공유";
        this.chkUseSelectedArea.UseVisualStyleBackColor = true;
        this.chkUseSelectedArea.CheckedChanged += ChkUseSelectedArea_CheckedChanged;

        this.lblAreaX.AutoSize = true;
        this.lblAreaX.Location = new Point(40, 55);
        this.lblAreaX.Name = "lblAreaX";
        this.lblAreaX.Size = new Size(30, 15);
        this.lblAreaX.TabIndex = 1;
        this.lblAreaX.Text = "X:";

        this.numAreaX.Location = new Point(80, 52);
        this.numAreaX.Maximum = new decimal(new int[] { 10000, 0, 0, 0 });
        this.numAreaX.Name = "numAreaX";
        this.numAreaX.Size = new Size(100, 23);
        this.numAreaX.TabIndex = 2;
        this.numAreaX.Enabled = false;

        this.lblAreaY.AutoSize = true;
        this.lblAreaY.Location = new Point(200, 55);
        this.lblAreaY.Name = "lblAreaY";
        this.lblAreaY.Size = new Size(30, 15);
        this.lblAreaY.TabIndex = 3;
        this.lblAreaY.Text = "Y:";

        this.numAreaY.Location = new Point(240, 52);
        this.numAreaY.Maximum = new decimal(new int[] { 10000, 0, 0, 0 });
        this.numAreaY.Name = "numAreaY";
        this.numAreaY.Size = new Size(100, 23);
        this.numAreaY.TabIndex = 4;
        this.numAreaY.Enabled = false;

        this.lblAreaWidth.AutoSize = true;
        this.lblAreaWidth.Location = new Point(40, 90);
        this.lblAreaWidth.Name = "lblAreaWidth";
        this.lblAreaWidth.Size = new Size(40, 15);
        this.lblAreaWidth.TabIndex = 5;
        this.lblAreaWidth.Text = "너비:";

        this.numAreaWidth.Location = new Point(80, 87);
        this.numAreaWidth.Maximum = new decimal(new int[] { 10000, 0, 0, 0 });
        this.numAreaWidth.Name = "numAreaWidth";
        this.numAreaWidth.Size = new Size(100, 23);
        this.numAreaWidth.TabIndex = 6;
        this.numAreaWidth.Value = new decimal(new int[] { 1920, 0, 0, 0 });
        this.numAreaWidth.Enabled = false;

        this.lblAreaHeight.AutoSize = true;
        this.lblAreaHeight.Location = new Point(200, 90);
        this.lblAreaHeight.Name = "lblAreaHeight";
        this.lblAreaHeight.Size = new Size(40, 15);
        this.lblAreaHeight.TabIndex = 7;
        this.lblAreaHeight.Text = "높이:";

        this.numAreaHeight.Location = new Point(240, 87);
        this.numAreaHeight.Maximum = new decimal(new int[] { 10000, 0, 0, 0 });
        this.numAreaHeight.Name = "numAreaHeight";
        this.numAreaHeight.Size = new Size(100, 23);
        this.numAreaHeight.TabIndex = 8;
        this.numAreaHeight.Value = new decimal(new int[] { 1080, 0, 0, 0 });
        this.numAreaHeight.Enabled = false;

        this.lblMonitorMode.AutoSize = true;
        this.lblMonitorMode.Location = new Point(20, 135);
        this.lblMonitorMode.Name = "lblMonitorMode";
        this.lblMonitorMode.Size = new Size(90, 15);
        this.lblMonitorMode.TabIndex = 9;
        this.lblMonitorMode.Text = "모니터 모드:";

        this.cmbMonitorMode.DropDownStyle = ComboBoxStyle.DropDownList;
        this.cmbMonitorMode.FormattingEnabled = true;
        this.cmbMonitorMode.Items.AddRange(new object[] { "모든 모니터", "주 모니터만", "특정 모니터" });
        this.cmbMonitorMode.Location = new Point(120, 132);
        this.cmbMonitorMode.Name = "cmbMonitorMode";
        this.cmbMonitorMode.Size = new Size(200, 23);
        this.cmbMonitorMode.TabIndex = 10;
        this.cmbMonitorMode.SelectedIndex = 0;
        this.cmbMonitorMode.SelectedIndexChanged += CmbMonitorMode_SelectedIndexChanged;

        this.lblMonitorIndex.AutoSize = true;
        this.lblMonitorIndex.Location = new Point(340, 135);
        this.lblMonitorIndex.Name = "lblMonitorIndex";
        this.lblMonitorIndex.Size = new Size(100, 15);
        this.lblMonitorIndex.TabIndex = 11;
        this.lblMonitorIndex.Text = "모니터 번호:";

        this.numMonitorIndex.Location = new Point(450, 132);
        this.numMonitorIndex.Maximum = new decimal(new int[] { 10, 0, 0, 0 });
        this.numMonitorIndex.Name = "numMonitorIndex";
        this.numMonitorIndex.Size = new Size(100, 23);
        this.numMonitorIndex.TabIndex = 12;
        this.numMonitorIndex.Enabled = false;

        this.lblScreenInfo.Location = new Point(20, 175);
        this.lblScreenInfo.Name = "lblScreenInfo";
        this.lblScreenInfo.Size = new Size(600, 60);
        this.lblScreenInfo.TabIndex = 13;
        this.lblScreenInfo.Text = "화면 공유 옵션:\n" +
                                  "• 선택 영역: 특정 영역만 캡처하여 성능 향상\n" +
                                  "• 다중 모니터: 여러 모니터 중 원하는 화면만 선택 가능";
    }

    private void InitializeRecordingTab()
    {
        this.lblRecordingFPS = new Label();
        this.numRecordingFPS = new NumericUpDown();
        this.lblRecordingQuality = new Label();
        this.numRecordingQuality = new NumericUpDown();
        this.lblRecordingInfo = new Label();

        this.tabRecording.Controls.Add(this.lblRecordingInfo);
        this.tabRecording.Controls.Add(this.numRecordingQuality);
        this.tabRecording.Controls.Add(this.lblRecordingQuality);
        this.tabRecording.Controls.Add(this.numRecordingFPS);
        this.tabRecording.Controls.Add(this.lblRecordingFPS);
        this.tabRecording.Location = new Point(4, 24);
        this.tabRecording.Name = "tabRecording";
        this.tabRecording.Size = new Size(652, 402);
        this.tabRecording.TabIndex = 5;
        this.tabRecording.Text = "녹화";
        this.tabRecording.UseVisualStyleBackColor = true;

        this.lblRecordingFPS.AutoSize = true;
        this.lblRecordingFPS.Location = new Point(20, 20);
        this.lblRecordingFPS.Name = "lblRecordingFPS";
        this.lblRecordingFPS.Size = new Size(120, 15);
        this.lblRecordingFPS.TabIndex = 0;
        this.lblRecordingFPS.Text = "녹화 FPS:";

        this.numRecordingFPS.Location = new Point(150, 17);
        this.numRecordingFPS.Maximum = new decimal(new int[] { 60, 0, 0, 0 });
        this.numRecordingFPS.Minimum = new decimal(new int[] { 5, 0, 0, 0 });
        this.numRecordingFPS.Name = "numRecordingFPS";
        this.numRecordingFPS.Size = new Size(120, 23);
        this.numRecordingFPS.TabIndex = 1;
        this.numRecordingFPS.Value = new decimal(new int[] { 15, 0, 0, 0 });

        this.lblRecordingQuality.AutoSize = true;
        this.lblRecordingQuality.Location = new Point(20, 55);
        this.lblRecordingQuality.Name = "lblRecordingQuality";
        this.lblRecordingQuality.Size = new Size(120, 15);
        this.lblRecordingQuality.TabIndex = 2;
        this.lblRecordingQuality.Text = "녹화 품질 (1-100):";

        this.numRecordingQuality.Location = new Point(150, 52);
        this.numRecordingQuality.Maximum = new decimal(new int[] { 100, 0, 0, 0 });
        this.numRecordingQuality.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        this.numRecordingQuality.Name = "numRecordingQuality";
        this.numRecordingQuality.Size = new Size(120, 23);
        this.numRecordingQuality.TabIndex = 3;
        this.numRecordingQuality.Value = new decimal(new int[] { 75, 0, 0, 0 });

        this.lblRecordingInfo.Location = new Point(20, 95);
        this.lblRecordingInfo.Name = "lblRecordingInfo";
        this.lblRecordingInfo.Size = new Size(600, 80);
        this.lblRecordingInfo.TabIndex = 4;
        this.lblRecordingInfo.Text = "화면 녹화 정보:\n" +
                                     "• 각 프레임은 JPEG 이미지로 저장됩니다\n" +
                                     "• 녹화 파일은 ZIP 형식으로 압축됩니다\n" +
                                     "• 저장 위치: %APPDATA%\\VNCServer\\Recordings\\\n" +
                                     "• 녹화 시작/중지는 메인 메뉴에서 가능합니다";
    }

    private void InitializeWebManagementTab()
    {
        this.chkEnableWebManagement = new CheckBox();
        this.lblWebPort = new Label();
        this.numWebPort = new NumericUpDown();
        this.lblWebManagementInfo = new Label();

        this.tabWebManagement.Controls.Add(this.lblWebManagementInfo);
        this.tabWebManagement.Controls.Add(this.numWebPort);
        this.tabWebManagement.Controls.Add(this.lblWebPort);
        this.tabWebManagement.Controls.Add(this.chkEnableWebManagement);
        this.tabWebManagement.Location = new Point(4, 24);
        this.tabWebManagement.Name = "tabWebManagement";
        this.tabWebManagement.Size = new Size(652, 402);
        this.tabWebManagement.TabIndex = 6;
        this.tabWebManagement.Text = "웹 관리";
        this.tabWebManagement.UseVisualStyleBackColor = true;

        this.chkEnableWebManagement.AutoSize = true;
        this.chkEnableWebManagement.Location = new Point(20, 20);
        this.chkEnableWebManagement.Name = "chkEnableWebManagement";
        this.chkEnableWebManagement.Size = new Size(220, 19);
        this.chkEnableWebManagement.TabIndex = 0;
        this.chkEnableWebManagement.Text = "웹 관리 인터페이스 활성화";
        this.chkEnableWebManagement.UseVisualStyleBackColor = true;

        this.lblWebPort.AutoSize = true;
        this.lblWebPort.Location = new Point(20, 55);
        this.lblWebPort.Name = "lblWebPort";
        this.lblWebPort.Size = new Size(100, 15);
        this.lblWebPort.TabIndex = 1;
        this.lblWebPort.Text = "웹 관리 포트:";

        this.numWebPort.Location = new Point(130, 52);
        this.numWebPort.Maximum = new decimal(new int[] { 65535, 0, 0, 0 });
        this.numWebPort.Minimum = new decimal(new int[] { 1024, 0, 0, 0 });
        this.numWebPort.Name = "numWebPort";
        this.numWebPort.Size = new Size(120, 23);
        this.numWebPort.TabIndex = 2;
        this.numWebPort.Value = new decimal(new int[] { 8080, 0, 0, 0 });

        this.lblWebManagementInfo.Location = new Point(20, 95);
        this.lblWebManagementInfo.Name = "lblWebManagementInfo";
        this.lblWebManagementInfo.Size = new Size(600, 120);
        this.lblWebManagementInfo.TabIndex = 3;
        this.lblWebManagementInfo.Text = "웹 관리 대시보드:\n\n" +
                                        "• 접속 주소: http://localhost:8080\n" +
                                        "• 원격 접속: http://서버IP:8080\n\n" +
                                        "기능:\n" +
                                        "✓ 실시간 서버 상태 모니터링\n" +
                                        "✓ 연결된 클라이언트 목록\n" +
                                        "✓ 데이터 전송 통계\n" +
                                        "✓ 서버 시작/중지 제어\n" +
                                        "✓ 설정 변경 (REST API)";
    }

    private void InitializeMediaTab()
    {
        this.grpAudio = new GroupBox();
        this.chkEnableAudio = new CheckBox();
        this.lblAudioSampleRate = new Label();
        this.numAudioSampleRate = new NumericUpDown();
        this.lblAudioChannels = new Label();
        this.numAudioChannels = new NumericUpDown();
        this.grpVideo = new GroupBox();
        this.chkEnableVideo = new CheckBox();
        this.lblVideoCodec = new Label();
        this.cmbVideoCodec = new ComboBox();
        this.lblVideoQuality = new Label();
        this.cmbVideoQuality = new ComboBox();

        this.tabMedia.Controls.Add(this.grpVideo);
        this.tabMedia.Controls.Add(this.grpAudio);
        this.tabMedia.Location = new Point(4, 24);
        this.tabMedia.Name = "tabMedia";
        this.tabMedia.Size = new Size(652, 402);
        this.tabMedia.TabIndex = 7;
        this.tabMedia.Text = "미디어";
        this.tabMedia.UseVisualStyleBackColor = true;

        // Audio Group
        this.grpAudio.Controls.Add(this.numAudioChannels);
        this.grpAudio.Controls.Add(this.lblAudioChannels);
        this.grpAudio.Controls.Add(this.numAudioSampleRate);
        this.grpAudio.Controls.Add(this.lblAudioSampleRate);
        this.grpAudio.Controls.Add(this.chkEnableAudio);
        this.grpAudio.Location = new Point(20, 20);
        this.grpAudio.Name = "grpAudio";
        this.grpAudio.Size = new Size(600, 150);
        this.grpAudio.TabIndex = 0;
        this.grpAudio.TabStop = false;
        this.grpAudio.Text = "오디오 스트리밍";

        this.chkEnableAudio.AutoSize = true;
        this.chkEnableAudio.Location = new Point(15, 25);
        this.chkEnableAudio.Name = "chkEnableAudio";
        this.chkEnableAudio.Size = new Size(180, 19);
        this.chkEnableAudio.TabIndex = 0;
        this.chkEnableAudio.Text = "오디오 스트리밍 활성화";
        this.chkEnableAudio.UseVisualStyleBackColor = true;

        this.lblAudioSampleRate.AutoSize = true;
        this.lblAudioSampleRate.Location = new Point(15, 60);
        this.lblAudioSampleRate.Name = "lblAudioSampleRate";
        this.lblAudioSampleRate.Size = new Size(110, 15);
        this.lblAudioSampleRate.TabIndex = 1;
        this.lblAudioSampleRate.Text = "샘플레이트 (Hz):";

        this.numAudioSampleRate.Location = new Point(140, 57);
        this.numAudioSampleRate.Maximum = new decimal(new int[] { 48000, 0, 0, 0 });
        this.numAudioSampleRate.Minimum = new decimal(new int[] { 8000, 0, 0, 0 });
        this.numAudioSampleRate.Name = "numAudioSampleRate";
        this.numAudioSampleRate.Size = new Size(120, 23);
        this.numAudioSampleRate.TabIndex = 2;
        this.numAudioSampleRate.Value = new decimal(new int[] { 44100, 0, 0, 0 });

        this.lblAudioChannels.AutoSize = true;
        this.lblAudioChannels.Location = new Point(15, 95);
        this.lblAudioChannels.Name = "lblAudioChannels";
        this.lblAudioChannels.Size = new Size(100, 15);
        this.lblAudioChannels.TabIndex = 3;
        this.lblAudioChannels.Text = "채널 (1=모노, 2=스테레오):";

        this.numAudioChannels.Location = new Point(220, 92);
        this.numAudioChannels.Maximum = new decimal(new int[] { 2, 0, 0, 0 });
        this.numAudioChannels.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        this.numAudioChannels.Name = "numAudioChannels";
        this.numAudioChannels.Size = new Size(80, 23);
        this.numAudioChannels.TabIndex = 4;
        this.numAudioChannels.Value = new decimal(new int[] { 2, 0, 0, 0 });

        // Video Group
        this.grpVideo.Controls.Add(this.cmbVideoQuality);
        this.grpVideo.Controls.Add(this.lblVideoQuality);
        this.grpVideo.Controls.Add(this.cmbVideoCodec);
        this.grpVideo.Controls.Add(this.lblVideoCodec);
        this.grpVideo.Controls.Add(this.chkEnableVideo);
        this.grpVideo.Location = new Point(20, 180);
        this.grpVideo.Name = "grpVideo";
        this.grpVideo.Size = new Size(600, 150);
        this.grpVideo.TabIndex = 1;
        this.grpVideo.TabStop = false;
        this.grpVideo.Text = "비디오 코덱";

        this.chkEnableVideo.AutoSize = true;
        this.chkEnableVideo.Location = new Point(15, 25);
        this.chkEnableVideo.Name = "chkEnableVideo";
        this.chkEnableVideo.Size = new Size(230, 19);
        this.chkEnableVideo.TabIndex = 0;
        this.chkEnableVideo.Text = "하드웨어 가속 인코딩 활성화";
        this.chkEnableVideo.UseVisualStyleBackColor = true;

        this.lblVideoCodec.AutoSize = true;
        this.lblVideoCodec.Location = new Point(15, 60);
        this.lblVideoCodec.Name = "lblVideoCodec";
        this.lblVideoCodec.Size = new Size(60, 15);
        this.lblVideoCodec.TabIndex = 1;
        this.lblVideoCodec.Text = "코덱:";

        this.cmbVideoCodec.DropDownStyle = ComboBoxStyle.DropDownList;
        this.cmbVideoCodec.FormattingEnabled = true;
        this.cmbVideoCodec.Items.AddRange(new object[] { "H.264 (권장)", "H.265 (HEVC)", "VP8", "VP9" });
        this.cmbVideoCodec.Location = new Point(90, 57);
        this.cmbVideoCodec.Name = "cmbVideoCodec";
        this.cmbVideoCodec.Size = new Size(200, 23);
        this.cmbVideoCodec.TabIndex = 2;
        this.cmbVideoCodec.SelectedIndex = 0;

        this.lblVideoQuality.AutoSize = true;
        this.lblVideoQuality.Location = new Point(15, 95);
        this.lblVideoQuality.Name = "lblVideoQuality";
        this.lblVideoQuality.Size = new Size(60, 15);
        this.lblVideoQuality.TabIndex = 3;
        this.lblVideoQuality.Text = "품질:";

        this.cmbVideoQuality.DropDownStyle = ComboBoxStyle.DropDownList;
        this.cmbVideoQuality.FormattingEnabled = true;
        this.cmbVideoQuality.Items.AddRange(new object[] { "낮음", "중간 (권장)", "높음", "매우 높음", "무손실" });
        this.cmbVideoQuality.Location = new Point(90, 92);
        this.cmbVideoQuality.Name = "cmbVideoQuality";
        this.cmbVideoQuality.Size = new Size(200, 23);
        this.cmbVideoQuality.TabIndex = 4;
        this.cmbVideoQuality.SelectedIndex = 1;
    }

    private void InitializeAdvancedTab()
    {
        this.grpTouch = new GroupBox();
        this.chkEnableTouch = new CheckBox();
        this.lblMaxTouchPoints = new Label();
        this.numMaxTouchPoints = new NumericUpDown();
        this.grpReconnect = new GroupBox();
        this.chkEnableReconnect = new CheckBox();
        this.lblSessionTimeout = new Label();
        this.numSessionTimeout = new NumericUpDown();
        this.lblMaxReconnectAttempts = new Label();
        this.numMaxReconnectAttempts = new NumericUpDown();

        this.tabAdvanced.Controls.Add(this.grpReconnect);
        this.tabAdvanced.Controls.Add(this.grpTouch);
        this.tabAdvanced.Location = new Point(4, 24);
        this.tabAdvanced.Name = "tabAdvanced";
        this.tabAdvanced.Size = new Size(652, 402);
        this.tabAdvanced.TabIndex = 8;
        this.tabAdvanced.Text = "고급";
        this.tabAdvanced.UseVisualStyleBackColor = true;

        // Touch Group
        this.grpTouch.Controls.Add(this.numMaxTouchPoints);
        this.grpTouch.Controls.Add(this.lblMaxTouchPoints);
        this.grpTouch.Controls.Add(this.chkEnableTouch);
        this.grpTouch.Location = new Point(20, 20);
        this.grpTouch.Name = "grpTouch";
        this.grpTouch.Size = new Size(600, 120);
        this.grpTouch.TabIndex = 0;
        this.grpTouch.TabStop = false;
        this.grpTouch.Text = "터치 입력";

        this.chkEnableTouch.AutoSize = true;
        this.chkEnableTouch.Location = new Point(15, 25);
        this.chkEnableTouch.Name = "chkEnableTouch";
        this.chkEnableTouch.Size = new Size(200, 19);
        this.chkEnableTouch.TabIndex = 0;
        this.chkEnableTouch.Text = "멀티터치 입력 지원";
        this.chkEnableTouch.UseVisualStyleBackColor = true;

        this.lblMaxTouchPoints.AutoSize = true;
        this.lblMaxTouchPoints.Location = new Point(15, 60);
        this.lblMaxTouchPoints.Name = "lblMaxTouchPoints";
        this.lblMaxTouchPoints.Size = new Size(150, 15);
        this.lblMaxTouchPoints.TabIndex = 1;
        this.lblMaxTouchPoints.Text = "최대 터치 포인트:";

        this.numMaxTouchPoints.Location = new Point(180, 57);
        this.numMaxTouchPoints.Maximum = new decimal(new int[] { 10, 0, 0, 0 });
        this.numMaxTouchPoints.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        this.numMaxTouchPoints.Name = "numMaxTouchPoints";
        this.numMaxTouchPoints.Size = new Size(80, 23);
        this.numMaxTouchPoints.TabIndex = 2;
        this.numMaxTouchPoints.Value = new decimal(new int[] { 10, 0, 0, 0 });

        // Reconnect Group
        this.grpReconnect.Controls.Add(this.numMaxReconnectAttempts);
        this.grpReconnect.Controls.Add(this.lblMaxReconnectAttempts);
        this.grpReconnect.Controls.Add(this.numSessionTimeout);
        this.grpReconnect.Controls.Add(this.lblSessionTimeout);
        this.grpReconnect.Controls.Add(this.chkEnableReconnect);
        this.grpReconnect.Location = new Point(20, 150);
        this.grpReconnect.Name = "grpReconnect";
        this.grpReconnect.Size = new Size(600, 150);
        this.grpReconnect.TabIndex = 1;
        this.grpReconnect.TabStop = false;
        this.grpReconnect.Text = "세션 재연결";

        this.chkEnableReconnect.AutoSize = true;
        this.chkEnableReconnect.Location = new Point(15, 25);
        this.chkEnableReconnect.Name = "chkEnableReconnect";
        this.chkEnableReconnect.Size = new Size(200, 19);
        this.chkEnableReconnect.TabIndex = 0;
        this.chkEnableReconnect.Text = "자동 재연결 활성화";
        this.chkEnableReconnect.UseVisualStyleBackColor = true;

        this.lblSessionTimeout.AutoSize = true;
        this.lblSessionTimeout.Location = new Point(15, 60);
        this.lblSessionTimeout.Name = "lblSessionTimeout";
        this.lblSessionTimeout.Size = new Size(150, 15);
        this.lblSessionTimeout.TabIndex = 1;
        this.lblSessionTimeout.Text = "세션 타임아웃 (분):";

        this.numSessionTimeout.Location = new Point(180, 57);
        this.numSessionTimeout.Maximum = new decimal(new int[] { 60, 0, 0, 0 });
        this.numSessionTimeout.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        this.numSessionTimeout.Name = "numSessionTimeout";
        this.numSessionTimeout.Size = new Size(80, 23);
        this.numSessionTimeout.TabIndex = 2;
        this.numSessionTimeout.Value = new decimal(new int[] { 5, 0, 0, 0 });

        this.lblMaxReconnectAttempts.AutoSize = true;
        this.lblMaxReconnectAttempts.Location = new Point(15, 95);
        this.lblMaxReconnectAttempts.Name = "lblMaxReconnectAttempts";
        this.lblMaxReconnectAttempts.Size = new Size(150, 15);
        this.lblMaxReconnectAttempts.TabIndex = 3;
        this.lblMaxReconnectAttempts.Text = "최대 재연결 시도:";

        this.numMaxReconnectAttempts.Location = new Point(180, 92);
        this.numMaxReconnectAttempts.Maximum = new decimal(new int[] { 10, 0, 0, 0 });
        this.numMaxReconnectAttempts.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        this.numMaxReconnectAttempts.Name = "numMaxReconnectAttempts";
        this.numMaxReconnectAttempts.Size = new Size(80, 23);
        this.numMaxReconnectAttempts.TabIndex = 4;
        this.numMaxReconnectAttempts.Value = new decimal(new int[] { 3, 0, 0, 0 });
    }
}
