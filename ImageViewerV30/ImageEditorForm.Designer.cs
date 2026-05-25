namespace ImageViewerV30;

partial class ImageEditorForm
{
    private System.ComponentModel.IContainer components = null!;

    private ToolStrip toolStrip;
    private ToolStripButton toolBtnSave;
    private ToolStripButton toolBtnSaveAs;
    private ToolStripButton toolBtnUndo;
    private ToolStripButton toolBtnRedo;
    private ToolStripButton toolBtnResetAll;
    private SplitContainer splitMain;
    private TabControl tabTools;
    private TabPage tabAdjust;
    private TabPage tabEffects;
    private TabPage tabTransform;
    private TabPage tabBgRemove;

    private Panel pnlAdjustContent;
    private TrackBar trkBrightness;
    private TrackBar trkContrast;
    private TrackBar trkSaturation;
    private TrackBar trkHue;
    private TrackBar trkGamma;
    private TrackBar trkTemperature;
    private Label lblBrightnessVal;
    private Label lblContrastVal;
    private Label lblSaturationVal;
    private Label lblHueVal;
    private Label lblGammaVal;
    private Label lblTemperatureVal;
    private Button btnApplyAdjust;
    private Button btnResetAdjust;

    private Panel pnlEffectsContent;
    private TableLayoutPanel tblEffects;
    private TableLayoutPanel tblInstantFx;
    private TrackBar trkParamEffect;
    private Label lblParamEffectVal;
    private TableLayoutPanel tblParamFx;

    private Panel pnlTransformContent;
    private NumericUpDown numResizeW;
    private NumericUpDown numResizeH;
    private CheckBox chkLockRatio;
    private Button btnApplyResize;
    private NumericUpDown numRotateAngle;
    private Button btnRotate90CW;
    private Button btnRotate90CCW;
    private Button btnRotate180;
    private Button btnApplyRotate;
    private Button btnFlipH;
    private Button btnFlipV;
    private NumericUpDown numCropX;
    private NumericUpDown numCropY;
    private NumericUpDown numCropW;
    private NumericUpDown numCropH;
    private Button btnApplyCrop;

    private Panel pnlBgContent;
    private ComboBox cmbRembgModel;
    private Label lblAiModelStatus;
    private Button btnAiRemoveBg;
    private CheckBox chkShowColorBg;
    private Panel pnlColorBg;
    private Panel pnlBgColorPreview;
    private Button btnPickBgColor;
    private Button btnEyedropper;
    private TrackBar trkTolerance;
    private Label lblToleranceVal;
    private RadioButton rbColorReplace;
    private RadioButton rbFloodFill;
    private Button btnColorRemoveBg;
    private ProgressBar progressBg;
    private Label lblBgProgress;

    private Panel pnlPreviewArea;
    private Panel pnlScroll;
    private PictureBox picPreview;
    private Panel pnlZoomBar;
    private Button btnZoomOut;
    private Label lblZoomPct;
    private Button btnZoomIn;
    private Button btnZoomFit;
    private Button btnZoom1to1;

    private StatusStrip statusStrip;
    private ToolStripStatusLabel statusLblPath;
    private ToolStripStatusLabel statusLblFile;
    private ToolStripStatusLabel statusLblImage;
    private ToolStripStatusLabel statusLblZoom;
    private ToolStripStatusLabel statusLblMessage;

