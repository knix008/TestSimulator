using System.Drawing;

namespace TTSWinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    private Panel panelBody = null!;
    private TextBox textBoxContent = null!;
    private Panel panelSynthCard = null!;
    private Label labelSynthTitle = null!;
    private Label labelSynthMethod = null!;
    private ComboBox comboBoxSynthMethod = null!;
    private Label labelVoice = null!;
    private ComboBox comboBoxVoice = null!;
    private Label labelRate = null!;
    private TrackBar trackBarRate = null!;
    private Label labelRateValue = null!;
    private Label labelSynthVol = null!;
    private TrackBar trackBarSynthVol = null!;
    private Label labelSynthVolPct = null!;
    private Label labelPitch = null!;
    private TrackBar trackBarPitch = null!;
    private Label labelPitchValue = null!;
    private Label labelEmphasis = null!;
    private ComboBox comboBoxEmphasis = null!;
    private Label labelWaveGain = null!;
    private Label labelWaveGainPct = null!;
    private TrackBar trackBarWaveGain = null!;
    private Panel panelWaveform = null!;
    private Panel panelBottomBar = null!;
    private FlowLayoutPanel flowBottomButtons = null!;
    private Panel panelVolumeHost = null!;
    private Button buttonOpenFile = null!;
    private Button buttonSpeak = null!;
    private Button buttonStop = null!;
    private Button buttonSave = null!;
    private TrackBar trackBarVolume = null!;
    private Label labelVolume = null!;
    private StatusStrip statusStrip = null!;
    private ToolStripStatusLabel statusLabel = null!;
    private ToolTip toolTipMain = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components is not null)
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        panelBody = new Panel();
        panelWaveform = new Panel();
        panelBottomBar = new Panel();
        panelVolumeHost = new Panel();
        labelVolume = new Label();
        trackBarVolume = new TrackBar();
        flowBottomButtons = new FlowLayoutPanel();
        buttonOpenFile = new Button();
        buttonSpeak = new Button();
        buttonStop = new Button();
        buttonSave = new Button();
        panelSynthCard = new Panel();
        labelSynthTitle = new Label();
        labelSynthMethod = new Label();
        comboBoxSynthMethod = new ComboBox();
        labelVoice = new Label();
        comboBoxVoice = new ComboBox();
        labelRate = new Label();
        trackBarRate = new TrackBar();
        labelRateValue = new Label();
        labelSynthVol = new Label();
        trackBarSynthVol = new TrackBar();
        labelSynthVolPct = new Label();
        labelPitch = new Label();
        trackBarPitch = new TrackBar();
        labelPitchValue = new Label();
        labelEmphasis = new Label();
        comboBoxEmphasis = new ComboBox();
        labelWaveGain = new Label();
        trackBarWaveGain = new TrackBar();
        labelWaveGainPct = new Label();
        textBoxContent = new TextBox();
        statusStrip = new StatusStrip();
        statusLabel = new ToolStripStatusLabel();
        toolTipMain = new ToolTip(components);
        panelBody.SuspendLayout();
        panelBottomBar.SuspendLayout();
        panelVolumeHost.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)trackBarVolume).BeginInit();
        flowBottomButtons.SuspendLayout();
        panelSynthCard.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)trackBarRate).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trackBarSynthVol).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trackBarPitch).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trackBarWaveGain).BeginInit();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // panelBody
        // 
        panelBody.Controls.Add(panelWaveform);
        panelBody.Controls.Add(panelBottomBar);
        panelBody.Controls.Add(panelSynthCard);
        panelBody.Controls.Add(textBoxContent);
        panelBody.Dock = DockStyle.Fill;
        panelBody.Location = new Point(0, 0);
        panelBody.Name = "panelBody";
        panelBody.Padding = new Padding(16, 14, 16, 14);
        panelBody.Size = new Size(880, 792);
        panelBody.TabIndex = 0;
        // 
        // panelWaveform
        // 
        panelWaveform.BackColor = Color.FromArgb(18, 21, 28);
        panelWaveform.Dock = DockStyle.Fill;
        panelWaveform.Location = new Point(16, 470);
        panelWaveform.Margin = new Padding(0, 0, 0, 10);
        panelWaveform.Name = "panelWaveform";
        panelWaveform.Size = new Size(848, 247);
        panelWaveform.TabIndex = 7;
        toolTipMain.SetToolTip(panelWaveform, "하단: 시간(초) 눈금(오른쪽=현재). 마우스 휠로 시간축 확대·축소. 파형 위에서 휠 동작.");
        panelWaveform.Paint += PanelWaveform_Paint;
        // 
        // panelBottomBar
        // 
        panelBottomBar.Controls.Add(panelVolumeHost);
        panelBottomBar.Controls.Add(flowBottomButtons);
        panelBottomBar.Dock = DockStyle.Bottom;
        panelBottomBar.Location = new Point(16, 717);
        panelBottomBar.Margin = new Padding(0);
        panelBottomBar.Name = "panelBottomBar";
        panelBottomBar.Padding = new Padding(0, 4, 0, 12);
        panelBottomBar.Size = new Size(848, 61);
        panelBottomBar.TabIndex = 13;
        // 
        // panelVolumeHost
        // 
        panelVolumeHost.Controls.Add(labelVolume);
        panelVolumeHost.Controls.Add(trackBarVolume);
        panelVolumeHost.Dock = DockStyle.Right;
        panelVolumeHost.Location = new Point(548, 4);
        panelVolumeHost.Margin = new Padding(8, 0, 0, 0);
        panelVolumeHost.Name = "panelVolumeHost";
        panelVolumeHost.Size = new Size(300, 45);
        panelVolumeHost.TabIndex = 1;
        // 
        // labelVolume
        // 
        labelVolume.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left;
        labelVolume.Location = new Point(6, 8);
        labelVolume.Margin = new Padding(0, 0, 8, 0);
        labelVolume.Name = "labelVolume";
        labelVolume.Size = new Size(56, 35);
        labelVolume.TabIndex = 0;
        labelVolume.Text = "볼륨";
        labelVolume.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // trackBarVolume
        // 
        trackBarVolume.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        trackBarVolume.AutoSize = false;
        trackBarVolume.Location = new Point(72, 10);
        trackBarVolume.Margin = new Padding(0);
        trackBarVolume.Maximum = 100;
        trackBarVolume.Name = "trackBarVolume";
        trackBarVolume.Size = new Size(220, 33);
        trackBarVolume.TabIndex = 6;
        trackBarVolume.TickFrequency = 10;
        trackBarVolume.Value = 80;
        trackBarVolume.Scroll += TrackBarVolume_Scroll;
        // 
        // flowBottomButtons
        // 
        flowBottomButtons.AutoSize = true;
        flowBottomButtons.Controls.Add(buttonOpenFile);
        flowBottomButtons.Controls.Add(buttonSpeak);
        flowBottomButtons.Controls.Add(buttonStop);
        flowBottomButtons.Controls.Add(buttonSave);
        flowBottomButtons.Dock = DockStyle.Left;
        flowBottomButtons.Location = new Point(0, 4);
        flowBottomButtons.Margin = new Padding(0);
        flowBottomButtons.Name = "flowBottomButtons";
        flowBottomButtons.Padding = new Padding(0, 6, 0, 10);
        flowBottomButtons.Size = new Size(413, 45);
        flowBottomButtons.TabIndex = 0;
        flowBottomButtons.WrapContents = false;
        // 
        // buttonOpenFile
        // 
        buttonOpenFile.Location = new Point(0, 6);
        buttonOpenFile.Margin = new Padding(0, 0, 10, 0);
        buttonOpenFile.Name = "buttonOpenFile";
        buttonOpenFile.Size = new Size(182, 36);
        buttonOpenFile.TabIndex = 1;
        buttonOpenFile.Text = "텍스트 파일…";
        buttonOpenFile.UseVisualStyleBackColor = false;
        buttonOpenFile.Click += ButtonOpenFile_Click;
        // 
        // buttonSpeak
        // 
        buttonSpeak.Location = new Point(192, 6);
        buttonSpeak.Margin = new Padding(0, 0, 10, 0);
        buttonSpeak.Name = "buttonSpeak";
        buttonSpeak.Size = new Size(48, 36);
        buttonSpeak.TabIndex = 2;
        toolTipMain.SetToolTip(buttonSpeak, "읽기 (재생)");
        buttonSpeak.UseVisualStyleBackColor = false;
        buttonSpeak.Click += ButtonSpeak_Click;
        // 
        // buttonStop
        // 
        buttonStop.Location = new Point(250, 6);
        buttonStop.Margin = new Padding(0, 0, 10, 0);
        buttonStop.Name = "buttonStop";
        buttonStop.Size = new Size(48, 36);
        buttonStop.TabIndex = 3;
        toolTipMain.SetToolTip(buttonStop, "중지");
        buttonStop.UseVisualStyleBackColor = false;
        buttonStop.Click += ButtonStop_Click;
        // 
        // buttonSave
        // 
        buttonSave.Location = new Point(308, 6);
        buttonSave.Margin = new Padding(0);
        buttonSave.Name = "buttonSave";
        buttonSave.Size = new Size(105, 36);
        buttonSave.TabIndex = 4;
        buttonSave.Text = "저장…";
        toolTipMain.SetToolTip(buttonSave, "WAV 또는 MP3로 저장");
        buttonSave.UseVisualStyleBackColor = false;
        buttonSave.Click += ButtonSave_Click;
        // 
        // panelSynthCard
        // 
        panelSynthCard.Controls.Add(labelSynthTitle);
        panelSynthCard.Controls.Add(labelSynthMethod);
        panelSynthCard.Controls.Add(comboBoxSynthMethod);
        panelSynthCard.Controls.Add(labelVoice);
        panelSynthCard.Controls.Add(comboBoxVoice);
        panelSynthCard.Controls.Add(labelRate);
        panelSynthCard.Controls.Add(trackBarRate);
        panelSynthCard.Controls.Add(labelRateValue);
        panelSynthCard.Controls.Add(labelSynthVol);
        panelSynthCard.Controls.Add(trackBarSynthVol);
        panelSynthCard.Controls.Add(labelSynthVolPct);
        panelSynthCard.Controls.Add(labelPitch);
        panelSynthCard.Controls.Add(trackBarPitch);
        panelSynthCard.Controls.Add(labelPitchValue);
        panelSynthCard.Controls.Add(labelEmphasis);
        panelSynthCard.Controls.Add(comboBoxEmphasis);
        panelSynthCard.Controls.Add(labelWaveGain);
        panelSynthCard.Controls.Add(trackBarWaveGain);
        panelSynthCard.Controls.Add(labelWaveGainPct);
        panelSynthCard.Dock = DockStyle.Top;
        panelSynthCard.Location = new Point(16, 166);
        panelSynthCard.Margin = new Padding(0, 0, 0, 10);
        panelSynthCard.Name = "panelSynthCard";
        panelSynthCard.Padding = new Padding(16, 14, 16, 14);
        panelSynthCard.Size = new Size(848, 304);
        panelSynthCard.TabIndex = 9;
        // 
        // labelSynthTitle
        // 
        labelSynthTitle.Dock = DockStyle.Top;
        labelSynthTitle.Location = new Point(16, 14);
        labelSynthTitle.Margin = new Padding(0, 0, 0, 10);
        labelSynthTitle.Name = "labelSynthTitle";
        labelSynthTitle.Size = new Size(816, 26);
        labelSynthTitle.TabIndex = 0;
        labelSynthTitle.Text = "음성 합성 품질";
        labelSynthTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // labelSynthMethod
        // 
        labelSynthMethod.Location = new Point(6, 50);
        labelSynthMethod.Margin = new Padding(0, 0, 8, 0);
        labelSynthMethod.Name = "labelSynthMethod";
        labelSynthMethod.Size = new Size(50, 24);
        labelSynthMethod.TabIndex = 0;
        labelSynthMethod.Text = "합성";
        labelSynthMethod.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // comboBoxSynthMethod
        // 
        comboBoxSynthMethod.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        comboBoxSynthMethod.BackColor = Color.FromArgb(243, 246, 252);
        comboBoxSynthMethod.DropDownStyle = ComboBoxStyle.DropDownList;
        comboBoxSynthMethod.FlatStyle = FlatStyle.Popup;
        comboBoxSynthMethod.ForeColor = Color.FromArgb(28, 30, 36);
        comboBoxSynthMethod.FormattingEnabled = true;
        comboBoxSynthMethod.Location = new Point(64, 50);
        comboBoxSynthMethod.Margin = new Padding(0);
        comboBoxSynthMethod.Name = "comboBoxSynthMethod";
        comboBoxSynthMethod.Size = new Size(752, 20);
        comboBoxSynthMethod.TabIndex = 9;
        toolTipMain.SetToolTip(comboBoxSynthMethod, "사용할 음성 합성 API를 선택합니다. 음성 목록이 선택에 맞게 바뀝니다.");
        // 
        // labelVoice
        // 
        labelVoice.Location = new Point(5, 81);
        labelVoice.Margin = new Padding(0, 0, 8, 0);
        labelVoice.Name = "labelVoice";
        labelVoice.Size = new Size(51, 24);
        labelVoice.TabIndex = 10;
        labelVoice.Text = "음성";
        labelVoice.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // comboBoxVoice
        // 
        comboBoxVoice.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        comboBoxVoice.BackColor = Color.FromArgb(243, 246, 252);
        comboBoxVoice.DropDownStyle = ComboBoxStyle.DropDownList;
        comboBoxVoice.FlatStyle = FlatStyle.Popup;
        comboBoxVoice.ForeColor = Color.FromArgb(28, 30, 36);
        comboBoxVoice.FormattingEnabled = true;
        comboBoxVoice.Location = new Point(64, 82);
        comboBoxVoice.Margin = new Padding(0);
        comboBoxVoice.Name = "comboBoxVoice";
        comboBoxVoice.Size = new Size(752, 20);
        comboBoxVoice.TabIndex = 10;
        // 
        // labelRate
        // 
        labelRate.Location = new Point(5, 116);
        labelRate.Margin = new Padding(0, 0, 8, 0);
        labelRate.Name = "labelRate";
        labelRate.Size = new Size(51, 28);
        labelRate.TabIndex = 25;
        labelRate.Text = "속도";
        labelRate.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // trackBarRate
        // 
        trackBarRate.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        trackBarRate.AutoSize = false;
        trackBarRate.Location = new Point(64, 119);
        trackBarRate.Margin = new Padding(0, 0, 8, 0);
        trackBarRate.Minimum = -10;
        trackBarRate.Name = "trackBarRate";
        trackBarRate.Size = new Size(656, 28);
        trackBarRate.TabIndex = 11;
        trackBarRate.TickFrequency = 2;
        trackBarRate.Scroll += TrackBarRate_Scroll;
        // 
        // labelRateValue
        // 
        labelRateValue.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        labelRateValue.Location = new Point(720, 118);
        labelRateValue.Margin = new Padding(0);
        labelRateValue.Name = "labelRateValue";
        labelRateValue.Size = new Size(96, 28);
        labelRateValue.TabIndex = 26;
        labelRateValue.Text = "0";
        labelRateValue.TextAlign = ContentAlignment.MiddleRight;
        // 
        // labelSynthVol
        // 
        labelSynthVol.Location = new Point(4, 156);
        labelSynthVol.Margin = new Padding(0, 0, 8, 0);
        labelSynthVol.Name = "labelSynthVol";
        labelSynthVol.Size = new Size(52, 28);
        labelSynthVol.TabIndex = 27;
        labelSynthVol.Text = "볼륨";
        labelSynthVol.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // trackBarSynthVol
        // 
        trackBarSynthVol.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        trackBarSynthVol.AutoSize = false;
        trackBarSynthVol.Location = new Point(64, 157);
        trackBarSynthVol.Margin = new Padding(0, 0, 8, 0);
        trackBarSynthVol.Maximum = 100;
        trackBarSynthVol.Name = "trackBarSynthVol";
        trackBarSynthVol.Size = new Size(656, 28);
        trackBarSynthVol.TabIndex = 20;
        trackBarSynthVol.TickFrequency = 10;
        toolTipMain.SetToolTip(trackBarSynthVol, "음성 엔진 합성 단계 볼륨(0~100%). 재생 볼륨과는 별개입니다.");
        trackBarSynthVol.Value = 100;
        trackBarSynthVol.Scroll += TrackBarSynthVol_Scroll;
        // 
        // labelSynthVolPct
        // 
        labelSynthVolPct.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        labelSynthVolPct.Location = new Point(720, 156);
        labelSynthVolPct.Margin = new Padding(0);
        labelSynthVolPct.Name = "labelSynthVolPct";
        labelSynthVolPct.Size = new Size(96, 28);
        labelSynthVolPct.TabIndex = 28;
        labelSynthVolPct.Text = "100%";
        labelSynthVolPct.TextAlign = ContentAlignment.MiddleRight;
        // 
        // labelPitch
        // 
        labelPitch.Location = new Point(4, 194);
        labelPitch.Margin = new Padding(0, 0, 8, 0);
        labelPitch.Name = "labelPitch";
        labelPitch.Size = new Size(52, 28);
        labelPitch.TabIndex = 29;
        labelPitch.Text = "피치";
        labelPitch.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // trackBarPitch
        // 
        trackBarPitch.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        trackBarPitch.AutoSize = false;
        trackBarPitch.Location = new Point(64, 195);
        trackBarPitch.Margin = new Padding(0, 0, 8, 0);
        trackBarPitch.Maximum = 5;
        trackBarPitch.Minimum = -5;
        trackBarPitch.Name = "trackBarPitch";
        trackBarPitch.Size = new Size(656, 28);
        trackBarPitch.TabIndex = 21;
        toolTipMain.SetToolTip(trackBarPitch, "반음 단위 음높이(SSML prosody), -5~+5(11단계). 트랙 클릭 시 1반음씩 이동합니다. 일부 음성은 효과가 제한될 수 있습니다.");
        trackBarPitch.Scroll += TrackBarPitch_Scroll;
        // 
        // labelPitchValue
        // 
        labelPitchValue.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        labelPitchValue.Location = new Point(720, 194);
        labelPitchValue.Margin = new Padding(0);
        labelPitchValue.Name = "labelPitchValue";
        labelPitchValue.Size = new Size(96, 28);
        labelPitchValue.TabIndex = 30;
        labelPitchValue.Text = "0 (기본)";
        labelPitchValue.TextAlign = ContentAlignment.MiddleRight;
        // 
        // labelEmphasis
        // 
        labelEmphasis.Location = new Point(3, 227);
        labelEmphasis.Margin = new Padding(0, 0, 8, 0);
        labelEmphasis.Name = "labelEmphasis";
        labelEmphasis.Size = new Size(53, 24);
        labelEmphasis.TabIndex = 31;
        labelEmphasis.Text = "강조";
        labelEmphasis.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // comboBoxEmphasis
        // 
        comboBoxEmphasis.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        comboBoxEmphasis.BackColor = Color.FromArgb(243, 246, 252);
        comboBoxEmphasis.DropDownStyle = ComboBoxStyle.DropDownList;
        comboBoxEmphasis.FlatStyle = FlatStyle.Popup;
        comboBoxEmphasis.ForeColor = Color.FromArgb(28, 30, 36);
        comboBoxEmphasis.FormattingEnabled = true;
        comboBoxEmphasis.Items.AddRange(new object[] { "없음", "보통", "강함" });
        comboBoxEmphasis.Location = new Point(64, 228);
        comboBoxEmphasis.Margin = new Padding(0);
        comboBoxEmphasis.Name = "comboBoxEmphasis";
        comboBoxEmphasis.Size = new Size(752, 20);
        comboBoxEmphasis.TabIndex = 23;
        toolTipMain.SetToolTip(comboBoxEmphasis, "문장 전체에 대한 SSML 강조 수준입니다.");
        // 
        // labelWaveGain
        // 
        labelWaveGain.Location = new Point(3, 261);
        labelWaveGain.Margin = new Padding(0, 0, 8, 0);
        labelWaveGain.Name = "labelWaveGain";
        labelWaveGain.Size = new Size(53, 28);
        labelWaveGain.TabIndex = 32;
        labelWaveGain.Text = "파형";
        labelWaveGain.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // trackBarWaveGain
        // 
        trackBarWaveGain.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        trackBarWaveGain.AutoSize = false;
        trackBarWaveGain.Location = new Point(64, 265);
        trackBarWaveGain.Margin = new Padding(0, 0, 8, 0);
        trackBarWaveGain.Maximum = 400;
        trackBarWaveGain.Minimum = 20;
        trackBarWaveGain.Name = "trackBarWaveGain";
        trackBarWaveGain.Size = new Size(656, 28);
        trackBarWaveGain.TabIndex = 14;
        trackBarWaveGain.TickFrequency = 20;
        trackBarWaveGain.TickStyle = TickStyle.None;
        toolTipMain.SetToolTip(trackBarWaveGain, "파형 세로 확대 (재생 중 파형 높이)");
        trackBarWaveGain.Value = 100;
        trackBarWaveGain.Scroll += TrackBarWaveGain_Scroll;
        // 
        // labelWaveGainPct
        // 
        labelWaveGainPct.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        labelWaveGainPct.Location = new Point(720, 264);
        labelWaveGainPct.Margin = new Padding(0);
        labelWaveGainPct.Name = "labelWaveGainPct";
        labelWaveGainPct.Size = new Size(96, 28);
        labelWaveGainPct.TabIndex = 33;
        labelWaveGainPct.Text = "100%";
        labelWaveGainPct.TextAlign = ContentAlignment.MiddleRight;
        // 
        // textBoxContent
        // 
        textBoxContent.Dock = DockStyle.Top;
        textBoxContent.Location = new Point(16, 14);
        textBoxContent.Margin = new Padding(0, 0, 0, 8);
        textBoxContent.Multiline = true;
        textBoxContent.Name = "textBoxContent";
        textBoxContent.ScrollBars = ScrollBars.Vertical;
        textBoxContent.Size = new Size(848, 152);
        textBoxContent.TabIndex = 0;
        // 
        // statusStrip
        // 
        statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel });
        statusStrip.Location = new Point(0, 792);
        statusStrip.Name = "statusStrip";
        statusStrip.Padding = new Padding(2, 4, 18, 4);
        statusStrip.Size = new Size(880, 28);
        statusStrip.SizingGrip = false;
        statusStrip.TabIndex = 8;
        statusStrip.Text = "statusStrip1";
        // 
        // statusLabel
        // 
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(43, 15);
        statusLabel.Text = "준비됨";
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(880, 820);
        Controls.Add(panelBody);
        Controls.Add(statusStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MinimumSize = new Size(820, 680);
        Name = "MainForm";
        Text = "TTS WinForms — 음성 읽기 · 파형 · 저장";
        panelBody.ResumeLayout(false);
        panelBody.PerformLayout();
        panelBottomBar.ResumeLayout(false);
        panelBottomBar.PerformLayout();
        panelVolumeHost.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)trackBarVolume).EndInit();
        flowBottomButtons.ResumeLayout(false);
        panelSynthCard.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)trackBarRate).EndInit();
        ((System.ComponentModel.ISupportInitialize)trackBarSynthVol).EndInit();
        ((System.ComponentModel.ISupportInitialize)trackBarPitch).EndInit();
        ((System.ComponentModel.ISupportInitialize)trackBarWaveGain).EndInit();
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
