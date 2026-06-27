namespace ImageRembgWinV10;



partial class ImageRembgForm

{

    private System.ComponentModel.IContainer components = null;



    protected override void Dispose(bool disposing)

    {

        if (disposing && components != null)

        {

            components.Dispose();

        }



        base.Dispose(disposing);

    }



    #region Windows Form Designer generated code



    private void InitializeComponent()

    {

        components = new System.ComponentModel.Container();

        menuStrip = new MenuStrip();

        mnuFile = new ToolStripMenuItem();

        mnuOpen = new ToolStripMenuItem();

        mnuSave = new ToolStripMenuItem();

        toolStripSeparator1 = new ToolStripSeparator();

        mnuExit = new ToolStripMenuItem();

        mnuEdit = new ToolStripMenuItem();

        mnuPreview = new ToolStripMenuItem();

        mnuRemoveBackground = new ToolStripMenuItem();

        mnuReset = new ToolStripMenuItem();

        mnuView = new ToolStripMenuItem();

        mnuZoomIn = new ToolStripMenuItem();

        mnuZoomOut = new ToolStripMenuItem();

        mnuFit = new ToolStripMenuItem();

        toolStripSeparator2 = new ToolStripSeparator();

        mnuShowMask = new ToolStripMenuItem();

        mnuShowResult = new ToolStripMenuItem();

        mnuTools = new ToolStripMenuItem();

        mnuSelectFreehand = new ToolStripMenuItem();

        mnuSelectRect = new ToolStripMenuItem();

        mnuForeground = new ToolStripMenuItem();

        mnuBackground = new ToolStripMenuItem();

        mnuPan = new ToolStripMenuItem();

        mnuAlgorithm = new ToolStripMenuItem();

        mnuAlgoRembg = new ToolStripMenuItem();

        mnuAlgoGrabCut = new ToolStripMenuItem();

        mnuAlgoColorKey = new ToolStripMenuItem();

        mnuAlgoEdgeFill = new ToolStripMenuItem();

        mnuAlgoThreshold = new ToolStripMenuItem();

        imageListIcons = new ImageList(components);

        panelToolbar = new Panel();

        btnOpen = new Controls.CenteredToolbarButton();

        btnPreview = new Controls.CenteredToolbarButton();

        btnRemoveBackground = new Controls.CenteredToolbarButton();

        btnSave = new Controls.CenteredToolbarButton();

        btnReset = new Controls.CenteredToolbarButton();

        btnZoomOut = new Controls.CenteredToolbarButton();

        btnZoomIn = new Controls.CenteredToolbarButton();

        btnFit = new Controls.CenteredToolbarButton();

        btnInfo = new Controls.CenteredToolbarButton();

        rbSelectFreehand = new Controls.CenteredToolbarRadioButton();

        rbSelectRect = new Controls.CenteredToolbarRadioButton();

        rbForeground = new Controls.CenteredToolbarRadioButton();

        rbBackground = new Controls.CenteredToolbarRadioButton();

        rbPan = new Controls.CenteredToolbarRadioButton();

        chkShowMask = new Controls.CenteredToolbarCheckBox();

        chkShowResult = new Controls.CenteredToolbarCheckBox();

        lblResultSize = new Label();

        cboResultSize = new ComboBox();

        lblAlgorithm = new Label();

        cboAlgorithm = new ComboBox();

        lblHint = new Label();

        imageCanvas = new Controls.ImageCanvas();

        panelCanvasHost = new Controls.ImageCanvasHost();

        statusStrip = new StatusStrip();

        statusLabel = new ToolStripStatusLabel();

        modeStatusLabel = new ToolStripStatusLabel();

        zoomStatusLabel = new ToolStripStatusLabel();

        menuStrip.SuspendLayout();

        panelToolbar.SuspendLayout();

        panelCanvasHost.SuspendLayout();

        statusStrip.SuspendLayout();

        SuspendLayout();

        // 

        // menuStrip

        // 

        menuStrip.Items.AddRange(new ToolStripItem[] { mnuFile, mnuEdit, mnuAlgorithm, mnuView, mnuTools });

        menuStrip.Location = new Point(0, 0);

        menuStrip.Name = "menuStrip";

        menuStrip.Size = new Size(1184, 28);

        menuStrip.TabIndex = 3;

        menuStrip.Text = "menuStrip";

        // 

        // mnuFile

        // 

        mnuFile.DropDownItems.AddRange(new ToolStripItem[] { mnuOpen, mnuSave, toolStripSeparator1, mnuExit });

        mnuFile.Name = "mnuFile";

        mnuFile.Size = new Size(43, 20);

        mnuFile.Text = "파일";

        // 

        // mnuOpen

        // 

        mnuOpen.Name = "mnuOpen";

        mnuOpen.ShortcutKeys = Keys.Control | Keys.O;

        mnuOpen.Size = new Size(180, 22);

        mnuOpen.Text = "열기";

        mnuOpen.Click += btnOpen_Click;

        // 

        // mnuSave

        // 

        mnuSave.Name = "mnuSave";

        mnuSave.ShortcutKeys = Keys.Control | Keys.S;

        mnuSave.Size = new Size(180, 22);

        mnuSave.Text = "저장";

        mnuSave.Click += btnSave_Click;

        // 

        // mnuExit

        // 

        mnuExit.Name = "mnuExit";

        mnuExit.Size = new Size(180, 22);

        mnuExit.Text = "종료";

        mnuExit.Click += mnuExit_Click;

        // 

        // mnuEdit

        // 

        mnuEdit.DropDownItems.AddRange(new ToolStripItem[] { mnuPreview, mnuRemoveBackground, mnuReset });

        mnuEdit.Name = "mnuEdit";

        mnuEdit.Size = new Size(43, 20);

        mnuEdit.Text = "편집";

        // 

        // mnuPreview

        // 

        mnuPreview.Name = "mnuPreview";

        mnuPreview.Size = new Size(180, 22);

        mnuPreview.Text = "외곽선 미리보기";

        mnuPreview.Click += btnPreview_Click;

        // 

        // mnuRemoveBackground

        // 

        mnuRemoveBackground.Name = "mnuRemoveBackground";

        mnuRemoveBackground.Size = new Size(180, 22);

        mnuRemoveBackground.Text = "배경 제거";

        mnuRemoveBackground.Click += btnRemoveBackground_Click;

        // 

        // mnuReset

        // 

        mnuReset.Name = "mnuReset";

        mnuReset.Size = new Size(180, 22);

        mnuReset.Text = "초기화";

        mnuReset.Click += btnReset_Click;

        // 

        // mnuView

        // 

        mnuView.DropDownItems.AddRange(new ToolStripItem[] { mnuZoomIn, mnuZoomOut, mnuFit, toolStripSeparator2, mnuShowMask, mnuShowResult });

        mnuView.Name = "mnuView";

        mnuView.Size = new Size(43, 20);

        mnuView.Text = "보기";

        // 

        // mnuZoomIn

        // 

        mnuZoomIn.Name = "mnuZoomIn";

        mnuZoomIn.Size = new Size(180, 22);

        mnuZoomIn.Text = "확대";

        mnuZoomIn.Click += btnZoomIn_Click;

        // 

        // mnuZoomOut

        // 

        mnuZoomOut.Name = "mnuZoomOut";

        mnuZoomOut.Size = new Size(180, 22);

        mnuZoomOut.Text = "축소";

        mnuZoomOut.Click += btnZoomOut_Click;

        // 

        // mnuFit

        // 

        mnuFit.Name = "mnuFit";

        mnuFit.Size = new Size(180, 22);

        mnuFit.Text = "화면 맞춤";

        mnuFit.Click += btnFit_Click;

        // 

        // mnuShowMask

        // 

        mnuShowMask.Checked = true;

        mnuShowMask.CheckOnClick = true;

        mnuShowMask.Name = "mnuShowMask";

        mnuShowMask.Size = new Size(180, 22);

        mnuShowMask.Text = "마스크 미리보기";

        mnuShowMask.CheckedChanged += mnuShowMask_CheckedChanged;

        // 

        // mnuShowResult

        // 

        mnuShowResult.CheckOnClick = true;

        mnuShowResult.Name = "mnuShowResult";

        mnuShowResult.Size = new Size(180, 22);

        mnuShowResult.Text = "결과 보기";

        mnuShowResult.CheckedChanged += mnuShowResult_CheckedChanged;

        // 

        // mnuTools

        // 

        mnuTools.DropDownItems.AddRange(new ToolStripItem[] { mnuPan, mnuSelectFreehand, mnuSelectRect, mnuForeground, mnuBackground });

        mnuTools.Name = "mnuTools";

        mnuTools.Size = new Size(43, 20);

        mnuTools.Text = "도구";

        // 

        // mnuSelectFreehand

        // 

        mnuSelectFreehand.CheckOnClick = true;

        mnuSelectFreehand.Name = "mnuSelectFreehand";

        mnuSelectFreehand.Size = new Size(180, 22);

        mnuSelectFreehand.Text = "자유 선택";

        mnuSelectFreehand.Click += mnuSelectFreehand_Click;

        // 

        // mnuSelectRect

        // 

        mnuSelectRect.CheckOnClick = true;

        mnuSelectRect.Name = "mnuSelectRect";

        mnuSelectRect.Size = new Size(180, 22);

        mnuSelectRect.Text = "사각형 선택";

        mnuSelectRect.Click += mnuSelectRect_Click;

        // 

        // mnuForeground

        // 

        mnuForeground.CheckOnClick = true;

        mnuForeground.Name = "mnuForeground";

        mnuForeground.Size = new Size(180, 22);

        mnuForeground.Text = "전경 표시(브러시)";

        mnuForeground.Click += mnuForeground_Click;

        // 

        // mnuBackground

        // 

        mnuBackground.CheckOnClick = true;

        mnuBackground.Name = "mnuBackground";

        mnuBackground.Size = new Size(180, 22);

        mnuBackground.Text = "배경 표시(브러시)";

        mnuBackground.Click += mnuBackground_Click;

        // 

        // mnuPan

        // 

        mnuPan.CheckOnClick = true;

        mnuPan.Checked = true;

        mnuPan.Name = "mnuPan";

        mnuPan.Size = new Size(180, 22);

        mnuPan.Text = "끌기 (드래그)";

        mnuPan.Click += mnuPan_Click;

        // 

        // mnuAlgorithm

        // 

        mnuAlgorithm.DropDownItems.AddRange(new ToolStripItem[] { mnuAlgoRembg, mnuAlgoGrabCut, mnuAlgoColorKey, mnuAlgoEdgeFill, mnuAlgoThreshold });

        mnuAlgorithm.Name = "mnuAlgorithm";

        mnuAlgorithm.Size = new Size(55, 20);

        mnuAlgorithm.Text = "알고리즘";

        // 

        // mnuAlgoRembg

        // 

        mnuAlgoRembg.Checked = true;

        mnuAlgoRembg.CheckOnClick = true;

        mnuAlgoRembg.Name = "mnuAlgoRembg";

        mnuAlgoRembg.Size = new Size(220, 22);

        mnuAlgoRembg.Text = "rembg (AI, U2Net)";

        mnuAlgoRembg.Click += mnuAlgoRembg_Click;

        // 

        // mnuAlgoGrabCut

        // 

        mnuAlgoGrabCut.CheckOnClick = true;

        mnuAlgoGrabCut.Name = "mnuAlgoGrabCut";

        mnuAlgoGrabCut.Size = new Size(220, 22);

        mnuAlgoGrabCut.Text = "GrabCut (범용)";

        mnuAlgoGrabCut.Click += mnuAlgoGrabCut_Click;

        // 

        // mnuAlgoColorKey

        // 

        mnuAlgoColorKey.CheckOnClick = true;

        mnuAlgoColorKey.Name = "mnuAlgoColorKey";

        mnuAlgoColorKey.Size = new Size(220, 22);

        mnuAlgoColorKey.Text = "색상 키잉";

        mnuAlgoColorKey.Click += mnuAlgoColorKey_Click;

        // 

        // mnuAlgoEdgeFill

        // 

        mnuAlgoEdgeFill.CheckOnClick = true;

        mnuAlgoEdgeFill.Name = "mnuAlgoEdgeFill";

        mnuAlgoEdgeFill.Size = new Size(220, 22);

        mnuAlgoEdgeFill.Text = "윤곽선 채우기";

        mnuAlgoEdgeFill.Click += mnuAlgoEdgeFill_Click;

        // 

        // mnuAlgoThreshold

        // 

        mnuAlgoThreshold.CheckOnClick = true;

        mnuAlgoThreshold.Name = "mnuAlgoThreshold";

        mnuAlgoThreshold.Size = new Size(220, 22);

        mnuAlgoThreshold.Text = "임계값 (Otsu)";

        mnuAlgoThreshold.Click += mnuAlgoThreshold_Click;

        // 

        // imageListIcons

        // 

        imageListIcons.ColorDepth = ColorDepth.Depth32Bit;

        imageListIcons.ImageSize = new Size(18, 18);

        imageListIcons.TransparentColor = Color.Transparent;

        // 

        // panelToolbar

        // 

        panelToolbar.AutoScroll = true;

        panelToolbar.Controls.Add(btnOpen);

        panelToolbar.Controls.Add(btnPreview);

        panelToolbar.Controls.Add(btnRemoveBackground);

        panelToolbar.Controls.Add(btnSave);

        panelToolbar.Controls.Add(btnReset);

        panelToolbar.Controls.Add(btnZoomOut);

        panelToolbar.Controls.Add(btnZoomIn);

        panelToolbar.Controls.Add(btnFit);

        panelToolbar.Controls.Add(btnInfo);

        panelToolbar.Controls.Add(rbSelectFreehand);

        panelToolbar.Controls.Add(rbSelectRect);

        panelToolbar.Controls.Add(rbForeground);

        panelToolbar.Controls.Add(rbBackground);

        panelToolbar.Controls.Add(rbPan);

        panelToolbar.Controls.Add(chkShowMask);

        panelToolbar.Controls.Add(chkShowResult);

        panelToolbar.Controls.Add(lblResultSize);

        panelToolbar.Controls.Add(cboResultSize);

        panelToolbar.Controls.Add(lblAlgorithm);

        panelToolbar.Controls.Add(cboAlgorithm);

        panelToolbar.Controls.Add(lblHint);

        panelToolbar.Dock = DockStyle.Top;

        panelToolbar.Location = new Point(0, 24);

        panelToolbar.Name = "panelToolbar";

        panelToolbar.Padding = new Padding(10, 8, 10, 8);

        panelToolbar.Size = new Size(1184, 124);

        panelToolbar.TabIndex = 0;

        // 

        // btnOpen

        // 

        btnOpen.Location = new Point(8, 8);

        btnOpen.Name = "btnOpen";

        btnOpen.Size = new Size(100, 28);

        btnOpen.TabIndex = 0;

        btnOpen.Text = "열기";

        btnOpen.UseVisualStyleBackColor = true;

        btnOpen.Click += btnOpen_Click;

        // 

        // btnPreview

        // 

        btnPreview.Location = new Point(116, 8);

        btnPreview.Name = "btnPreview";

        btnPreview.Size = new Size(144, 28);

        btnPreview.TabIndex = 1;

        btnPreview.Text = "외곽선 미리보기";

        btnPreview.UseVisualStyleBackColor = true;

        btnPreview.Click += btnPreview_Click;

        // 

        // btnRemoveBackground

        // 

        btnRemoveBackground.Location = new Point(268, 8);

        btnRemoveBackground.Name = "btnRemoveBackground";

        btnRemoveBackground.Size = new Size(118, 28);

        btnRemoveBackground.TabIndex = 2;

        btnRemoveBackground.Text = "배경 제거";

        btnRemoveBackground.UseVisualStyleBackColor = true;

        btnRemoveBackground.Click += btnRemoveBackground_Click;

        // 

        // btnSave

        // 

        btnSave.Location = new Point(394, 8);

        btnSave.Name = "btnSave";

        btnSave.Size = new Size(108, 28);

        btnSave.TabIndex = 3;

        btnSave.Text = "저장";

        btnSave.UseVisualStyleBackColor = true;

        btnSave.Click += btnSave_Click;

        // 

        // btnReset

        // 

        btnReset.Location = new Point(510, 8);

        btnReset.Name = "btnReset";

        btnReset.Size = new Size(100, 28);

        btnReset.TabIndex = 4;

        btnReset.Text = "초기화";

        btnReset.UseVisualStyleBackColor = true;

        btnReset.Click += btnReset_Click;

        // 

        // btnZoomOut

        // 

        btnZoomOut.Location = new Point(618, 8);

        btnZoomOut.Name = "btnZoomOut";

        btnZoomOut.Size = new Size(80, 28);

        btnZoomOut.TabIndex = 5;

        btnZoomOut.Text = "축소";

        btnZoomOut.UseVisualStyleBackColor = true;

        btnZoomOut.Click += btnZoomOut_Click;

        // 

        // btnZoomIn

        // 

        btnZoomIn.Location = new Point(706, 8);

        btnZoomIn.Name = "btnZoomIn";

        btnZoomIn.Size = new Size(80, 28);

        btnZoomIn.TabIndex = 6;

        btnZoomIn.Text = "확대";

        btnZoomIn.UseVisualStyleBackColor = true;

        btnZoomIn.Click += btnZoomIn_Click;

        // 

        // btnFit

        // 

        btnFit.Location = new Point(794, 8);

        btnFit.Name = "btnFit";

        btnFit.Size = new Size(92, 28);

        btnFit.TabIndex = 7;

        btnFit.Text = "맞춤";

        btnFit.UseVisualStyleBackColor = true;

        btnFit.Click += btnFit_Click;

        // 

        // btnInfo

        // 

        btnInfo.Location = new Point(1090, 76);

        btnInfo.Name = "btnInfo";

        btnInfo.Size = new Size(80, 28);

        btnInfo.TabIndex = 20;

        btnInfo.Text = "Info";

        btnInfo.UseVisualStyleBackColor = true;

        btnInfo.Click += btnInfo_Click;

        // 

        // rbSelectFreehand

        // 

        rbSelectFreehand.AutoSize = false;

        rbSelectFreehand.Location = new Point(8, 44);

        rbSelectFreehand.Name = "rbSelectFreehand";

        rbSelectFreehand.Size = new Size(70, 19);

        rbSelectFreehand.TabIndex = 8;

        rbSelectFreehand.TabStop = true;

        rbSelectFreehand.Text = "자유 선택";

        rbSelectFreehand.UseVisualStyleBackColor = true;

        rbSelectFreehand.CheckedChanged += rbSelectFreehand_CheckedChanged;

        // 

        // rbSelectRect

        // 

        rbSelectRect.AutoSize = false;

        rbSelectRect.Location = new Point(108, 44);

        rbSelectRect.Name = "rbSelectRect";

        rbSelectRect.Size = new Size(58, 19);

        rbSelectRect.TabIndex = 17;

        rbSelectRect.TabStop = true;

        rbSelectRect.Text = "사각형";

        rbSelectRect.UseVisualStyleBackColor = true;

        rbSelectRect.CheckedChanged += rbSelectRect_CheckedChanged;

        // 

        // rbForeground

        // 

        rbForeground.AutoSize = false;

        rbForeground.Location = new Point(190, 44);

        rbForeground.Name = "rbForeground";

        rbForeground.Size = new Size(97, 19);

        rbForeground.TabIndex = 9;

        rbForeground.Text = "전경 표시(브러시)";

        rbForeground.UseVisualStyleBackColor = true;

        rbForeground.CheckedChanged += rbForeground_CheckedChanged;

        // 

        // rbBackground

        // 

        rbBackground.AutoSize = false;

        rbBackground.Location = new Point(350, 44);

        rbBackground.Name = "rbBackground";

        rbBackground.Size = new Size(97, 19);

        rbBackground.TabIndex = 10;

        rbBackground.Text = "배경 표시(브러시)";

        rbBackground.UseVisualStyleBackColor = true;

        rbBackground.CheckedChanged += rbBackground_CheckedChanged;

        // 

        // rbPan

        // 

        rbPan.AutoSize = false;

        rbPan.Checked = true;

        rbPan.Location = new Point(510, 44);

        rbPan.Name = "rbPan";

        rbPan.Size = new Size(73, 19);

        rbPan.TabIndex = 11;

        rbPan.Text = "끌기";

        rbPan.UseVisualStyleBackColor = true;

        rbPan.CheckedChanged += rbPan_CheckedChanged;

        // 

        // chkShowMask

        // 

        chkShowMask.AutoSize = false;

        chkShowMask.Checked = true;

        chkShowMask.CheckState = CheckState.Checked;

        chkShowMask.Location = new Point(8, 76);

        chkShowMask.Name = "chkShowMask";

        chkShowMask.Size = new Size(102, 19);

        chkShowMask.TabIndex = 12;

        chkShowMask.Text = "마스크 미리보기";

        chkShowMask.UseVisualStyleBackColor = true;

        chkShowMask.CheckedChanged += chkShowMask_CheckedChanged;

        // 

        // chkShowResult

        // 

        chkShowResult.AutoSize = false;

        chkShowResult.Location = new Point(150, 76);

        chkShowResult.Name = "chkShowResult";

        chkShowResult.Size = new Size(74, 19);

        chkShowResult.TabIndex = 13;

        chkShowResult.Text = "결과 보기";

        chkShowResult.UseVisualStyleBackColor = true;

        chkShowResult.CheckedChanged += chkShowResult_CheckedChanged;

        // 

        // lblResultSize

        // 

        lblResultSize.AutoSize = false;

        lblResultSize.Location = new Point(304, 80);

        lblResultSize.Name = "lblResultSize";

        lblResultSize.Size = new Size(58, 15);

        lblResultSize.TabIndex = 18;

        lblResultSize.Text = "결과 크기:";

        // 

        // cboResultSize

        // 

        cboResultSize.DropDownStyle = ComboBoxStyle.DropDownList;

        cboResultSize.Location = new Point(378, 76);

        cboResultSize.Name = "cboResultSize";

        cboResultSize.Size = new Size(118, 23);

        cboResultSize.TabIndex = 19;

        cboResultSize.SelectedIndexChanged += cboResultSize_SelectedIndexChanged;

        // 

        // lblAlgorithm

        // 

        lblAlgorithm.AutoSize = false;

        lblAlgorithm.Location = new Point(280, 80);

        lblAlgorithm.Name = "lblAlgorithm";

        lblAlgorithm.Size = new Size(58, 15);

        lblAlgorithm.TabIndex = 15;

        lblAlgorithm.Text = "알고리즘:";

        // 

        // cboAlgorithm

        // 

        cboAlgorithm.DropDownStyle = ComboBoxStyle.DropDownList;

        cboAlgorithm.Location = new Point(354, 76);

        cboAlgorithm.Name = "cboAlgorithm";

        cboAlgorithm.Size = new Size(210, 23);

        cboAlgorithm.TabIndex = 16;

        cboAlgorithm.SelectedIndexChanged += cboAlgorithm_SelectedIndexChanged;

        // 

        // lblHint

        // 

        lblHint.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;

        lblHint.AutoEllipsis = true;

        lblHint.AutoSize = false;

        lblHint.ForeColor = SystemColors.GrayText;

        lblHint.Location = new Point(574, 78);

        lblHint.Name = "lblHint";

        lblHint.Size = new Size(602, 18);

        lblHint.TabIndex = 14;

        lblHint.Text = "끌기 → 자유/사각형 선택 → 미리보기 → 배경 제거";

        // 

        // panelCanvasHost

        // 

        panelCanvasHost.Controls.Add(imageCanvas);

        panelCanvasHost.Dock = DockStyle.Fill;

        panelCanvasHost.Location = new Point(0, 96);

        panelCanvasHost.Name = "panelCanvasHost";

        panelCanvasHost.Size = new Size(1184, 583);

        panelCanvasHost.TabIndex = 1;

        // 

        // imageCanvas

        // 

        imageCanvas.Location = new Point(0, 0);

        imageCanvas.Name = "imageCanvas";

        imageCanvas.Size = new Size(400, 300);

        imageCanvas.TabIndex = 0;

        imageCanvas.TabStop = true;

        imageCanvas.ImageChanged += imageCanvas_ImageChanged;

        imageCanvas.SelectionChanged += imageCanvas_SelectionChanged;

        imageCanvas.MarkersChanged += imageCanvas_MarkersChanged;

        imageCanvas.ViewChanged += imageCanvas_ViewChanged;

        // 

        // statusStrip

        // 

        statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel, modeStatusLabel, zoomStatusLabel });

        statusStrip.Location = new Point(0, 711);

        statusStrip.Name = "statusStrip";

        statusStrip.Size = new Size(1184, 22);

        statusStrip.TabIndex = 2;

        statusStrip.Text = "statusStrip";

        // 

        // statusLabel

        // 

        statusLabel.Name = "statusLabel";

        statusLabel.Size = new Size(39, 17);

        statusLabel.Spring = true;

        statusLabel.Text = "Ready";

        // 

        // modeStatusLabel

        // 

        modeStatusLabel.BorderSides = ToolStripStatusLabelBorderSides.Left;

        modeStatusLabel.BorderStyle = Border3DStyle.Etched;

        modeStatusLabel.Margin = new Padding(8, 3, 0, 2);

        modeStatusLabel.Name = "modeStatusLabel";

        modeStatusLabel.Size = new Size(84, 17);

        modeStatusLabel.Text = "모드: 끌기";

        modeStatusLabel.TextAlign = ContentAlignment.MiddleRight;

        // 

        // zoomStatusLabel

        // 

        zoomStatusLabel.BorderSides = ToolStripStatusLabelBorderSides.Left;

        zoomStatusLabel.BorderStyle = Border3DStyle.Etched;

        zoomStatusLabel.Margin = new Padding(8, 3, 0, 2);

        zoomStatusLabel.Name = "zoomStatusLabel";

        zoomStatusLabel.Size = new Size(84, 17);

        zoomStatusLabel.Text = "배율: 100%";

        zoomStatusLabel.TextAlign = ContentAlignment.MiddleRight;

        // 

        // ImageRembgForm

        // 

        AllowDrop = true;

        AutoScaleDimensions = new SizeF(7F, 15F);

        AutoScaleMode = AutoScaleMode.Font;

        ClientSize = new Size(1184, 733);

        Controls.Add(panelCanvasHost);

        Controls.Add(statusStrip);

        Controls.Add(panelToolbar);

        Controls.Add(menuStrip);

        MainMenuStrip = menuStrip;

        Name = "ImageRembgForm";

        StartPosition = FormStartPosition.CenterScreen;

        Text = "Image Rembg - 배경 제거";

        Load += ImageRembgForm_Load;

        DragDrop += ImageRembgForm_DragDrop;

        DragEnter += ImageRembgForm_DragEnter;

        menuStrip.ResumeLayout(false);

        menuStrip.PerformLayout();

        panelToolbar.ResumeLayout(false);

        panelToolbar.PerformLayout();

        panelCanvasHost.ResumeLayout(false);

        statusStrip.ResumeLayout(false);

        statusStrip.PerformLayout();

        ResumeLayout(false);

        PerformLayout();

    }



    #endregion



    private MenuStrip menuStrip;

    private ToolStripMenuItem mnuFile;

    private ToolStripMenuItem mnuOpen;

    private ToolStripMenuItem mnuSave;

    private ToolStripSeparator toolStripSeparator1;

    private ToolStripMenuItem mnuExit;

    private ToolStripMenuItem mnuEdit;

    private ToolStripMenuItem mnuPreview;

    private ToolStripMenuItem mnuRemoveBackground;

    private ToolStripMenuItem mnuReset;

    private ToolStripMenuItem mnuView;

    private ToolStripMenuItem mnuZoomIn;

    private ToolStripMenuItem mnuZoomOut;

    private ToolStripMenuItem mnuFit;

    private ToolStripSeparator toolStripSeparator2;

    private ToolStripMenuItem mnuShowMask;

    private ToolStripMenuItem mnuShowResult;

    private ToolStripMenuItem mnuTools;

    private ToolStripMenuItem mnuSelectFreehand;

    private ToolStripMenuItem mnuSelectRect;

    private ToolStripMenuItem mnuForeground;

    private ToolStripMenuItem mnuBackground;

    private ToolStripMenuItem mnuPan;

    private ToolStripMenuItem mnuAlgorithm;

    private ToolStripMenuItem mnuAlgoRembg;

    private ToolStripMenuItem mnuAlgoGrabCut;

    private ToolStripMenuItem mnuAlgoColorKey;

    private ToolStripMenuItem mnuAlgoEdgeFill;

    private ToolStripMenuItem mnuAlgoThreshold;

    private ImageList imageListIcons;

    private Panel panelToolbar;

    private Controls.CenteredToolbarButton btnOpen;

    private Controls.CenteredToolbarButton btnPreview;

    private Controls.CenteredToolbarButton btnRemoveBackground;

    private Controls.CenteredToolbarButton btnSave;

    private Controls.CenteredToolbarButton btnReset;

    private Controls.CenteredToolbarButton btnZoomOut;

    private Controls.CenteredToolbarButton btnZoomIn;

    private Controls.CenteredToolbarButton btnFit;

    private Controls.CenteredToolbarButton btnInfo;

    private Controls.CenteredToolbarRadioButton rbSelectFreehand;

    private Controls.CenteredToolbarRadioButton rbSelectRect;

    private Controls.CenteredToolbarRadioButton rbForeground;

    private Controls.CenteredToolbarRadioButton rbBackground;

    private Controls.CenteredToolbarRadioButton rbPan;

    private Controls.CenteredToolbarCheckBox chkShowMask;

    private Controls.CenteredToolbarCheckBox chkShowResult;

    private Label lblResultSize;

    private ComboBox cboResultSize;

    private Label lblAlgorithm;

    private ComboBox cboAlgorithm;

    private Label lblHint;

    private Controls.ImageCanvas imageCanvas;

    private Controls.ImageCanvasHost panelCanvasHost;

    private StatusStrip statusStrip;

    private ToolStripStatusLabel statusLabel;

    private ToolStripStatusLabel modeStatusLabel;

    private ToolStripStatusLabel zoomStatusLabel;

}


