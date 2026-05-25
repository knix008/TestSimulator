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

    // 색상 조정 탭
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

    // 효과 탭
    private Panel pnlEffectsContent;
    private Button btnFxGrayscale;
    private Button btnFxSepia;
    private Button btnFxInvert;
    private Button btnFxVignette;
    private Button btnFxEdge;
    private Panel pnlParamEffect;
    private Label lblParamEffectTitle;
    private ComboBox cmbParamEffect;
    private TrackBar trkParamEffect;
    private Label lblParamEffectVal;
    private Button btnApplyParamEffect;

    // 변환 탭
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

    // 배경 제거 탭
    private Panel pnlBgContent;
    private Panel pnlBgColorPreview;
    private Button btnPickBgColor;
    private Button btnEyedropper;
    private TrackBar trkTolerance;
    private Label lblToleranceVal;
    private RadioButton rbColorReplace;
    private RadioButton rbFloodFill;
    private Button btnRemoveBg;
    private Label lblBgNote;

    // 미리보기
    private Panel pnlPreviewArea;
    private PictureBox picPreview;
    private Panel pnlZoomBar;
    private Button btnZoomOut;
    private Label lblZoomPct;
    private Button btnZoomIn;
    private Button btnZoomFit;
    private Button btnZoom1to1;

    // 상태바
    private StatusStrip statusStrip;
    private ToolStripStatusLabel statusLblInfo;

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
        btnFxGrayscale = new Button(); btnFxSepia = new Button();
        btnFxInvert = new Button(); btnFxVignette = new Button();
        btnFxEdge = new Button();
        pnlParamEffect = new Panel();
        lblParamEffectTitle = new Label();
        cmbParamEffect = new ComboBox();
        trkParamEffect = new TrackBar();
        lblParamEffectVal = new Label();
        btnApplyParamEffect = new Button();

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
        pnlBgColorPreview = new Panel();
        btnPickBgColor = new Button(); btnEyedropper = new Button();
        trkTolerance = new TrackBar(); lblToleranceVal = new Label();
        rbColorReplace = new RadioButton(); rbFloodFill = new RadioButton();
        btnRemoveBg = new Button(); lblBgNote = new Label();

        pnlPreviewArea = new Panel();
        picPreview = new PictureBox();
        pnlZoomBar = new Panel();
        btnZoomOut = new Button(); lblZoomPct = new Label();
        btnZoomIn = new Button(); btnZoomFit = new Button();
        btnZoom1to1 = new Button();

        statusStrip = new StatusStrip();
        statusLblInfo = new ToolStripStatusLabel();

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
        ((System.ComponentModel.ISupportInitialize)trkParamEffect).BeginInit();
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

        // ── ToolStrip ─────────────────────────────────────────────────────
        toolStrip.BackColor = Color.FromArgb(40, 40, 48);
        toolStrip.ForeColor = Color.WhiteSmoke;
        toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        toolStrip.Items.AddRange(new ToolStripItem[]
        {
            toolBtnSave, toolBtnSaveAs,
            new ToolStripSeparator(),
            toolBtnUndo, toolBtnRedo,
            new ToolStripSeparator(),
            toolBtnResetAll
        });
        toolStrip.Dock = DockStyle.Top;
        toolStrip.RenderMode = ToolStripRenderMode.System;
        toolStrip.Name = "toolStrip";

        toolBtnSave.Text = "저장"; toolBtnSave.Name = "toolBtnSave";
        toolBtnSaveAs.Text = "다른 이름으로 저장"; toolBtnSaveAs.Name = "toolBtnSaveAs";
        toolBtnUndo.Text = "↩ 실행 취소"; toolBtnUndo.Name = "toolBtnUndo"; toolBtnUndo.Enabled = false;
        toolBtnRedo.Text = "↪ 다시 실행"; toolBtnRedo.Name = "toolBtnRedo"; toolBtnRedo.Enabled = false;
        toolBtnResetAll.Text = "원본으로 초기화"; toolBtnResetAll.Name = "toolBtnResetAll";

        // ── SplitContainer ────────────────────────────────────────────────
        splitMain.Dock = DockStyle.Fill;
        splitMain.FixedPanel = FixedPanel.Panel1;
        splitMain.Size = new Size(1200, 650); // EndInit 유효성 검사 통과를 위해 초기 크기 설정
        splitMain.SplitterDistance = 300;
        splitMain.Panel1MinSize = 260;
        splitMain.Panel2MinSize = 400;
        splitMain.Name = "splitMain";
        splitMain.Panel1.Controls.Add(tabTools);
        splitMain.Panel2.Controls.Add(pnlPreviewArea);

        // ── TabControl ────────────────────────────────────────────────────
        tabTools.Dock = DockStyle.Fill;
        tabTools.Name = "tabTools";
        tabTools.TabPages.Add(tabAdjust);
        tabTools.TabPages.Add(tabEffects);
        tabTools.TabPages.Add(tabTransform);
        tabTools.TabPages.Add(tabBgRemove);

        tabAdjust.Text = "색상 조정"; tabAdjust.Name = "tabAdjust";
        tabAdjust.Controls.Add(pnlAdjustContent);
        tabAdjust.Padding = new Padding(0);

        tabEffects.Text = "효과"; tabEffects.Name = "tabEffects";
        tabEffects.Controls.Add(pnlEffectsContent);

        tabTransform.Text = "변환"; tabTransform.Name = "tabTransform";
        tabTransform.Controls.Add(pnlTransformContent);

        tabBgRemove.Text = "배경 제거"; tabBgRemove.Name = "tabBgRemove";
        tabBgRemove.Controls.Add(pnlBgContent);

        // ── 색상 조정 탭 내용 ────────────────────────────────────────────
        pnlAdjustContent.Dock = DockStyle.Fill;
        pnlAdjustContent.AutoScroll = true;
        pnlAdjustContent.Padding = new Padding(8, 6, 8, 6);
        pnlAdjustContent.Name = "pnlAdjustContent";

        SetupAdjustSlider(trkBrightness, lblBrightnessVal, "밝기", -100, 100, 0, 0, pnlAdjustContent);
        SetupAdjustSlider(trkContrast, lblContrastVal, "대비", -100, 100, 0, 36, pnlAdjustContent);
        SetupAdjustSlider(trkSaturation, lblSaturationVal, "채도", -100, 100, 0, 72, pnlAdjustContent);
        SetupAdjustSlider(trkHue, lblHueVal, "색조", -180, 180, 0, 108, pnlAdjustContent);
        SetupAdjustSlider(trkGamma, lblGammaVal, "감마", 10, 500, 100, 144, pnlAdjustContent);
        SetupAdjustSlider(trkTemperature, lblTemperatureVal, "색온도", -100, 100, 0, 180, pnlAdjustContent);

        btnApplyAdjust.Location = new Point(8, 222);
        btnApplyAdjust.Size = new Size(80, 28);
        btnApplyAdjust.Text = "적용";
        btnApplyAdjust.FlatStyle = FlatStyle.Flat;
        btnApplyAdjust.BackColor = Color.FromArgb(0, 122, 204);
        btnApplyAdjust.ForeColor = Color.White;
        btnApplyAdjust.FlatAppearance.BorderSize = 0;
        btnApplyAdjust.Name = "btnApplyAdjust";
        pnlAdjustContent.Controls.Add(btnApplyAdjust);

        btnResetAdjust.Location = new Point(96, 222);
        btnResetAdjust.Size = new Size(80, 28);
        btnResetAdjust.Text = "초기화";
        btnResetAdjust.FlatStyle = FlatStyle.Flat;
        btnResetAdjust.BackColor = Color.FromArgb(60, 60, 70);
        btnResetAdjust.ForeColor = Color.WhiteSmoke;
        btnResetAdjust.FlatAppearance.BorderSize = 0;
        btnResetAdjust.Name = "btnResetAdjust";
        pnlAdjustContent.Controls.Add(btnResetAdjust);

        // ── 효과 탭 내용 ─────────────────────────────────────────────────
        pnlEffectsContent.Dock = DockStyle.Fill;
        pnlEffectsContent.AutoScroll = true;
        pnlEffectsContent.Padding = new Padding(8, 8, 8, 8);
        pnlEffectsContent.Name = "pnlEffectsContent";

        int ex = 8, ey = 8, ew = 122, eh = 32, egap = 4;
        SetupFxButton(btnFxGrayscale, "흑백", ex, ey, ew, eh);
        SetupFxButton(btnFxSepia, "세피아", ex + ew + egap, ey, ew, eh);
        SetupFxButton(btnFxInvert, "색 반전", ex, ey + eh + egap, ew, eh);
        SetupFxButton(btnFxVignette, "비네트", ex + ew + egap, ey + eh + egap, ew, eh);
        SetupFxButton(btnFxEdge, "엣지 검출", ex, ey + (eh + egap) * 2, ew, eh);
        pnlEffectsContent.Controls.AddRange(new Control[]
            { btnFxGrayscale, btnFxSepia, btnFxInvert, btnFxVignette, btnFxEdge });

        // 파라미터 효과 섹션
        int paramY = ey + (eh + egap) * 3 + 8;
        var sep = new Label
        {
            Text = "── 파라미터 효과 ──",
            Location = new Point(8, paramY),
            Size = new Size(264, 20),
            ForeColor = Color.Gray,
            TextAlign = ContentAlignment.MiddleCenter,
            Name = "lblParamSep"
        };
        pnlEffectsContent.Controls.Add(sep);

        pnlParamEffect.Location = new Point(8, paramY + 26);
        pnlParamEffect.Size = new Size(268, 130);
        pnlParamEffect.Name = "pnlParamEffect";
        pnlEffectsContent.Controls.Add(pnlParamEffect);

        lblParamEffectTitle.Text = "효과 선택:";
        lblParamEffectTitle.Location = new Point(0, 0);
        lblParamEffectTitle.Size = new Size(268, 18);
        lblParamEffectTitle.ForeColor = Color.Gainsboro;
        pnlParamEffect.Controls.Add(lblParamEffectTitle);

        cmbParamEffect.Location = new Point(0, 20);
        cmbParamEffect.Size = new Size(268, 24);
        cmbParamEffect.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbParamEffect.Items.AddRange(new object[] { "가우시안 흐림", "선명하게", "픽셀화", "유화 효과" });
        cmbParamEffect.SelectedIndex = 0;
        cmbParamEffect.Name = "cmbParamEffect";
        pnlParamEffect.Controls.Add(cmbParamEffect);

        var lblParamSlider = new Label
        {
            Text = "강도:",
            Location = new Point(0, 50),
            Size = new Size(40, 22),
            ForeColor = Color.Gainsboro,
            TextAlign = ContentAlignment.MiddleLeft,
            Name = "lblParamSlider"
        };
        pnlParamEffect.Controls.Add(lblParamSlider);

        trkParamEffect.Location = new Point(44, 48);
        trkParamEffect.Size = new Size(178, 26);
        trkParamEffect.Minimum = 1; trkParamEffect.Maximum = 20;
        trkParamEffect.Value = 3;
        trkParamEffect.TickFrequency = 5;
        trkParamEffect.Name = "trkParamEffect";
        pnlParamEffect.Controls.Add(trkParamEffect);

        lblParamEffectVal.Text = "3";
        lblParamEffectVal.Location = new Point(226, 50);
        lblParamEffectVal.Size = new Size(40, 22);
        lblParamEffectVal.ForeColor = Color.Gainsboro;
        lblParamEffectVal.TextAlign = ContentAlignment.MiddleLeft;
        lblParamEffectVal.Name = "lblParamEffectVal";
        pnlParamEffect.Controls.Add(lblParamEffectVal);

        btnApplyParamEffect.Location = new Point(0, 82);
        btnApplyParamEffect.Size = new Size(100, 30);
        btnApplyParamEffect.Text = "효과 적용";
        btnApplyParamEffect.FlatStyle = FlatStyle.Flat;
        btnApplyParamEffect.BackColor = Color.FromArgb(0, 122, 204);
        btnApplyParamEffect.ForeColor = Color.White;
        btnApplyParamEffect.FlatAppearance.BorderSize = 0;
        btnApplyParamEffect.Name = "btnApplyParamEffect";
        pnlParamEffect.Controls.Add(btnApplyParamEffect);

        // ── 변환 탭 내용 ─────────────────────────────────────────────────
        pnlTransformContent.Dock = DockStyle.Fill;
        pnlTransformContent.AutoScroll = true;
        pnlTransformContent.Padding = new Padding(8, 6, 8, 6);
        pnlTransformContent.Name = "pnlTransformContent";

        int ty = 0;
        // 크기 조정 그룹
        ty = AddTransformGroup(pnlTransformContent, "크기 조정", ty);
        AddInlineLabel(pnlTransformContent, "너비:", 8, ty + 2, 44);
        numResizeW.Location = new Point(56, ty); numResizeW.Size = new Size(72, 23);
        numResizeW.Minimum = 1; numResizeW.Maximum = 16000; numResizeW.Name = "numResizeW";
        AddInlineLabel(pnlTransformContent, "높이:", 136, ty + 2, 44);
        numResizeH.Location = new Point(184, ty); numResizeH.Size = new Size(72, 23);
        numResizeH.Minimum = 1; numResizeH.Maximum = 16000; numResizeH.Name = "numResizeH";
        pnlTransformContent.Controls.AddRange(new Control[] { numResizeW, numResizeH });

        chkLockRatio.Location = new Point(8, ty + 30); chkLockRatio.Size = new Size(140, 20);
        chkLockRatio.Text = "비율 유지"; chkLockRatio.Checked = true;
        chkLockRatio.ForeColor = Color.Gainsboro; chkLockRatio.Name = "chkLockRatio";
        pnlTransformContent.Controls.Add(chkLockRatio);

        btnApplyResize.Location = new Point(8, ty + 56); btnApplyResize.Size = new Size(100, 28);
        btnApplyResize.Text = "크기 적용"; StyleButton(btnApplyResize, true);
        btnApplyResize.Name = "btnApplyResize";
        pnlTransformContent.Controls.Add(btnApplyResize);
        ty += 100;

        // 회전 그룹
        ty = AddTransformGroup(pnlTransformContent, "회전", ty);
        AddInlineLabel(pnlTransformContent, "각도(°):", 8, ty + 2, 60);
        numRotateAngle.Location = new Point(72, ty); numRotateAngle.Size = new Size(72, 23);
        numRotateAngle.Minimum = -360; numRotateAngle.Maximum = 360; numRotateAngle.Name = "numRotateAngle";
        pnlTransformContent.Controls.Add(numRotateAngle);

        btnRotate90CW.Location = new Point(8, ty + 30); btnRotate90CW.Size = new Size(58, 28);
        btnRotate90CW.Text = "90° ↻"; StyleButton(btnRotate90CW, false); btnRotate90CW.Name = "btnRotate90CW";
        btnRotate90CCW.Location = new Point(70, ty + 30); btnRotate90CCW.Size = new Size(58, 28);
        btnRotate90CCW.Text = "90° ↺"; StyleButton(btnRotate90CCW, false); btnRotate90CCW.Name = "btnRotate90CCW";
        btnRotate180.Location = new Point(132, ty + 30); btnRotate180.Size = new Size(58, 28);
        btnRotate180.Text = "180°"; StyleButton(btnRotate180, false); btnRotate180.Name = "btnRotate180";
        btnApplyRotate.Location = new Point(8, ty + 64); btnApplyRotate.Size = new Size(100, 28);
        btnApplyRotate.Text = "각도 적용"; StyleButton(btnApplyRotate, true); btnApplyRotate.Name = "btnApplyRotate";
        pnlTransformContent.Controls.AddRange(new Control[]
            { btnRotate90CW, btnRotate90CCW, btnRotate180, btnApplyRotate });
        ty += 108;

        // 뒤집기 그룹
        ty = AddTransformGroup(pnlTransformContent, "뒤집기", ty);
        btnFlipH.Location = new Point(8, ty); btnFlipH.Size = new Size(100, 30);
        btnFlipH.Text = "좌우 뒤집기"; StyleButton(btnFlipH, false); btnFlipH.Name = "btnFlipH";
        btnFlipV.Location = new Point(114, ty); btnFlipV.Size = new Size(100, 30);
        btnFlipV.Text = "상하 뒤집기"; StyleButton(btnFlipV, false); btnFlipV.Name = "btnFlipV";
        pnlTransformContent.Controls.AddRange(new Control[] { btnFlipH, btnFlipV });
        ty += 46;

        // 자르기 그룹
        ty = AddTransformGroup(pnlTransformContent, "자르기 (픽셀)", ty);
        AddInlineLabel(pnlTransformContent, "X:", 8, ty + 2, 18);
        numCropX.Location = new Point(28, ty); numCropX.Size = new Size(56, 23);
        numCropX.Maximum = 16000; numCropX.Name = "numCropX";
        AddInlineLabel(pnlTransformContent, "Y:", 90, ty + 2, 18);
        numCropY.Location = new Point(110, ty); numCropY.Size = new Size(56, 23);
        numCropY.Maximum = 16000; numCropY.Name = "numCropY";
        pnlTransformContent.Controls.AddRange(new Control[] { numCropX, numCropY });

        AddInlineLabel(pnlTransformContent, "W:", 8, ty + 30, 18);
        numCropW.Location = new Point(28, ty + 28); numCropW.Size = new Size(56, 23);
        numCropW.Minimum = 1; numCropW.Maximum = 16000; numCropW.Value = 100; numCropW.Name = "numCropW";
        AddInlineLabel(pnlTransformContent, "H:", 90, ty + 30, 18);
        numCropH.Location = new Point(110, ty + 28); numCropH.Size = new Size(56, 23);
        numCropH.Minimum = 1; numCropH.Maximum = 16000; numCropH.Value = 100; numCropH.Name = "numCropH";
        pnlTransformContent.Controls.AddRange(new Control[] { numCropW, numCropH });

        btnApplyCrop.Location = new Point(8, ty + 58); btnApplyCrop.Size = new Size(100, 28);
        btnApplyCrop.Text = "자르기 적용"; StyleButton(btnApplyCrop, true); btnApplyCrop.Name = "btnApplyCrop";
        pnlTransformContent.Controls.Add(btnApplyCrop);

        // ── 배경 제거 탭 내용 ────────────────────────────────────────────
        pnlBgContent.Dock = DockStyle.Fill;
        pnlBgContent.AutoScroll = true;
        pnlBgContent.Padding = new Padding(8, 8, 8, 8);
        pnlBgContent.Name = "pnlBgContent";

        AddInlineLabel(pnlBgContent, "배경 색상:", 0, 2, 72);
        pnlBgColorPreview.Location = new Point(76, 0);
        pnlBgColorPreview.Size = new Size(36, 24);
        pnlBgColorPreview.BorderStyle = BorderStyle.FixedSingle;
        pnlBgColorPreview.BackColor = Color.White;
        pnlBgColorPreview.Name = "pnlBgColorPreview";
        pnlBgColorPreview.Cursor = Cursors.Hand;
        pnlBgContent.Controls.Add(pnlBgColorPreview);

        btnPickBgColor.Location = new Point(118, 0); btnPickBgColor.Size = new Size(70, 24);
        btnPickBgColor.Text = "색상 선택"; StyleButton(btnPickBgColor, false); btnPickBgColor.Name = "btnPickBgColor";
        btnEyedropper.Location = new Point(194, 0); btnEyedropper.Size = new Size(70, 24);
        btnEyedropper.Text = "🔍 스포이드"; StyleButton(btnEyedropper, false); btnEyedropper.Name = "btnEyedropper";
        pnlBgContent.Controls.AddRange(new Control[] { btnPickBgColor, btnEyedropper });

        AddInlineLabel(pnlBgContent, "허용 범위:", 0, 34, 68);
        trkTolerance.Location = new Point(72, 32); trkTolerance.Size = new Size(160, 26);
        trkTolerance.Minimum = 0; trkTolerance.Maximum = 100; trkTolerance.Value = 20;
        trkTolerance.TickFrequency = 10; trkTolerance.Name = "trkTolerance";
        pnlBgContent.Controls.Add(trkTolerance);
        lblToleranceVal.Text = "20"; lblToleranceVal.Location = new Point(236, 34);
        lblToleranceVal.Size = new Size(32, 22); lblToleranceVal.ForeColor = Color.Gainsboro;
        lblToleranceVal.Name = "lblToleranceVal";
        pnlBgContent.Controls.Add(lblToleranceVal);

        AddInlineLabel(pnlBgContent, "방법:", 0, 70, 40);
        rbColorReplace.Location = new Point(44, 68); rbColorReplace.Size = new Size(100, 22);
        rbColorReplace.Text = "전역 색상"; rbColorReplace.Checked = true;
        rbColorReplace.ForeColor = Color.Gainsboro; rbColorReplace.Name = "rbColorReplace";
        rbFloodFill.Location = new Point(148, 68); rbFloodFill.Size = new Size(100, 22);
        rbFloodFill.Text = "플러드 필"; rbFloodFill.ForeColor = Color.Gainsboro;
        rbFloodFill.Name = "rbFloodFill";
        pnlBgContent.Controls.AddRange(new Control[] { rbColorReplace, rbFloodFill });

        btnRemoveBg.Location = new Point(0, 100); btnRemoveBg.Size = new Size(130, 32);
        btnRemoveBg.Text = "배경 제거 적용"; StyleButton(btnRemoveBg, true); btnRemoveBg.Name = "btnRemoveBg";
        pnlBgContent.Controls.Add(btnRemoveBg);

        lblBgNote.Location = new Point(0, 142); lblBgNote.Size = new Size(270, 40);
        lblBgNote.Text = "※ 투명 배경 보존을 위해 PNG로 저장하세요.";
        lblBgNote.ForeColor = Color.DarkGray; lblBgNote.Name = "lblBgNote";
        pnlBgContent.Controls.Add(lblBgNote);

        // ── 미리보기 영역 ────────────────────────────────────────────────
        pnlPreviewArea.Dock = DockStyle.Fill;
        pnlPreviewArea.BackColor = Color.FromArgb(18, 18, 22);
        pnlPreviewArea.Name = "pnlPreviewArea";

        pnlZoomBar.Dock = DockStyle.Bottom;
        pnlZoomBar.Height = 34;
        pnlZoomBar.BackColor = Color.FromArgb(28, 28, 34);
        pnlZoomBar.Padding = new Padding(6, 3, 6, 3);
        pnlZoomBar.Name = "pnlZoomBar";

        btnZoomOut.Dock = DockStyle.Left; btnZoomOut.Width = 32;
        btnZoomOut.Text = "−"; btnZoomOut.FlatStyle = FlatStyle.Flat;
        btnZoomOut.FlatAppearance.BorderSize = 0;
        btnZoomOut.BackColor = Color.FromArgb(50, 50, 58);
        btnZoomOut.ForeColor = Color.WhiteSmoke; btnZoomOut.Font = new Font("Segoe UI", 12f);
        btnZoomOut.Name = "btnZoomOut";

        lblZoomPct.Dock = DockStyle.Left; lblZoomPct.Width = 64;
        lblZoomPct.Text = "100%"; lblZoomPct.ForeColor = Color.Gainsboro;
        lblZoomPct.TextAlign = ContentAlignment.MiddleCenter; lblZoomPct.Name = "lblZoomPct";

        btnZoomIn.Dock = DockStyle.Left; btnZoomIn.Width = 32;
        btnZoomIn.Text = "+"; btnZoomIn.FlatStyle = FlatStyle.Flat;
        btnZoomIn.FlatAppearance.BorderSize = 0;
        btnZoomIn.BackColor = Color.FromArgb(50, 50, 58);
        btnZoomIn.ForeColor = Color.WhiteSmoke; btnZoomIn.Font = new Font("Segoe UI", 12f);
        btnZoomIn.Name = "btnZoomIn";

        btnZoomFit.Dock = DockStyle.Left; btnZoomFit.Width = 52;
        btnZoomFit.Text = "맞춤"; btnZoomFit.FlatStyle = FlatStyle.Flat;
        btnZoomFit.FlatAppearance.BorderSize = 0;
        btnZoomFit.BackColor = Color.FromArgb(50, 50, 58);
        btnZoomFit.ForeColor = Color.WhiteSmoke; btnZoomFit.Margin = new Padding(4, 0, 0, 0);
        btnZoomFit.Name = "btnZoomFit";

        btnZoom1to1.Dock = DockStyle.Left; btnZoom1to1.Width = 48;
        btnZoom1to1.Text = "1:1"; btnZoom1to1.FlatStyle = FlatStyle.Flat;
        btnZoom1to1.FlatAppearance.BorderSize = 0;
        btnZoom1to1.BackColor = Color.FromArgb(50, 50, 58);
        btnZoom1to1.ForeColor = Color.WhiteSmoke;
        btnZoom1to1.Name = "btnZoom1to1";

        pnlZoomBar.Controls.Add(btnZoom1to1);
        pnlZoomBar.Controls.Add(btnZoomFit);
        pnlZoomBar.Controls.Add(btnZoomIn);
        pnlZoomBar.Controls.Add(lblZoomPct);
        pnlZoomBar.Controls.Add(btnZoomOut);

        picPreview.SizeMode = PictureBoxSizeMode.AutoSize;
        picPreview.BackColor = Color.FromArgb(18, 18, 22);
        picPreview.Location = new Point(0, 0);
        picPreview.Name = "picPreview";

        var pnlScroll = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = Color.FromArgb(18, 18, 22),
            Name = "pnlScroll"
        };
        pnlScroll.Controls.Add(picPreview);
        pnlPreviewArea.Controls.Add(pnlScroll);
        pnlPreviewArea.Controls.Add(pnlZoomBar);

        // ── StatusStrip ───────────────────────────────────────────────────
        statusStrip.Items.Add(statusLblInfo);
        statusStrip.Dock = DockStyle.Bottom;
        statusStrip.Name = "statusStrip";
        statusLblInfo.Name = "statusLblInfo"; statusLblInfo.Spring = true;
        statusLblInfo.Text = "준비";
        statusLblInfo.TextAlign = ContentAlignment.MiddleLeft;

        // ── Form ──────────────────────────────────────────────────────────
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1200, 720);
        MinimumSize = new Size(900, 550);
        StartPosition = FormStartPosition.CenterParent;
        Text = "이미지 편집기 — ImageViewerV30";
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
        ((System.ComponentModel.ISupportInitialize)trkParamEffect).EndInit();
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

    private void SetupAdjustSlider(TrackBar trk, Label valLabel, string name,
        int min, int max, int val, int y, Panel parent)
    {
        int totalH = 28;
        var lbl = new Label
        {
            Text = name, Location = new Point(4, y + 6),
            Size = new Size(52, 18), ForeColor = Color.Gainsboro,
            TextAlign = ContentAlignment.MiddleRight, Name = "lbl" + name,
            Anchor = AnchorStyles.Left | AnchorStyles.Top
        };
        trk.Location = new Point(60, y); trk.Size = new Size(164, totalH);
        trk.Minimum = min; trk.Maximum = max; trk.Value = val;
        trk.TickFrequency = Math.Max(1, (max - min) / 10);
        trk.AutoSize = false;
        trk.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top;

        string displayVal = name == "감마" ? $"{val / 100.0:0.0}" : val.ToString();
        valLabel.Text = displayVal;
        valLabel.Location = new Point(228, y + 6);
        valLabel.Size = new Size(44, 18);
        valLabel.ForeColor = Color.Gainsboro;
        valLabel.TextAlign = ContentAlignment.MiddleLeft;
        valLabel.Anchor = AnchorStyles.Right | AnchorStyles.Top;

        parent.Controls.AddRange(new Control[] { lbl, trk, valLabel });
    }

    private static void SetupFxButton(Button btn, string text, int x, int y, int w, int h)
    {
        btn.Location = new Point(x, y); btn.Size = new Size(w, h);
        btn.Text = text; btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderSize = 1;
        btn.FlatAppearance.BorderColor = Color.FromArgb(70, 70, 80);
        btn.BackColor = Color.FromArgb(45, 45, 55);
        btn.ForeColor = Color.WhiteSmoke;
    }

    private static void StyleButton(Button btn, bool primary)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderSize = 0;
        btn.BackColor = primary ? Color.FromArgb(0, 122, 204) : Color.FromArgb(55, 55, 65);
        btn.ForeColor = Color.White;
    }

    private static int AddTransformGroup(Panel parent, string title, int y)
    {
        var lbl = new Label
        {
            Text = title, Location = new Point(0, y),
            Size = new Size(280, 22), ForeColor = Color.FromArgb(160, 200, 255),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        var sep = new Label
        {
            Location = new Point(0, y + 20), Size = new Size(280, 1),
            BackColor = Color.FromArgb(60, 60, 72)
        };
        parent.Controls.AddRange(new Control[] { lbl, sep });
        return y + 28;
    }

    private static void AddInlineLabel(Panel parent, string text, int x, int y, int w)
    {
        parent.Controls.Add(new Label
        {
            Text = text, Location = new Point(x, y), Size = new Size(w, 20),
            ForeColor = Color.Gainsboro, TextAlign = ContentAlignment.MiddleLeft
        });
    }
}
