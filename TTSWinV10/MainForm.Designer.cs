namespace TTSWinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    private TableLayoutPanel tableRoot = null!;
    private TextBox textBoxContent = null!;
    private GroupBox groupBoxSynth = null!;
    private TableLayoutPanel tableSynth = null!;
    private Label labelVoice = null!;
    private ComboBox comboBoxVoice = null!;
    private Label labelGender = null!;
    private ComboBox comboBoxGender = null!;
    private Label labelRate = null!;
    private TrackBar trackBarRate = null!;
    private Label labelRateValue = null!;
    private Label labelWaveGain = null!;
    private Label labelWaveGainPct = null!;
    private TrackBar trackBarWaveGain = null!;
    private Panel panelWaveform = null!;
    private Label labelHint = null!;
    private Panel panelBottomBar = null!;
    private TableLayoutPanel tableBottom = null!;
    private FlowLayoutPanel flowBottomButtons = null!;
    private Panel panelVolumeCell = null!;
    private TableLayoutPanel tableVolume = null!;
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
        tableRoot = new TableLayoutPanel();
        textBoxContent = new TextBox();
        groupBoxSynth = new GroupBox();
        tableSynth = new TableLayoutPanel();
        labelVoice = new Label();
        comboBoxVoice = new ComboBox();
        labelGender = new Label();
        comboBoxGender = new ComboBox();
        labelRate = new Label();
        trackBarRate = new TrackBar();
        labelRateValue = new Label();
        labelWaveGain = new Label();
        labelWaveGainPct = new Label();
        trackBarWaveGain = new TrackBar();
        panelWaveform = new Panel();
        labelHint = new Label();
        panelBottomBar = new Panel();
        tableBottom = new TableLayoutPanel();
        flowBottomButtons = new FlowLayoutPanel();
        panelVolumeCell = new Panel();
        tableVolume = new TableLayoutPanel();
        buttonOpenFile = new Button();
        buttonSpeak = new Button();
        buttonStop = new Button();
        buttonSave = new Button();
        trackBarVolume = new TrackBar();
        labelVolume = new Label();
        statusStrip = new StatusStrip();
        statusLabel = new ToolStripStatusLabel();
        toolTipMain = new ToolTip(components);
        tableRoot.SuspendLayout();
        groupBoxSynth.SuspendLayout();
        tableSynth.SuspendLayout();
        panelBottomBar.SuspendLayout();
        tableBottom.SuspendLayout();
        flowBottomButtons.SuspendLayout();
        panelVolumeCell.SuspendLayout();
        tableVolume.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        //
        // tableRoot
        //
        tableRoot.ColumnCount = 1;
        tableRoot.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tableRoot.Controls.Add(textBoxContent, 0, 0);
        tableRoot.Controls.Add(groupBoxSynth, 0, 1);
        tableRoot.Controls.Add(panelWaveform, 0, 2);
        tableRoot.Controls.Add(labelHint, 0, 3);
        tableRoot.Controls.Add(panelBottomBar, 0, 4);
        tableRoot.Dock = DockStyle.Fill;
        tableRoot.Location = new Point(0, 0);
        tableRoot.Name = "tableRoot";
        tableRoot.Padding = new Padding(12, 10, 12, 10);
        tableRoot.RowCount = 5;
        tableRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 178F));
        tableRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 170F));
        tableRoot.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        tableRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 62F));
        tableRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 104F));
        tableRoot.Size = new Size(820, 488);
        tableRoot.TabIndex = 0;
        //
        // textBoxContent
        //
        textBoxContent.Dock = DockStyle.Fill;
        textBoxContent.Margin = new Padding(0, 0, 0, 8);
        textBoxContent.Multiline = true;
        textBoxContent.ScrollBars = ScrollBars.Vertical;
        textBoxContent.TabIndex = 0;
        //
        // groupBoxSynth
        //
        groupBoxSynth.Controls.Add(tableSynth);
        groupBoxSynth.Dock = DockStyle.Fill;
        groupBoxSynth.Margin = new Padding(0, 0, 0, 8);
        groupBoxSynth.Name = "groupBoxSynth";
        groupBoxSynth.Padding = new Padding(10, 8, 10, 10);
        groupBoxSynth.TabIndex = 9;
        groupBoxSynth.TabStop = false;
        groupBoxSynth.Text = "음성 합성 품질";
        //
        // tableSynth
        //
        tableSynth.ColumnCount = 3;
        tableSynth.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 52F));
        tableSynth.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tableSynth.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 96F));
        tableSynth.Controls.Add(labelVoice, 0, 0);
        tableSynth.Controls.Add(comboBoxVoice, 1, 0);
        tableSynth.Controls.Add(labelGender, 0, 1);
        tableSynth.Controls.Add(comboBoxGender, 1, 1);
        tableSynth.Controls.Add(labelRate, 0, 2);
        tableSynth.Controls.Add(trackBarRate, 1, 2);
        tableSynth.Controls.Add(labelRateValue, 2, 2);
        tableSynth.Controls.Add(labelWaveGain, 0, 3);
        tableSynth.Controls.Add(trackBarWaveGain, 1, 3);
        tableSynth.Controls.Add(labelWaveGainPct, 2, 3);
        tableSynth.Dock = DockStyle.Fill;
        tableSynth.Location = new Point(10, 24);
        tableSynth.Margin = new Padding(0);
        tableSynth.Name = "tableSynth";
        tableSynth.RowCount = 4;
        tableSynth.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        tableSynth.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        tableSynth.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        tableSynth.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        tableSynth.Size = new Size(784, 136);
        tableSynth.TabIndex = 0;
        tableSynth.SetColumnSpan(comboBoxVoice, 2);
        tableSynth.SetColumnSpan(comboBoxGender, 2);
        //
        // labelVoice
        //
        labelVoice.AutoSize = false;
        labelVoice.Dock = DockStyle.Fill;
        labelVoice.Margin = new Padding(0, 0, 8, 0);
        labelVoice.Text = "음성";
        labelVoice.TextAlign = ContentAlignment.MiddleLeft;
        //
        // comboBoxVoice
        //
        comboBoxVoice.Dock = DockStyle.Top;
        comboBoxVoice.DropDownStyle = ComboBoxStyle.DropDownList;
        comboBoxVoice.FormattingEnabled = true;
        comboBoxVoice.Margin = new Padding(0, 2, 0, 0);
        comboBoxVoice.Name = "comboBoxVoice";
        comboBoxVoice.TabIndex = 10;
        //
        // labelGender
        //
        labelGender.AutoSize = false;
        labelGender.Dock = DockStyle.Fill;
        labelGender.Margin = new Padding(0, 0, 8, 0);
        labelGender.Text = "성별";
        labelGender.TextAlign = ContentAlignment.MiddleLeft;
        //
        // comboBoxGender
        //
        comboBoxGender.Dock = DockStyle.Top;
        comboBoxGender.DropDownStyle = ComboBoxStyle.DropDownList;
        comboBoxGender.FormattingEnabled = true;
        comboBoxGender.Margin = new Padding(0, 2, 0, 0);
        comboBoxGender.Name = "comboBoxGender";
        comboBoxGender.TabIndex = 15;
        comboBoxGender.SelectedIndexChanged += ComboBoxGender_SelectedIndexChanged;
        //
        // labelRate
        //
        labelRate.AutoSize = false;
        labelRate.Dock = DockStyle.Fill;
        labelRate.Margin = new Padding(0, 0, 8, 0);
        labelRate.Text = "속도";
        labelRate.TextAlign = ContentAlignment.MiddleLeft;
        //
        // trackBarRate
        //
        trackBarRate.AutoSize = false;
        trackBarRate.Dock = DockStyle.Top;
        trackBarRate.Margin = new Padding(0, 4, 8, 0);
        trackBarRate.Maximum = 10;
        trackBarRate.Minimum = -10;
        trackBarRate.Height = 28;
        trackBarRate.TabIndex = 11;
        trackBarRate.TickFrequency = 2;
        trackBarRate.Scroll += TrackBarRate_Scroll;
        //
        // labelRateValue
        //
        labelRateValue.AutoSize = true;
        labelRateValue.Dock = DockStyle.Fill;
        labelRateValue.Margin = new Padding(0);
        labelRateValue.Name = "labelRateValue";
        labelRateValue.Text = "0";
        labelRateValue.TextAlign = ContentAlignment.MiddleRight;
        //
        // labelWaveGain
        //
        labelWaveGain.AutoSize = false;
        labelWaveGain.Dock = DockStyle.Fill;
        labelWaveGain.Margin = new Padding(0, 0, 8, 0);
        labelWaveGain.Text = "파형";
        labelWaveGain.TextAlign = ContentAlignment.MiddleLeft;
        //
        // trackBarWaveGain
        //
        trackBarWaveGain.AutoSize = false;
        trackBarWaveGain.Dock = DockStyle.Top;
        trackBarWaveGain.Height = 28;
        trackBarWaveGain.Margin = new Padding(0, 4, 8, 0);
        trackBarWaveGain.Maximum = 400;
        trackBarWaveGain.Minimum = 20;
        trackBarWaveGain.Name = "trackBarWaveGain";
        trackBarWaveGain.TabIndex = 14;
        trackBarWaveGain.TickFrequency = 20;
        trackBarWaveGain.TickStyle = TickStyle.None;
        trackBarWaveGain.Value = 100;
        trackBarWaveGain.Scroll += TrackBarWaveGain_Scroll;
        toolTipMain.SetToolTip(trackBarWaveGain, "파형 세로 확대 (재생 중 파형 높이)");
        //
        // labelWaveGainPct
        //
        labelWaveGainPct.AutoSize = true;
        labelWaveGainPct.Dock = DockStyle.Fill;
        labelWaveGainPct.Margin = new Padding(0);
        labelWaveGainPct.Name = "labelWaveGainPct";
        labelWaveGainPct.Text = "100%";
        labelWaveGainPct.TextAlign = ContentAlignment.MiddleRight;
        //
        // panelWaveform
        //
        panelWaveform.BackColor = Color.FromArgb(24, 24, 28);
        panelWaveform.Dock = DockStyle.Fill;
        panelWaveform.Margin = new Padding(0, 0, 0, 8);
        panelWaveform.Name = "panelWaveform";
        panelWaveform.TabIndex = 7;
        panelWaveform.Paint += PanelWaveform_Paint;
        //
        // labelHint
        //
        labelHint.AutoSize = false;
        labelHint.Dock = DockStyle.Fill;
        labelHint.ForeColor = SystemColors.GrayText;
        labelHint.Margin = new Padding(0, 0, 0, 8);
        labelHint.Name = "labelHint";
        labelHint.Padding = new Padding(2, 4, 2, 4);
        labelHint.TabIndex = 12;
        labelHint.Text = "실시간 파형은 재생 중에만 표시됩니다. 파형 슬라이더로 세로 확대 비율을 조절할 수 있습니다. 저장·읽기 시 선택한 음성·속도가 적용됩니다. 저장… 단추로 WAV 또는 MP3를 선택해 저장할 수 있습니다. 재생 볼륨은 출력 단계에만 적용됩니다.";
        labelHint.TextAlign = ContentAlignment.TopLeft;
        //
        // panelBottomBar
        //
        panelBottomBar.Controls.Add(tableBottom);
        panelBottomBar.Dock = DockStyle.Fill;
        panelBottomBar.Margin = new Padding(0);
        panelBottomBar.Name = "panelBottomBar";
        panelBottomBar.Padding = new Padding(0, 6, 0, 14);
        panelBottomBar.TabIndex = 13;
        //
        // tableBottom
        //
        tableBottom.ColumnCount = 2;
        tableBottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tableBottom.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300F));
        tableBottom.Controls.Add(flowBottomButtons, 0, 0);
        tableBottom.Controls.Add(panelVolumeCell, 1, 0);
        tableBottom.Dock = DockStyle.Fill;
        tableBottom.Margin = new Padding(0);
        tableBottom.Name = "tableBottom";
        tableBottom.RowCount = 1;
        tableBottom.RowStyles.Add(new RowStyle(SizeType.Absolute, 92F));
        tableBottom.TabIndex = 0;
        //
        // flowBottomButtons
        //
        flowBottomButtons.AutoSize = false;
        flowBottomButtons.Controls.Add(buttonOpenFile);
        flowBottomButtons.Controls.Add(buttonSpeak);
        flowBottomButtons.Controls.Add(buttonStop);
        flowBottomButtons.Controls.Add(buttonSave);
        flowBottomButtons.Dock = DockStyle.Fill;
        flowBottomButtons.FlowDirection = FlowDirection.LeftToRight;
        flowBottomButtons.Margin = new Padding(0);
        flowBottomButtons.Name = "flowBottomButtons";
        flowBottomButtons.Padding = new Padding(0, 8, 0, 12);
        flowBottomButtons.WrapContents = false;
        flowBottomButtons.TabIndex = 0;
        //
        // buttonOpenFile
        //
        buttonOpenFile.Margin = new Padding(0, 0, 8, 0);
        buttonOpenFile.Size = new Size(110, 32);
        buttonOpenFile.TabIndex = 1;
        buttonOpenFile.Text = "텍스트 파일…";
        buttonOpenFile.UseVisualStyleBackColor = true;
        buttonOpenFile.Click += ButtonOpenFile_Click;
        //
        // buttonSpeak
        //
        buttonSpeak.Margin = new Padding(0, 0, 8, 0);
        buttonSpeak.Size = new Size(44, 34);
        buttonSpeak.TabIndex = 2;
        buttonSpeak.Text = "";
        buttonSpeak.UseVisualStyleBackColor = true;
        buttonSpeak.Click += ButtonSpeak_Click;
        toolTipMain.SetToolTip(buttonSpeak, "읽기 (재생)");
        //
        // buttonStop
        //
        buttonStop.Margin = new Padding(0, 0, 8, 0);
        buttonStop.Size = new Size(44, 34);
        buttonStop.TabIndex = 3;
        buttonStop.Text = "";
        buttonStop.UseVisualStyleBackColor = true;
        buttonStop.Click += ButtonStop_Click;
        toolTipMain.SetToolTip(buttonStop, "중지");
        //
        // buttonSave
        //
        buttonSave.Margin = new Padding(0, 0, 0, 0);
        buttonSave.Size = new Size(110, 32);
        buttonSave.TabIndex = 4;
        buttonSave.Text = "저장…";
        buttonSave.UseVisualStyleBackColor = true;
        buttonSave.Click += ButtonSave_Click;
        toolTipMain.SetToolTip(buttonSave, "WAV 또는 MP3로 저장");
        //
        // panelVolumeCell
        //
        panelVolumeCell.Controls.Add(tableVolume);
        panelVolumeCell.Dock = DockStyle.Fill;
        panelVolumeCell.Margin = new Padding(8, 0, 0, 0);
        panelVolumeCell.Name = "panelVolumeCell";
        panelVolumeCell.TabIndex = 1;
        //
        // tableVolume
        //
        tableVolume.ColumnCount = 2;
        tableVolume.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 48F));
        tableVolume.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tableVolume.Controls.Add(labelVolume, 0, 0);
        tableVolume.Controls.Add(trackBarVolume, 1, 0);
        tableVolume.Dock = DockStyle.Fill;
        tableVolume.Margin = new Padding(0);
        tableVolume.Name = "tableVolume";
        tableVolume.RowCount = 1;
        tableVolume.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        tableVolume.TabIndex = 0;
        //
        // labelVolume
        //
        labelVolume.AutoSize = false;
        labelVolume.Dock = DockStyle.Fill;
        labelVolume.Margin = new Padding(0, 0, 6, 0);
        labelVolume.Text = "볼륨";
        labelVolume.TextAlign = ContentAlignment.MiddleLeft;
        //
        // trackBarVolume
        //
        trackBarVolume.AutoSize = false;
        trackBarVolume.Dock = DockStyle.Top;
        trackBarVolume.Height = 28;
        trackBarVolume.Margin = new Padding(0, 6, 0, 8);
        trackBarVolume.Maximum = 100;
        trackBarVolume.Name = "trackBarVolume";
        trackBarVolume.TabIndex = 6;
        trackBarVolume.TickFrequency = 10;
        trackBarVolume.TickStyle = TickStyle.None;
        trackBarVolume.Value = 80;
        trackBarVolume.Scroll += TrackBarVolume_Scroll;
        //
        // statusStrip
        //
        statusStrip.Dock = DockStyle.Bottom;
        statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel });
        statusStrip.Name = "statusStrip";
        statusStrip.TabIndex = 8;
        statusStrip.Text = "statusStrip1";
        //
        // statusLabel
        //
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(39, 17);
        statusLabel.Text = "준비됨";
        //
        // MainForm
        //
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(820, 600);
        Controls.Add(tableRoot);
        Controls.Add(statusStrip);
        MinimumSize = new Size(820, 580);
        Text = "TTS WinForms — 음성 읽기 · 파형 · 저장";
        groupBoxSynth.ResumeLayout(false);
        tableSynth.ResumeLayout(false);
        tableSynth.PerformLayout();
        panelVolumeCell.ResumeLayout(false);
        tableVolume.ResumeLayout(false);
        tableVolume.PerformLayout();
        flowBottomButtons.ResumeLayout(false);
        flowBottomButtons.PerformLayout();
        tableBottom.ResumeLayout(false);
        panelBottomBar.ResumeLayout(false);
        tableRoot.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