    private const int SidePanelWidth = 320;
    private const int LabelColW = 60;
    private const int ValueColW = 40;
    private const int SliderRowH = 40;
    private const int FxBtnW = 96;
    private const int FxBtnH = 30;
    private const int FxCols = 3;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components is not null) components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();

        toolStrip = new ToolStrip();
        toolBtnSave = new ToolStripButton();
        toolBtnSaveAs = new ToolStripButton();
        toolBtnUndo = new ToolStripButton();
        toolBtnRedo = new ToolStripButton();
        toolBtnResetAll = new ToolStripButton();
        splitMain = new SplitContainer();
        tabTools = new TabControl();
        tabAdjust = new TabPage();
        tabEffects = new TabPage();
        tabTransform = new TabPage();
        tabBgRemove = new TabPage();

        pnlAdjustContent = new Panel();
        trkBrightness = new TrackBar(); trkContrast = new TrackBar();
        trkSaturation = new TrackBar(); trkHue = new TrackBar();
        trkGamma = new TrackBar(); trkTemperature = new TrackBar();
        lblBrightnessVal = new Label(); lblContrastVal = new Label();
        lblSaturationVal = new Label(); lblHueVal = new Label();
        lblGammaVal = new Label(); lblTemperatureVal = new Label();
        btnApplyAdjust = new Button(); btnResetAdjust = new Button();

        pnlEffectsContent = new Panel();
        tblEffects = new TableLayoutPanel();
        tblInstantFx = new TableLayoutPanel();
        trkParamEffect = new TrackBar();
        lblParamEffectVal = new Label();
        tblParamFx = new TableLayoutPanel();

        pnlTransformContent = new Panel();
        numResizeW = new NumericUpDown(); numResizeH = new NumericUpDown();
        chkLockRatio = new CheckBox(); btnApplyResize = new Button();
        numRotateAngle = new NumericUpDown();
        btnRotate90CW = new Button(); btnRotate90CCW = new Button();
        btnRotate180 = new Button(); btnApplyRotate = new Button();
        btnFlipH = new Button(); btnFlipV = new Button();
        numCropX = new NumericUpDown(); numCropY = new NumericUpDown();
        numCropW = new NumericUpDown(); numCropH = new NumericUpDown();
        btnApplyCrop = new Button();

        pnlBgContent = new Panel();
        cmbRembgModel = new ComboBox();
        lblAiModelStatus = new Label();
        btnAiRemoveBg = new Button();
        chkShowColorBg = new CheckBox();
        pnlColorBg = new Panel();
        pnlBgColorPreview = new Panel();
        btnPickBgColor = new Button(); btnEyedropper = new Button();
        trkTolerance = new TrackBar(); lblToleranceVal = new Label();
        rbColorReplace = new RadioButton(); rbFloodFill = new RadioButton();
        btnColorRemoveBg = new Button();
        progressBg = new ProgressBar();
        lblBgProgress = new Label();

        pnlPreviewArea = new Panel();
        pnlScroll = new Panel();
        picPreview = new PictureBox();
        pnlZoomBar = new Panel();
        btnZoomOut = new Button(); lblZoomPct = new Label();
        btnZoomIn = new Button(); btnZoomFit = new Button();
        btnZoom1to1 = new Button();

        statusStrip = new StatusStrip();
        statusLblPath = new ToolStripStatusLabel();
        statusLblFile = new ToolStripStatusLabel();
        statusLblImage = new ToolStripStatusLabel();
        statusLblZoom = new ToolStripStatusLabel();
        statusLblMessage = new ToolStripStatusLabel();

        toolStrip.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitMain).BeginInit();
        splitMain.Panel1.SuspendLayout();
        splitMain.Panel2.SuspendLayout();
        splitMain.SuspendLayout();
        tabTools.SuspendLayout();
        pnlAdjustContent.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)trkBrightness).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trkContrast).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trkSaturation).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trkHue).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trkGamma).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trkTemperature).BeginInit();
        pnlEffectsContent.SuspendLayout();
        tblEffects.SuspendLayout();
        tblInstantFx.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)trkParamEffect).BeginInit();
        tblParamFx.SuspendLayout();
        pnlTransformContent.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)numResizeW).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numResizeH).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numRotateAngle).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numCropX).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numCropY).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numCropW).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numCropH).BeginInit();
        pnlBgContent.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)trkTolerance).BeginInit();
        pnlPreviewArea.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)picPreview).BeginInit();
        pnlZoomBar.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();

        // ToolStrip
        toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        toolStrip.Dock = DockStyle.Top;
        toolStrip.Name = "toolStrip";
        toolStrip.Items.AddRange(new ToolStripItem[]
        {
            toolBtnSave, toolBtnSaveAs, new ToolStripSeparator(),
            toolBtnUndo, toolBtnRedo, new ToolStripSeparator(),
            toolBtnResetAll
        });
        toolBtnSave.Text = "저장"; toolBtnSave.Name = "toolBtnSave";
        toolBtnSaveAs.Text = "다른 이름"; toolBtnSaveAs.Name = "toolBtnSaveAs";
        toolBtnUndo.Text = "취소"; toolBtnUndo.Name = "toolBtnUndo"; toolBtnUndo.Enabled = false;
        toolBtnRedo.Text = "다시"; toolBtnRedo.Name = "toolBtnRedo"; toolBtnRedo.Enabled = false;
        toolBtnResetAll.Text = "초기화"; toolBtnResetAll.Name = "toolBtnResetAll";

        // Split — wide left panel
        splitMain.Dock = DockStyle.Fill;
        splitMain.FixedPanel = FixedPanel.Panel1;
        splitMain.Size = new Size(1280, 720);
        splitMain.SplitterDistance = SidePanelWidth;
        splitMain.Panel1MinSize = 280;
        splitMain.Panel2MinSize = 400;
        splitMain.Name = "splitMain";
        splitMain.Panel1.Controls.Add(tabTools);
        splitMain.Panel2.Controls.Add(pnlPreviewArea);

        tabTools.Dock = DockStyle.Fill;
        tabTools.Name = "tabTools";
        tabTools.TabPages.AddRange(new[] { tabAdjust, tabEffects, tabTransform, tabBgRemove });
        tabAdjust.Text = "조정"; tabAdjust.Name = "tabAdjust";
        tabEffects.Text = "효과"; tabEffects.Name = "tabEffects";
        tabTransform.Text = "변환"; tabTransform.Name = "tabTransform";
        tabBgRemove.Text = "배경"; tabBgRemove.Name = "tabBgRemove";
        tabAdjust.Controls.Add(pnlAdjustContent);
        tabEffects.Controls.Add(pnlEffectsContent);
        tabTransform.Controls.Add(pnlTransformContent);
        tabBgRemove.Controls.Add(pnlBgContent);

        // ── Adjust tab (3-column grid) ───────────────────────────────────
        pnlAdjustContent.Dock = DockStyle.Fill;
        pnlAdjustContent.AutoScroll = true;
        pnlAdjustContent.Padding = new Padding(14, 12, 14, 12);
        pnlAdjustContent.Name = "pnlAdjustContent";

        var tblAdjust = CreateSliderGrid(6);
        AddSliderRow(tblAdjust, 0, "밝기", trkBrightness, lblBrightnessVal, -100, 100, 0);
        AddSliderRow(tblAdjust, 1, "대비", trkContrast, lblContrastVal, -100, 100, 0);
        AddSliderRow(tblAdjust, 2, "채도", trkSaturation, lblSaturationVal, -100, 100, 0);
        AddSliderRow(tblAdjust, 3, "색조", trkHue, lblHueVal, -180, 180, 0);
        AddSliderRow(tblAdjust, 4, "감마", trkGamma, lblGammaVal, 10, 500, 100);
        AddSliderRow(tblAdjust, 5, "색온도", trkTemperature, lblTemperatureVal, -100, 100, 0);
        tblAdjust.Dock = DockStyle.Fill;
        tblAdjust.Name = "tblAdjust";

        var tblAdjustBtns = new TableLayoutPanel
        {
            Dock = DockStyle.Bottom, Height = 44, ColumnCount = 2, RowCount = 1, Name = "tblAdjustBtns"
        };
        tblAdjustBtns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        tblAdjustBtns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        tblAdjustBtns.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        btnApplyAdjust.Text = "적용"; btnApplyAdjust.Name = "btnApplyAdjust";
        btnApplyAdjust.Dock = DockStyle.Fill; btnApplyAdjust.Margin = new Padding(0, 0, 4, 0);
        btnResetAdjust.Text = "리셋"; btnResetAdjust.Name = "btnResetAdjust";
        btnResetAdjust.Dock = DockStyle.Fill; btnResetAdjust.Margin = new Padding(4, 0, 0, 0);
        tblAdjustBtns.Controls.Add(btnApplyAdjust, 0, 0);
        tblAdjustBtns.Controls.Add(btnResetAdjust, 1, 0);
        pnlAdjustContent.Controls.Add(tblAdjustBtns);
        pnlAdjustContent.Controls.Add(tblAdjust);

        // ── Effects tab (aligned button grid) ────────────────────────────
        pnlEffectsContent.Dock = DockStyle.Fill;
        pnlEffectsContent.AutoScroll = true;
        pnlEffectsContent.Padding = new Padding(14, 12, 14, 12);
        pnlEffectsContent.Name = "pnlEffectsContent";

        ConfigureFxGrid(tblInstantFx);
        ConfigureFxGrid(tblParamFx);
        var instantNames = new[]
        {
            "흑백", "세피아", "반전", "비네트", "엣지", "폴라로이드",
            "글로우", "고대비", "포스터", "엠보스", "솔라라이즈"
        };
        PopulateFxGrid(tblInstantFx, instantNames);
        var paramNames = new[] { "흐림", "선명", "픽셀", "유화", "박스블러", "소프트블러", "밝게", "어둡게", "강흐림" };
        PopulateFxGrid(tblParamFx, paramNames, tagIndices: true);

        int instantRows = (instantNames.Length + FxCols - 1) / FxCols;
        int paramRows = (paramNames.Length + FxCols - 1) / FxCols;
        int fxRows = 1 + instantRows + 1 + 1 + paramRows;
        tblEffects = CreateOuterTable(fxRows, 1);
        tblEffects.Dock = DockStyle.Top;
        tblEffects.AutoSize = true;
        tblEffects.Name = "tblEffects";

        int row = 0;
        AddSectionRow(tblEffects, row++, "즉시 효과");
        tblInstantFx.Dock = DockStyle.Fill;
        tblEffects.Controls.Add(tblInstantFx, 0, row++);
        tblEffects.SetRowSpan(tblInstantFx, 1);
        AddSectionRow(tblEffects, row++, "조절 효과");
        var tblParamSlider = CreateSliderGrid(1);
        AddSliderRow(tblParamSlider, 0, "강도", trkParamEffect, lblParamEffectVal, 1, 20, 3);
        trkParamEffect.Name = "trkParamEffect";
        lblParamEffectVal.Name = "lblParamEffectVal";
        tblParamSlider.Dock = DockStyle.Fill;
        tblEffects.Controls.Add(tblParamSlider, 0, row++);
        tblParamFx.Dock = DockStyle.Fill;
        tblEffects.Controls.Add(tblParamFx, 0, row);
        pnlEffectsContent.Controls.Add(tblEffects);

        // ── Transform tab (4-column grid) ────────────────────────────────
        pnlTransformContent.Dock = DockStyle.Fill;
        pnlTransformContent.AutoScroll = true;
        pnlTransformContent.Padding = new Padding(14, 12, 14, 12);
        pnlTransformContent.Name = "pnlTransformContent";

        var tblTransform = CreateFieldGrid(16);
        tblTransform.Dock = DockStyle.Top;
        tblTransform.AutoSize = true;
        tblTransform.Name = "tblTransform";
        int tr = 0;
        tr = AddSectionRow(tblTransform, tr, "크기");
        AddFieldRow2(tblTransform, tr++, "너비", numResizeW, "높이", numResizeH);
        numResizeW.Minimum = 1; numResizeW.Maximum = 16000; numResizeW.Name = "numResizeW";
        numResizeH.Minimum = 1; numResizeH.Maximum = 16000; numResizeH.Name = "numResizeH";
        chkLockRatio.Text = "비율 유지"; chkLockRatio.Checked = true; chkLockRatio.Name = "chkLockRatio";
        chkLockRatio.Dock = DockStyle.Fill;
        tblTransform.Controls.Add(chkLockRatio, 0, tr);
        tblTransform.SetColumnSpan(chkLockRatio, 4);
        tblTransform.RowStyles[tr].Height = 28;
        tr++;
        btnApplyResize.Text = "적용"; btnApplyResize.Name = "btnApplyResize";
        AddActionButton(tblTransform, tr++, btnApplyResize);

        tr = AddSectionRow(tblTransform, tr, "회전");
        AddFieldRow(tblTransform, tr++, "각도", numRotateAngle);
        numRotateAngle.Minimum = -360; numRotateAngle.Maximum = 360; numRotateAngle.Name = "numRotateAngle";
        tblTransform.SetColumnSpan(numRotateAngle, 3);
        btnRotate90CW.Text = "90° ↻"; btnRotate90CW.Name = "btnRotate90CW";
        btnRotate90CCW.Text = "90° ↺"; btnRotate90CCW.Name = "btnRotate90CCW";
        btnRotate180.Text = "180°"; btnRotate180.Name = "btnRotate180";
        AddButtonRow3(tblTransform, tr++, btnRotate90CW, btnRotate90CCW, btnRotate180);
        btnApplyRotate.Text = "각도 적용"; btnApplyRotate.Name = "btnApplyRotate";
        AddActionButton(tblTransform, tr++, btnApplyRotate);

        tr = AddSectionRow(tblTransform, tr, "뒤집기");
        btnFlipH.Text = "좌우"; btnFlipH.Name = "btnFlipH";
        btnFlipV.Text = "상하"; btnFlipV.Name = "btnFlipV";
        AddButtonRow2(tblTransform, tr++, btnFlipH, btnFlipV);

        tr = AddSectionRow(tblTransform, tr, "자르기");
        AddFieldRow2(tblTransform, tr++, "X", numCropX, "Y", numCropY);
        numCropX.Maximum = 16000; numCropX.Name = "numCropX";
        numCropY.Maximum = 16000; numCropY.Name = "numCropY";
        AddFieldRow2(tblTransform, tr++, "W", numCropW, "H", numCropH);
        numCropW.Minimum = 1; numCropW.Maximum = 16000; numCropW.Value = 100; numCropW.Name = "numCropW";
        numCropH.Minimum = 1; numCropH.Maximum = 16000; numCropH.Value = 100; numCropH.Name = "numCropH";
        btnApplyCrop.Text = "자르기"; btnApplyCrop.Name = "btnApplyCrop";
        AddActionButton(tblTransform, tr, btnApplyCrop);
        pnlTransformContent.Controls.Add(tblTransform);

        // ── Background tab ─────────────────────────────────────────────────
        pnlBgContent.Dock = DockStyle.Fill;
        pnlBgContent.AutoScroll = true;
        pnlBgContent.Padding = new Padding(14, 12, 14, 12);
        pnlBgContent.Name = "pnlBgContent";

        progressBg.Dock = DockStyle.Bottom;
        progressBg.Height = 4;
        progressBg.Visible = false;
        progressBg.Name = "progressBg";
        lblBgProgress.Dock = DockStyle.Bottom;
        lblBgProgress.Height = 18;
        lblBgProgress.Visible = false;
        lblBgProgress.Name = "lblBgProgress";

        var tblBg = CreateOuterTable(7, 1);
        tblBg.Dock = DockStyle.Top;
        tblBg.AutoSize = true;
        tblBg.Name = "tblBg";
        int br = 0;
        br = AddSectionRow(tblBg, br, "AI 배경 제거");
        var lblRembgModel = MakeLabel("모델");
        lblRembgModel.Name = "lblRembgModel";
        var pnlRembgModelRow = new TableLayoutPanel
        {
            ColumnCount = 2, RowCount = 1, Dock = DockStyle.Fill, AutoSize = true, Name = "pnlRembgModelRow"
        };
        pnlRembgModelRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColW));
        pnlRembgModelRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        pnlRembgModelRow.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        pnlRembgModelRow.Controls.Add(lblRembgModel, 0, 0);
        cmbRembgModel.Dock = DockStyle.Fill;
        cmbRembgModel.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbRembgModel.Name = "cmbRembgModel";
        foreach (var m in RembgModelInfo.All)
            cmbRembgModel.Items.Add(m);
        cmbRembgModel.SelectedIndex = 0;
        pnlRembgModelRow.Controls.Add(cmbRembgModel, 1, 0);
        tblBg.Controls.Add(pnlRembgModelRow, 0, br++);
        tblBg.RowStyles[br - 1].Height = 32;
        lblAiModelStatus.Text = "모델 확인 중...";
        lblAiModelStatus.Name = "lblAiModelStatus";
        lblAiModelStatus.Dock = DockStyle.Fill;
        tblBg.Controls.Add(lblAiModelStatus, 0, br++);
        tblBg.RowStyles[br - 1].Height = 24;
        btnAiRemoveBg.Text = "배경 제거"; btnAiRemoveBg.Name = "btnAiRemoveBg";
        btnAiRemoveBg.Dock = DockStyle.Fill;
        btnAiRemoveBg.Margin = new Padding(0, 0, 0, 4);
        tblBg.Controls.Add(btnAiRemoveBg, 0, br++);
        tblBg.RowStyles[br - 1].Height = 34;
        chkShowColorBg.Text = "색상 기반 제거"; chkShowColorBg.Name = "chkShowColorBg";
        chkShowColorBg.Dock = DockStyle.Fill;
        tblBg.Controls.Add(chkShowColorBg, 0, br++);
        tblBg.RowStyles[br - 1].Height = 26;

        pnlColorBg.Name = "pnlColorBg";
        pnlColorBg.Visible = false;
        pnlColorBg.Dock = DockStyle.Fill;
        var tblColorBg = CreateFieldGrid(4);
        tblColorBg.Dock = DockStyle.Top;
        tblColorBg.AutoSize = true;
        pnlBgColorPreview.Size = new Size(28, 24);
        pnlBgColorPreview.BorderStyle = BorderStyle.FixedSingle;
        pnlBgColorPreview.BackColor = Color.White;
        pnlBgColorPreview.Cursor = Cursors.Hand;
        pnlBgColorPreview.Dock = DockStyle.Fill;
        pnlBgColorPreview.Name = "pnlBgColorPreview";
        btnPickBgColor.Text = "색상"; btnPickBgColor.Name = "btnPickBgColor";
        btnEyedropper.Text = "스포이드"; btnEyedropper.Name = "btnEyedropper";
        AddButtonRow3(tblColorBg, 0, pnlBgColorPreview, btnPickBgColor, btnEyedropper);
        var tblTol = CreateSliderGrid(1);
        trkTolerance.Maximum = 100; trkTolerance.Value = 20; trkTolerance.Name = "trkTolerance";
        lblToleranceVal.Text = "20"; lblToleranceVal.Name = "lblToleranceVal";
        AddSliderRow(tblTol, 0, "허용", trkTolerance, lblToleranceVal, 0, 100, 20);
        tblTol.Dock = DockStyle.Top;
        tblTol.AutoSize = true;
        tblColorBg.Controls.Add(tblTol, 0, 1);
        tblColorBg.SetRowSpan(tblTol, 1);
        tblColorBg.RowStyles.Add(new RowStyle(SizeType.Absolute, SliderRowH));
        rbColorReplace.Text = "전역"; rbColorReplace.Checked = true; rbColorReplace.Name = "rbColorReplace";
        rbFloodFill.Text = "플러드"; rbFloodFill.Name = "rbFloodFill";
        rbColorReplace.Dock = DockStyle.Fill;
        rbFloodFill.Dock = DockStyle.Fill;
        AddButtonRow2(tblColorBg, 2, rbColorReplace, rbFloodFill);
        btnColorRemoveBg.Text = "제거"; btnColorRemoveBg.Name = "btnColorRemoveBg";
        AddActionButton(tblColorBg, 3, btnColorRemoveBg);
        pnlColorBg.Controls.Add(tblColorBg);
        tblBg.Controls.Add(pnlColorBg, 0, br);
        pnlBgContent.Controls.Add(tblBg);
        pnlBgContent.Controls.Add(lblBgProgress);
        pnlBgContent.Controls.Add(progressBg);

        // ── Preview ──────────────────────────────────────────────────────
        pnlPreviewArea.Dock = DockStyle.Fill;
        pnlPreviewArea.Name = "pnlPreviewArea";
        pnlZoomBar.Dock = DockStyle.Bottom;
        pnlZoomBar.Height = 32;
        pnlZoomBar.Padding = new Padding(8, 4, 8, 4);
        pnlZoomBar.Name = "pnlZoomBar";
        btnZoomOut.Dock = DockStyle.Left; btnZoomOut.Width = 36; btnZoomOut.Text = "−"; btnZoomOut.Name = "btnZoomOut";
        lblZoomPct.Dock = DockStyle.Left; lblZoomPct.Width = 56; lblZoomPct.Text = "100%";
        lblZoomPct.TextAlign = ContentAlignment.MiddleCenter; lblZoomPct.Name = "lblZoomPct";
        btnZoomIn.Dock = DockStyle.Left; btnZoomIn.Width = 36; btnZoomIn.Text = "+"; btnZoomIn.Name = "btnZoomIn";
        btnZoomFit.Dock = DockStyle.Left; btnZoomFit.Width = 48; btnZoomFit.Text = "맞춤"; btnZoomFit.Name = "btnZoomFit";
        btnZoom1to1.Dock = DockStyle.Left; btnZoom1to1.Width = 44; btnZoom1to1.Text = "1:1"; btnZoom1to1.Name = "btnZoom1to1";
        pnlZoomBar.Controls.AddRange(new Control[] { btnZoom1to1, btnZoomFit, btnZoomIn, lblZoomPct, btnZoomOut });
        picPreview.SizeMode = PictureBoxSizeMode.StretchImage;
        picPreview.Name = "picPreview";
        pnlScroll.Dock = DockStyle.Fill;
        pnlScroll.AutoScroll = true;
        pnlScroll.Name = "pnlScroll";
        pnlScroll.Controls.Add(picPreview);
        pnlPreviewArea.Controls.Add(pnlScroll);
        pnlPreviewArea.Controls.Add(pnlZoomBar);

        statusStrip.Dock = DockStyle.Bottom;
        statusStrip.Name = "statusStrip";
        statusLblPath.Spring = true;
        statusLblPath.TextAlign = ContentAlignment.MiddleLeft;
        statusLblPath.Text = "파일을 열면 경로가 표시됩니다.";
        statusLblPath.Name = "statusLblPath";
        statusLblFile.BorderSides = ToolStripStatusLabelBorderSides.Left;
        statusLblFile.TextAlign = ContentAlignment.MiddleLeft;
        statusLblFile.Text = "";
        statusLblFile.Name = "statusLblFile";
        statusLblImage.BorderSides = ToolStripStatusLabelBorderSides.Left;
        statusLblImage.TextAlign = ContentAlignment.MiddleLeft;
        statusLblImage.Text = "";
        statusLblImage.Name = "statusLblImage";
        statusLblZoom.BorderSides = ToolStripStatusLabelBorderSides.Left;
        statusLblZoom.TextAlign = ContentAlignment.MiddleLeft;
        statusLblZoom.Text = "";
        statusLblZoom.Name = "statusLblZoom";
        statusLblMessage.BorderSides = ToolStripStatusLabelBorderSides.Left;
        statusLblMessage.TextAlign = ContentAlignment.MiddleLeft;
        statusLblMessage.Text = "준비";
        statusLblMessage.Name = "statusLblMessage";
        statusStrip.Items.AddRange(new ToolStripItem[]
        {
            statusLblPath, statusLblFile, statusLblImage, statusLblZoom, statusLblMessage
        });

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1280, 720);
        MinimumSize = new Size(960, 560);
        StartPosition = FormStartPosition.CenterParent;
        Text = "이미지 편집";
        Name = "ImageEditorForm";
        Controls.Add(splitMain);
        Controls.Add(toolStrip);
        Controls.Add(statusStrip);

        toolStrip.ResumeLayout(false);
        toolStrip.PerformLayout();
        splitMain.Panel1.ResumeLayout(false);
        splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitMain).EndInit();
        splitMain.ResumeLayout(false);
        tabTools.ResumeLayout(false);
        pnlAdjustContent.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)trkBrightness).EndInit();
        ((System.ComponentModel.ISupportInitialize)trkContrast).EndInit();
        ((System.ComponentModel.ISupportInitialize)trkSaturation).EndInit();
        ((System.ComponentModel.ISupportInitialize)trkHue).EndInit();
        ((System.ComponentModel.ISupportInitialize)trkGamma).EndInit();
        ((System.ComponentModel.ISupportInitialize)trkTemperature).EndInit();
        pnlEffectsContent.ResumeLayout(false);
        pnlEffectsContent.PerformLayout();
        tblEffects.ResumeLayout(false);
        tblInstantFx.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)trkParamEffect).EndInit();
        tblParamFx.ResumeLayout(false);
        pnlTransformContent.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)numResizeW).EndInit();
        ((System.ComponentModel.ISupportInitialize)numResizeH).EndInit();
        ((System.ComponentModel.ISupportInitialize)numRotateAngle).EndInit();
        ((System.ComponentModel.ISupportInitialize)numCropX).EndInit();
        ((System.ComponentModel.ISupportInitialize)numCropY).EndInit();
        ((System.ComponentModel.ISupportInitialize)numCropW).EndInit();
        ((System.ComponentModel.ISupportInitialize)numCropH).EndInit();
        pnlBgContent.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)trkTolerance).EndInit();
        pnlPreviewArea.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)picPreview).EndInit();
        pnlZoomBar.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private static TableLayoutPanel CreateSliderGrid(int rows)
    {
        var tbl = new TableLayoutPanel
        {
            ColumnCount = 3,
            RowCount = rows,
            AutoSize = true
        };
        tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColW));
        tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ValueColW));
        for (int i = 0; i < rows; i++)
            tbl.RowStyles.Add(new RowStyle(SizeType.Absolute, SliderRowH));
        return tbl;
    }

    private static TableLayoutPanel CreateOuterTable(int rows, int cols)
    {
        var tbl = new TableLayoutPanel { ColumnCount = cols, RowCount = rows, AutoSize = true };
        for (int c = 0; c < cols; c++)
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (int r = 0; r < rows; r++)
            tbl.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        return tbl;
    }

    private static TableLayoutPanel CreateFieldGrid(int rows)
    {
        var tbl = new TableLayoutPanel { ColumnCount = 4, RowCount = rows, AutoSize = true };
        tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColW));
        tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColW));
        tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        for (int i = 0; i < rows; i++)
            tbl.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        return tbl;
    }

    private static void AddSliderRow(TableLayoutPanel tbl, int row, string name,
        TrackBar trk, Label valLabel, int min, int max, int val)
    {
        var lbl = new Label
        {
            Text = name, Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Name = "lbl_" + name
        };
        trk.Dock = DockStyle.Fill;
        trk.Minimum = min; trk.Maximum = max; trk.Value = val;
        trk.TickFrequency = Math.Max(1, (max - min) / 10);
        valLabel.Text = name == "감마" ? $"{val / 100.0:0.0}" : val.ToString();
        valLabel.Dock = DockStyle.Fill;
        valLabel.TextAlign = ContentAlignment.MiddleRight;
        tbl.Controls.Add(lbl, 0, row);
        tbl.Controls.Add(trk, 1, row);
        tbl.Controls.Add(valLabel, 2, row);
    }

    private static int AddSectionRow(TableLayoutPanel tbl, int row, string title)
    {
        var lbl = new Label
        {
            Text = title, Dock = DockStyle.Fill,
            Name = "sec_" + title.Replace(" ", "")
        };
        tbl.Controls.Add(lbl, 0, row);
        tbl.SetColumnSpan(lbl, tbl.ColumnCount);
        tbl.RowStyles[row].Height = 22;
        return row + 1;
    }

    private static void ConfigureFxGrid(TableLayoutPanel tbl)
    {
        tbl.ColumnCount = FxCols;
        tbl.AutoSize = true;
        for (int c = 0; c < FxCols; c++)
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, FxBtnW));
    }

    private static void PopulateFxGrid(TableLayoutPanel tbl, string[] names, bool tagIndices = false)
    {
        int rows = (names.Length + FxCols - 1) / FxCols;
        tbl.RowCount = rows;
        for (int r = 0; r < rows; r++)
            tbl.RowStyles.Add(new RowStyle(SizeType.Absolute, FxBtnH + 6));
        for (int i = 0; i < names.Length; i++)
        {
            var btn = UiTheme.CreateFxButton(names[i], tagIndices ? i : null);
            btn.Dock = DockStyle.Fill;
            btn.Margin = new Padding(2);
            tbl.Controls.Add(btn, i % FxCols, i / FxCols);
        }
    }

    private static void AddFieldRow(TableLayoutPanel tbl, int row, string label1, Control input1) =>
        AddFieldCell(tbl, row, 0, label1, input1);

    private static void AddFieldRow2(TableLayoutPanel tbl, int row, string label1, Control input1,
        string label2, Control input2)
    {
        AddFieldCell(tbl, row, 0, label1, input1);
        AddFieldCell(tbl, row, 2, label2, input2);
    }

    private static void AddFieldCell(TableLayoutPanel tbl, int row, int labelCol, string text, Control input)
    {
        tbl.Controls.Add(MakeLabel(text), labelCol, row);
        input.Dock = DockStyle.Fill;
        input.Margin = new Padding(0, 2, 4, 2);
        tbl.Controls.Add(input, labelCol + 1, row);
    }

    private static Label MakeLabel(string text) => new()
    {
        Text = text, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft
    };

    private static void AddActionButton(TableLayoutPanel tbl, int row, Button btn)
    {
        btn.Dock = DockStyle.Fill;
        btn.Margin = new Padding(0, 4, 0, 4);
        btn.Height = 28;
        tbl.Controls.Add(btn, 0, row);
        tbl.SetColumnSpan(btn, tbl.ColumnCount);
        tbl.RowStyles[row].Height = 36;
    }

    private static void AddButtonRow2(TableLayoutPanel tbl, int row, Control left, Control right)
    {
        left.Dock = DockStyle.Fill;
        left.Margin = new Padding(0, 2, 4, 2);
        right.Dock = DockStyle.Fill;
        right.Margin = new Padding(4, 2, 0, 2);
        tbl.Controls.Add(left, 0, row);
        tbl.SetColumnSpan(left, 2);
        tbl.Controls.Add(right, 2, row);
        tbl.SetColumnSpan(right, 2);
        tbl.RowStyles[row].Height = 32;
    }

    private static void AddButtonRow3(TableLayoutPanel tbl, int row, Control a, Control b, Control c)
    {
        a.Dock = DockStyle.Fill; a.Margin = new Padding(0, 2, 2, 2);
        b.Dock = DockStyle.Fill; b.Margin = new Padding(2, 2, 2, 2);
        c.Dock = DockStyle.Fill; c.Margin = new Padding(2, 2, 0, 2);
        tbl.Controls.Add(a, 0, row);
        tbl.Controls.Add(b, 1, row);
        tbl.Controls.Add(c, 2, row);
        tbl.SetColumnSpan(c, 2);
        tbl.RowStyles[row].Height = 32;
    }
}
