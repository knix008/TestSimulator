namespace Image2TextWin;

partial class Image2TextForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(Image2TextForm));
        menuStrip = new MenuStrip();
        menuFile = new ToolStripMenuItem();
        menuFileOpenImage = new ToolStripMenuItem();
        menuFileOpenText = new ToolStripMenuItem();
        menuFileSep1 = new ToolStripSeparator();
        menuFileSaveText = new ToolStripMenuItem();
        menuFileSep2 = new ToolStripSeparator();
        menuFileExport = new ToolStripMenuItem();
        menuFileExportHtml = new ToolStripMenuItem();
        menuFileExportPdf = new ToolStripMenuItem();
        menuFileExportWord = new ToolStripMenuItem();
        menuFileExportImage = new ToolStripMenuItem();
        menuFilePresetSep = new ToolStripSeparator();
        menuFileLoadPreset = new ToolStripMenuItem();
        menuFileSavePreset = new ToolStripMenuItem();
        menuFileSep3 = new ToolStripSeparator();
        menuFileExit = new ToolStripMenuItem();
        menuEdit = new ToolStripMenuItem();
        menuEditCopy = new ToolStripMenuItem();
        menuEditSelectAll = new ToolStripMenuItem();
        menuEditSep1 = new ToolStripSeparator();
        menuEditToggleEdit = new ToolStripMenuItem();
        menuConvert = new ToolStripMenuItem();
        menuConvertRun = new ToolStripMenuItem();
        menuConvertRedraw = new ToolStripMenuItem();
        menuConvertSep1 = new ToolStripSeparator();
        menuConvertRedrawWith = new ToolStripMenuItem();
        menuConvertRedrawDetailed = new ToolStripMenuItem();
        menuConvertRedrawStandard = new ToolStripMenuItem();
        menuConvertRedrawSimple = new ToolStripMenuItem();
        menuConvertRedrawBlock = new ToolStripMenuItem();
        menuConvertRedrawCustom = new ToolStripMenuItem();
        menuView = new ToolStripMenuItem();
        menuViewZoomIn = new ToolStripMenuItem();
        menuViewZoomOut = new ToolStripMenuItem();
        menuViewZoomReset = new ToolStripMenuItem();
        toolStrip = new ToolStrip();
        btnOpenImage = new ToolStripButton();
        btnOpenText = new ToolStripButton();
        btnSaveText = new ToolStripButton();
        toolStripSep1 = new ToolStripSeparator();
        btnCopy = new ToolStripButton();
        toolStripSep2 = new ToolStripSeparator();
        btnConvertToolbar = new ToolStripButton();
        btnRedraw = new ToolStripButton();
        toolStripSep3 = new ToolStripSeparator();
        btnToggleEdit = new ToolStripButton();
        toolStripSep4 = new ToolStripSeparator();
        btnResetToolbar = new ToolStripButton();
        splitContainerMain = new SplitContainer();
        panelLeft = new Panel();
        pictureBoxOriginal = new PictureBox();
        lblOriginal = new Label();
        panelRight = new Panel();
        pnlOutputCanvas = new Panel();
        richTextBoxOutput = new RichTextBox();
        panelOutputToolbar = new Panel();
        lblZoom = new Label();
        btnZoomReset = new Button();
        btnZoomOut = new Button();
        btnZoomIn = new Button();
        lblOutput = new Label();
        panelSettings = new Panel();
        btnConvertMain = new Button();
        grpOptions = new GroupBox();
        chkInvert = new CheckBox();
        chkEdgeDetect = new CheckBox();
        lblContrast = new Label();
        trkContrast = new TrackBar();
        numContrastValue = new NumericUpDown();
        pnlContrastScale = new Panel();
        lblBrightness = new Label();
        trkBrightness = new TrackBar();
        numBrightnessValue = new NumericUpDown();
        pnlBrightnessScale = new Panel();
        btnResetSettings = new Button();
        grpFont = new GroupBox();
        lblFontName = new Label();
        cmbFontName = new ComboBox();
        lblFontSize = new Label();
        numFontSize = new NumericUpDown();
        chkColorOutput = new CheckBox();
        grpSize = new GroupBox();
        lblWidth = new Label();
        numWidth = new NumericUpDown();
        lblHeight = new Label();
        numHeight = new NumericUpDown();
        chkAutoHeight = new CheckBox();
        lblAspect = new Label();
        numAspectRatio = new NumericUpDown();
        chkKeepAspectRatio = new CheckBox();
        chkAutoWidth = new CheckBox();
        lblOutputScale = new Label();
        numOutputScale = new NumericUpDown();
        grpCharSet = new GroupBox();
        rbCharDetailed = new RadioButton();
        rbCharStandard = new RadioButton();
        rbCharSimple = new RadioButton();
        rbCharBlock = new RadioButton();
        rbCharCustom = new RadioButton();
        txtCustomChars = new TextBox();
        statusStrip = new StatusStrip();
        statusLabel = new ToolStripStatusLabel();
        statusProgressBar = new ToolStripProgressBar();
        statusImageInfo = new ToolStripStatusLabel();
        statusOutputInfo = new ToolStripStatusLabel();
        statusEditMode = new ToolStripStatusLabel();
        statusFilePath = new ToolStripStatusLabel();
        toolTip = new ToolTip(components);
        openImageDialog = new OpenFileDialog();
        openTextDialog = new OpenFileDialog();
        openPresetDialog = new OpenFileDialog();
        saveTextDialog = new SaveFileDialog();
        saveImageDialog = new SaveFileDialog();
        savePresetDialog = new SaveFileDialog();
        menuStrip.SuspendLayout();
        toolStrip.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).BeginInit();
        splitContainerMain.Panel1.SuspendLayout();
        splitContainerMain.Panel2.SuspendLayout();
        splitContainerMain.SuspendLayout();
        panelLeft.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)pictureBoxOriginal).BeginInit();
        panelRight.SuspendLayout();
        pnlOutputCanvas.SuspendLayout();
        panelOutputToolbar.SuspendLayout();
        panelSettings.SuspendLayout();
        grpOptions.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)trkContrast).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numContrastValue).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trkBrightness).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numBrightnessValue).BeginInit();
        grpFont.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)numFontSize).BeginInit();
        grpSize.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)numWidth).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numHeight).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numAspectRatio).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numOutputScale).BeginInit();
        grpCharSet.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // menuStrip
        // 
        menuStrip.Items.AddRange(new ToolStripItem[] { menuFile, menuEdit, menuConvert, menuView });
        menuStrip.Location = new Point(0, 0);
        menuStrip.Name = "menuStrip";
        menuStrip.Size = new Size(1300, 24);
        menuStrip.TabIndex = 0;
        // 
        // menuFile
        // 
        menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuFileOpenImage, menuFileOpenText, menuFileSep1, menuFileSaveText, menuFileSep2, menuFileExport, menuFilePresetSep, menuFileLoadPreset, menuFileSavePreset, menuFileSep3, menuFileExit });
        menuFile.Name = "menuFile";
        menuFile.Size = new Size(57, 20);
        menuFile.Text = "파일(&F)";
        // 
        // menuFileOpenImage
        // 
        menuFileOpenImage.Name = "menuFileOpenImage";
        menuFileOpenImage.ShortcutKeys = Keys.Control | Keys.O;
        menuFileOpenImage.Size = new Size(265, 22);
        menuFileOpenImage.Text = "이미지 열기(&O)...";
        menuFileOpenImage.ToolTipText = "BMP, JPG, PNG, GIF 등 이미지 파일을 엽니다";
        menuFileOpenImage.Click += menuFileOpenImage_Click;
        // 
        // menuFileOpenText
        // 
        menuFileOpenText.Name = "menuFileOpenText";
        menuFileOpenText.ShortcutKeys = Keys.Control | Keys.Shift | Keys.O;
        menuFileOpenText.Size = new Size(265, 22);
        menuFileOpenText.Text = "텍스트 파일 열기(&T)...";
        menuFileOpenText.ToolTipText = "기존 ASCII 텍스트 파일을 불러와 편집합니다";
        menuFileOpenText.Click += menuFileOpenText_Click;
        // 
        // menuFileSep1
        // 
        menuFileSep1.Name = "menuFileSep1";
        menuFileSep1.Size = new Size(262, 6);
        // 
        // menuFileSaveText
        // 
        menuFileSaveText.Name = "menuFileSaveText";
        menuFileSaveText.ShortcutKeys = Keys.Control | Keys.S;
        menuFileSaveText.Size = new Size(265, 22);
        menuFileSaveText.Text = "텍스트로 저장(&S)...";
        menuFileSaveText.ToolTipText = "ASCII 아트를 텍스트 파일로 저장합니다";
        menuFileSaveText.Click += menuFileSaveText_Click;
        // 
        // menuFileSep2
        // 
        menuFileSep2.Name = "menuFileSep2";
        menuFileSep2.Size = new Size(262, 6);
        // 
        // menuFileExport
        // 
        menuFileExport.DropDownItems.AddRange(new ToolStripItem[] { menuFileExportHtml, menuFileExportPdf, menuFileExportWord, menuFileExportImage });
        menuFileExport.Name = "menuFileExport";
        menuFileExport.Size = new Size(265, 22);
        menuFileExport.Text = "내보내기(&E)";
        menuFileExport.ToolTipText = "HTML, PDF, Word, 이미지 형식으로 내보냅니다";
        // 
        // menuFileExportHtml
        // 
        menuFileExportHtml.Name = "menuFileExportHtml";
        menuFileExportHtml.Size = new Size(196, 22);
        menuFileExportHtml.Text = "HTML로 내보내기(&H)...";
        menuFileExportHtml.ToolTipText = "웹 브라우저에서 볼 수 있는 HTML 파일로 내보냅니다 (컬러 지원)";
        menuFileExportHtml.Click += menuFileExportHtml_Click;
        // 
        // menuFileExportPdf
        // 
        menuFileExportPdf.Name = "menuFileExportPdf";
        menuFileExportPdf.Size = new Size(196, 22);
        menuFileExportPdf.Text = "PDF로 내보내기(&P)...";
        menuFileExportPdf.ToolTipText = "공유 및 인쇄용 PDF 파일로 내보냅니다";
        menuFileExportPdf.Click += menuFileExportPdf_Click;
        // 
        // menuFileExportWord
        // 
        menuFileExportWord.Name = "menuFileExportWord";
        menuFileExportWord.Size = new Size(196, 22);
        menuFileExportWord.Text = "Word로 내보내기(&W)...";
        menuFileExportWord.ToolTipText = "Microsoft Word에서 편집 가능한 .docx 파일로 내보냅니다";
        menuFileExportWord.Click += menuFileExportWord_Click;
        // 
        // menuFileExportImage
        // 
        menuFileExportImage.Name = "menuFileExportImage";
        menuFileExportImage.Size = new Size(196, 22);
        menuFileExportImage.Text = "이미지로 내보내기(&I)...";
        menuFileExportImage.ToolTipText = "ASCII 아트를 PNG/BMP/JPEG 이미지로 렌더링하여 저장합니다";
        menuFileExportImage.Click += menuFileExportImage_Click;
        // 
        // menuFilePresetSep
        // 
        menuFilePresetSep.Name = "menuFilePresetSep";
        menuFilePresetSep.Size = new Size(262, 6);
        // 
        // menuFileLoadPreset
        // 
        menuFileLoadPreset.Name = "menuFileLoadPreset";
        menuFileLoadPreset.ShortcutKeys = Keys.Control | Keys.Shift | Keys.L;
        menuFileLoadPreset.Size = new Size(265, 22);
        menuFileLoadPreset.Text = "설정 불러오기(&L)...";
        menuFileLoadPreset.ToolTipText = "저장된 .I2t 프리셋 파일에서 변환 설정을 불러옵니다";
        menuFileLoadPreset.Click += menuFileLoadPreset_Click;
        // 
        // menuFileSavePreset
        // 
        menuFileSavePreset.Name = "menuFileSavePreset";
        menuFileSavePreset.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        menuFileSavePreset.Size = new Size(265, 22);
        menuFileSavePreset.Text = "설정 저장(&P)...";
        menuFileSavePreset.ToolTipText = "현재 변환 설정을 .I2t 프리셋 파일로 저장합니다";
        menuFileSavePreset.Click += menuFileSavePreset_Click;
        // 
        // menuFileSep3
        // 
        menuFileSep3.Name = "menuFileSep3";
        menuFileSep3.Size = new Size(262, 6);
        // 
        // menuFileExit
        // 
        menuFileExit.Name = "menuFileExit";
        menuFileExit.Size = new Size(265, 22);
        menuFileExit.Text = "종료(&X)";
        menuFileExit.ToolTipText = "프로그램을 종료합니다";
        menuFileExit.Click += menuFileExit_Click;
        // 
        // menuEdit
        // 
        menuEdit.DropDownItems.AddRange(new ToolStripItem[] { menuEditCopy, menuEditSelectAll, menuEditSep1, menuEditToggleEdit });
        menuEdit.Name = "menuEdit";
        menuEdit.Size = new Size(57, 20);
        menuEdit.Text = "편집(&E)";
        // 
        // menuEditCopy
        // 
        menuEditCopy.Name = "menuEditCopy";
        menuEditCopy.ShortcutKeys = Keys.Control | Keys.C;
        menuEditCopy.Size = new Size(222, 22);
        menuEditCopy.Text = "복사(&C)";
        menuEditCopy.ToolTipText = "선택된 텍스트를 복사합니다 (선택 없으면 전체 복사)";
        menuEditCopy.Click += menuEditCopy_Click;
        // 
        // menuEditSelectAll
        // 
        menuEditSelectAll.Name = "menuEditSelectAll";
        menuEditSelectAll.ShortcutKeys = Keys.Control | Keys.A;
        menuEditSelectAll.Size = new Size(222, 22);
        menuEditSelectAll.Text = "모두 선택(&A)";
        menuEditSelectAll.ToolTipText = "출력 텍스트 전체를 선택합니다";
        menuEditSelectAll.Click += menuEditSelectAll_Click;
        // 
        // menuEditSep1
        // 
        menuEditSep1.Name = "menuEditSep1";
        menuEditSep1.Size = new Size(219, 6);
        // 
        // menuEditToggleEdit
        // 
        menuEditToggleEdit.Name = "menuEditToggleEdit";
        menuEditToggleEdit.ShortcutKeys = Keys.F2;
        menuEditToggleEdit.Size = new Size(222, 22);
        menuEditToggleEdit.Text = "편집 모드 켜기/끄기(&M)";
        menuEditToggleEdit.ToolTipText = "출력 텍스트를 직접 편집할 수 있는 모드로 전환합니다 (F2)";
        menuEditToggleEdit.Click += menuEditToggleEdit_Click;
        // 
        // menuConvert
        // 
        menuConvert.DropDownItems.AddRange(new ToolStripItem[] { menuConvertRun, menuConvertRedraw, menuConvertSep1, menuConvertRedrawWith });
        menuConvert.Name = "menuConvert";
        menuConvert.Size = new Size(59, 20);
        menuConvert.Text = "변환(&C)";
        // 
        // menuConvertRun
        // 
        menuConvertRun.Name = "menuConvertRun";
        menuConvertRun.ShortcutKeys = Keys.F5;
        menuConvertRun.Size = new Size(271, 22);
        menuConvertRun.Text = "변환 실행(&R)";
        menuConvertRun.ToolTipText = "현재 설정으로 이미지를 ASCII 아트로 변환합니다 (F5)";
        menuConvertRun.Click += btnConvertMain_Click;
        // 
        // menuConvertRedraw
        // 
        menuConvertRedraw.Name = "menuConvertRedraw";
        menuConvertRedraw.ShortcutKeys = Keys.F6;
        menuConvertRedraw.Size = new Size(271, 22);
        menuConvertRedraw.Text = "다시 그리기(&D)  [다음 문자 집합]";
        menuConvertRedraw.ToolTipText = "다른 문자 집합으로 자동 전환하여 다시 변환합니다 (F6)";
        menuConvertRedraw.Click += btnRedraw_Click;
        // 
        // menuConvertSep1
        // 
        menuConvertSep1.Name = "menuConvertSep1";
        menuConvertSep1.Size = new Size(268, 6);
        // 
        // menuConvertRedrawWith
        // 
        menuConvertRedrawWith.DropDownItems.AddRange(new ToolStripItem[] { menuConvertRedrawDetailed, menuConvertRedrawStandard, menuConvertRedrawSimple, menuConvertRedrawBlock, menuConvertRedrawCustom });
        menuConvertRedrawWith.Name = "menuConvertRedrawWith";
        menuConvertRedrawWith.Size = new Size(271, 22);
        menuConvertRedrawWith.Text = "문자 집합 선택하여 다시 그리기(&W)";
        menuConvertRedrawWith.ToolTipText = "원하는 문자 집합을 선택하여 다시 변환합니다";
        // 
        // menuConvertRedrawDetailed
        // 
        menuConvertRedrawDetailed.Name = "menuConvertRedrawDetailed";
        menuConvertRedrawDetailed.Size = new Size(220, 22);
        menuConvertRedrawDetailed.Text = "상세 (70단계)  @#$%...";
        menuConvertRedrawDetailed.ToolTipText = "70가지 문자를 사용하는 가장 세밀한 표현";
        menuConvertRedrawDetailed.Click += menuConvertRedrawWith_Click;
        // 
        // menuConvertRedrawStandard
        // 
        menuConvertRedrawStandard.Name = "menuConvertRedrawStandard";
        menuConvertRedrawStandard.Size = new Size(220, 22);
        menuConvertRedrawStandard.Text = "표준 (10단계)  @#S%?*+;:.";
        menuConvertRedrawStandard.ToolTipText = "10가지 문자로 표현하는 표준 모드";
        menuConvertRedrawStandard.Click += menuConvertRedrawWith_Click;
        // 
        // menuConvertRedrawSimple
        // 
        menuConvertRedrawSimple.Name = "menuConvertRedrawSimple";
        menuConvertRedrawSimple.Size = new Size(220, 22);
        menuConvertRedrawSimple.Text = "단순 (5단계)  @#*. ";
        menuConvertRedrawSimple.ToolTipText = "5가지 문자로 표현하는 단순 모드";
        menuConvertRedrawSimple.Click += menuConvertRedrawWith_Click;
        // 
        // menuConvertRedrawBlock
        // 
        menuConvertRedrawBlock.Name = "menuConvertRedrawBlock";
        menuConvertRedrawBlock.Size = new Size(220, 22);
        menuConvertRedrawBlock.Text = "블록 문자  █▓▒░ ";
        menuConvertRedrawBlock.ToolTipText = "유니코드 블록 문자를 사용하는 모드";
        menuConvertRedrawBlock.Click += menuConvertRedrawWith_Click;
        // 
        // menuConvertRedrawCustom
        // 
        menuConvertRedrawCustom.Name = "menuConvertRedrawCustom";
        menuConvertRedrawCustom.Size = new Size(220, 22);
        menuConvertRedrawCustom.Text = "사용자 정의 문자";
        menuConvertRedrawCustom.ToolTipText = "하단 설정 패널에서 입력한 사용자 정의 문자로 변환합니다";
        menuConvertRedrawCustom.Click += menuConvertRedrawWith_Click;
        // 
        // menuView
        // 
        menuView.DropDownItems.AddRange(new ToolStripItem[] { menuViewZoomIn, menuViewZoomOut, menuViewZoomReset });
        menuView.Name = "menuView";
        menuView.Size = new Size(59, 20);
        menuView.Text = "보기(&V)";
        // 
        // menuViewZoomIn
        // 
        menuViewZoomIn.Name = "menuViewZoomIn";
        menuViewZoomIn.ShortcutKeys = Keys.Control | Keys.Oemplus;
        menuViewZoomIn.Size = new Size(232, 22);
        menuViewZoomIn.Text = "글자 크게(&+)";
        menuViewZoomIn.ToolTipText = "출력 텍스트 글자 크기를 키웁니다 (Ctrl++)";
        menuViewZoomIn.Click += btnZoomIn_Click;
        // 
        // menuViewZoomOut
        // 
        menuViewZoomOut.Name = "menuViewZoomOut";
        menuViewZoomOut.ShortcutKeys = Keys.Control | Keys.OemMinus;
        menuViewZoomOut.Size = new Size(232, 22);
        menuViewZoomOut.Text = "글자 작게(&-)";
        menuViewZoomOut.ToolTipText = "출력 텍스트 글자 크기를 줄입니다 (Ctrl+-)";
        menuViewZoomOut.Click += btnZoomOut_Click;
        // 
        // menuViewZoomReset
        // 
        menuViewZoomReset.Name = "menuViewZoomReset";
        menuViewZoomReset.ShortcutKeys = Keys.Control | Keys.D0;
        menuViewZoomReset.Size = new Size(232, 22);
        menuViewZoomReset.Text = "원래 크기(&0)";
        menuViewZoomReset.ToolTipText = "설정 패널의 글자 크기로 초기화합니다 (Ctrl+0)";
        menuViewZoomReset.Click += btnZoomReset_Click;
        // 
        // toolStrip
        // 
        toolStrip.ImageScalingSize = new Size(20, 20);
        toolStrip.Items.AddRange(new ToolStripItem[] { btnOpenImage, btnOpenText, btnSaveText, toolStripSep1, btnCopy, toolStripSep2, btnConvertToolbar, btnRedraw, toolStripSep3, btnToggleEdit, toolStripSep4, btnResetToolbar });
        toolStrip.Location = new Point(0, 24);
        toolStrip.Name = "toolStrip";
        toolStrip.Size = new Size(1300, 25);
        toolStrip.TabIndex = 1;
        // 
        // btnOpenImage
        // 
        btnOpenImage.Name = "btnOpenImage";
        btnOpenImage.Size = new Size(75, 22);
        btnOpenImage.Text = "이미지 열기";
        btnOpenImage.ToolTipText = "이미지 파일 열기 (Ctrl+O)\nBMP, JPG, PNG, GIF, TIFF, ICO 지원";
        btnOpenImage.Click += menuFileOpenImage_Click;
        // 
        // btnOpenText
        // 
        btnOpenText.Name = "btnOpenText";
        btnOpenText.Size = new Size(75, 22);
        btnOpenText.Text = "텍스트 열기";
        btnOpenText.ToolTipText = "ASCII 텍스트 파일 열기 (Ctrl+Shift+O)\n.txt 또는 .asc 파일 지원";
        btnOpenText.Click += menuFileOpenText_Click;
        // 
        // btnSaveText
        // 
        btnSaveText.Name = "btnSaveText";
        btnSaveText.Size = new Size(35, 22);
        btnSaveText.Text = "저장";
        btnSaveText.ToolTipText = "ASCII 아트 텍스트로 저장 (Ctrl+S)";
        btnSaveText.Click += menuFileSaveText_Click;
        // 
        // toolStripSep1
        // 
        toolStripSep1.Name = "toolStripSep1";
        toolStripSep1.Size = new Size(6, 25);
        // 
        // btnCopy
        // 
        btnCopy.Name = "btnCopy";
        btnCopy.Size = new Size(35, 22);
        btnCopy.Text = "복사";
        btnCopy.ToolTipText = "전체 텍스트를 클립보드에 복사 (Ctrl+C)";
        btnCopy.Click += menuEditCopy_Click;
        // 
        // toolStripSep2
        // 
        toolStripSep2.Name = "toolStripSep2";
        toolStripSep2.Size = new Size(6, 25);
        // 
        // btnConvertToolbar
        // 
        btnConvertToolbar.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        btnConvertToolbar.Name = "btnConvertToolbar";
        btnConvertToolbar.Size = new Size(60, 22);
        btnConvertToolbar.Text = "변환 (F5)";
        btnConvertToolbar.ToolTipText = "현재 설정으로 이미지를 ASCII 아트로 변환합니다 (F5)";
        btnConvertToolbar.Click += btnConvertMain_Click;
        // 
        // btnRedraw
        // 
        btnRedraw.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        btnRedraw.Name = "btnRedraw";
        btnRedraw.Size = new Size(100, 22);
        btnRedraw.Text = "다시 그리기 (F6)";
        btnRedraw.ToolTipText = "다른 문자 집합으로 자동 전환하여 다시 변환합니다 (F6)\n문자 집합 순서: 표준→상세→블록→단순→사용자정의";
        btnRedraw.Click += btnRedraw_Click;
        // 
        // toolStripSep3
        // 
        toolStripSep3.Name = "toolStripSep3";
        toolStripSep3.Size = new Size(6, 25);
        // 
        // btnToggleEdit
        // 
        btnToggleEdit.Name = "btnToggleEdit";
        btnToggleEdit.Size = new Size(63, 22);
        btnToggleEdit.Text = "편집 모드";
        btnToggleEdit.ToolTipText = "출력 패널 편집 모드 켜기/끄기 (F2)\n편집 모드에서 ASCII 아트를 직접 수정할 수 있습니다";
        btnToggleEdit.Click += menuEditToggleEdit_Click;
        // 
        // toolStripSep4
        // 
        toolStripSep4.Name = "toolStripSep4";
        toolStripSep4.Size = new Size(6, 25);
        // 
        // btnResetToolbar
        // 
        btnResetToolbar.Name = "btnResetToolbar";
        btnResetToolbar.Size = new Size(75, 22);
        btnResetToolbar.Text = "기본값 복원";
        btnResetToolbar.ToolTipText = "모든 변환 설정을 초기 기본값으로 복원합니다";
        btnResetToolbar.Click += btnResetSettings_Click;
        // 
        // splitContainerMain
        // 
        splitContainerMain.Dock = DockStyle.Fill;
        splitContainerMain.Location = new Point(0, 49);
        splitContainerMain.Name = "splitContainerMain";
        // 
        // splitContainerMain.Panel1
        // 
        splitContainerMain.Panel1.Controls.Add(panelLeft);
        // 
        // splitContainerMain.Panel2
        // 
        splitContainerMain.Panel2.Controls.Add(panelRight);
        splitContainerMain.Size = new Size(1300, 627);
        splitContainerMain.SplitterDistance = 430;
        splitContainerMain.TabIndex = 2;
        // 
        // panelLeft
        // 
        panelLeft.Controls.Add(pictureBoxOriginal);
        panelLeft.Controls.Add(lblOriginal);
        panelLeft.Dock = DockStyle.Fill;
        panelLeft.Location = new Point(0, 0);
        panelLeft.Name = "panelLeft";
        panelLeft.Padding = new Padding(4);
        panelLeft.Size = new Size(430, 532);
        panelLeft.TabIndex = 0;
        // 
        // pictureBoxOriginal
        // 
        pictureBoxOriginal.AllowDrop = true;
        pictureBoxOriginal.BackColor = Color.FromArgb(30, 30, 30);
        pictureBoxOriginal.BorderStyle = BorderStyle.Fixed3D;
        pictureBoxOriginal.Dock = DockStyle.Fill;
        pictureBoxOriginal.Location = new Point(4, 26);
        pictureBoxOriginal.Name = "pictureBoxOriginal";
        pictureBoxOriginal.Size = new Size(422, 502);
        pictureBoxOriginal.SizeMode = PictureBoxSizeMode.Zoom;
        pictureBoxOriginal.TabIndex = 1;
        pictureBoxOriginal.TabStop = false;
        toolTip.SetToolTip(pictureBoxOriginal, "이미지를 드래그 앤 드롭하거나 더블클릭하여 열기");
        pictureBoxOriginal.DragDrop += pictureBoxOriginal_DragDrop;
        pictureBoxOriginal.DragEnter += pictureBoxOriginal_DragEnter;
        pictureBoxOriginal.DoubleClick += menuFileOpenImage_Click;
        // 
        // lblOriginal
        // 
        lblOriginal.BackColor = Color.FromArgb(50, 50, 60);
        lblOriginal.Dock = DockStyle.Top;
        lblOriginal.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        lblOriginal.ForeColor = Color.White;
        lblOriginal.Location = new Point(4, 4);
        lblOriginal.Name = "lblOriginal";
        lblOriginal.Size = new Size(422, 22);
        lblOriginal.TabIndex = 0;
        lblOriginal.Text = "원본 이미지";
        lblOriginal.TextAlign = ContentAlignment.MiddleCenter;
        // 
        // panelRight
        // 
        panelRight.Controls.Add(pnlOutputCanvas);
        panelRight.Controls.Add(panelOutputToolbar);
        panelRight.Controls.Add(lblOutput);
        panelRight.Dock = DockStyle.Fill;
        panelRight.Location = new Point(0, 0);
        panelRight.Name = "panelRight";
        panelRight.Padding = new Padding(4);
        panelRight.Size = new Size(866, 532);
        panelRight.TabIndex = 0;
        // 
        // pnlOutputCanvas
        // 
        pnlOutputCanvas.AutoScroll = true;
        pnlOutputCanvas.BackColor = Color.FromArgb(20, 20, 20);
        pnlOutputCanvas.Controls.Add(richTextBoxOutput);
        pnlOutputCanvas.Dock = DockStyle.Fill;
        pnlOutputCanvas.Location = new Point(4, 54);
        pnlOutputCanvas.Name = "pnlOutputCanvas";
        pnlOutputCanvas.Size = new Size(858, 474);
        pnlOutputCanvas.TabIndex = 2;
        // 
        // richTextBoxOutput
        // 
        richTextBoxOutput.AcceptsTab = true;
        richTextBoxOutput.BackColor = Color.Black;
        richTextBoxOutput.BorderStyle = BorderStyle.None;
        richTextBoxOutput.Font = new Font("Consolas", 4F);
        richTextBoxOutput.ForeColor = Color.White;
        richTextBoxOutput.Location = new Point(0, 0);
        richTextBoxOutput.Name = "richTextBoxOutput";
        richTextBoxOutput.ReadOnly = true;
        richTextBoxOutput.ScrollBars = RichTextBoxScrollBars.None;
        richTextBoxOutput.ShowSelectionMargin = false;
        richTextBoxOutput.Size = new Size(100, 96);
        richTextBoxOutput.TabIndex = 0;
        richTextBoxOutput.Text = "";
        toolTip.SetToolTip(richTextBoxOutput, "F2: 편집 모드 | Ctrl+A: 전체선택 | Ctrl+C: 복사\nCtrl++/-: 글자 크기 조절\n마우스 드래그로 위치 이동");
        richTextBoxOutput.WordWrap = false;
        // 
        // panelOutputToolbar
        // 
        panelOutputToolbar.Controls.Add(lblZoom);
        panelOutputToolbar.Controls.Add(btnZoomReset);
        panelOutputToolbar.Controls.Add(btnZoomOut);
        panelOutputToolbar.Controls.Add(btnZoomIn);
        panelOutputToolbar.Dock = DockStyle.Top;
        panelOutputToolbar.Location = new Point(4, 26);
        panelOutputToolbar.Name = "panelOutputToolbar";
        panelOutputToolbar.Size = new Size(858, 28);
        panelOutputToolbar.TabIndex = 1;
        // 
        // lblZoom
        // 
        lblZoom.AutoSize = true;
        lblZoom.Location = new Point(200, 6);
        lblZoom.Name = "lblZoom";
        lblZoom.Size = new Size(80, 15);
        lblZoom.TabIndex = 3;
        lblZoom.Text = "글자크기: 4pt";
        // 
        // btnZoomReset
        // 
        btnZoomReset.FlatStyle = FlatStyle.Flat;
        btnZoomReset.Location = new Point(130, 2);
        btnZoomReset.Name = "btnZoomReset";
        btnZoomReset.Size = new Size(60, 24);
        btnZoomReset.TabIndex = 2;
        btnZoomReset.Text = "초기화";
        toolTip.SetToolTip(btnZoomReset, "설정 패널의 글자 크기로 초기화 (Ctrl+0)");
        btnZoomReset.Click += btnZoomReset_Click;
        // 
        // btnZoomOut
        // 
        btnZoomOut.FlatStyle = FlatStyle.Flat;
        btnZoomOut.Location = new Point(65, 2);
        btnZoomOut.Name = "btnZoomOut";
        btnZoomOut.Size = new Size(60, 24);
        btnZoomOut.TabIndex = 1;
        btnZoomOut.Text = "A- 작게";
        toolTip.SetToolTip(btnZoomOut, "출력 글자 크기 축소 (Ctrl+-)");
        btnZoomOut.Click += btnZoomOut_Click;
        // 
        // btnZoomIn
        // 
        btnZoomIn.FlatStyle = FlatStyle.Flat;
        btnZoomIn.Location = new Point(0, 2);
        btnZoomIn.Name = "btnZoomIn";
        btnZoomIn.Size = new Size(60, 24);
        btnZoomIn.TabIndex = 0;
        btnZoomIn.Text = "A+ 크게";
        toolTip.SetToolTip(btnZoomIn, "출력 글자 크기 확대 (Ctrl++)");
        btnZoomIn.Click += btnZoomIn_Click;
        // 
        // lblOutput
        // 
        lblOutput.BackColor = Color.FromArgb(50, 50, 60);
        lblOutput.Dock = DockStyle.Top;
        lblOutput.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        lblOutput.ForeColor = Color.White;
        lblOutput.Location = new Point(4, 4);
        lblOutput.Name = "lblOutput";
        lblOutput.Size = new Size(858, 22);
        lblOutput.TabIndex = 0;
        lblOutput.Text = "ASCII 아트 출력";
        lblOutput.TextAlign = ContentAlignment.MiddleCenter;
        // 
        // panelSettings
        // 
        panelSettings.Controls.Add(btnConvertMain);
        panelSettings.Controls.Add(grpOptions);
        panelSettings.Controls.Add(grpFont);
        panelSettings.Controls.Add(grpSize);
        panelSettings.Controls.Add(grpCharSet);
        panelSettings.Dock = DockStyle.Bottom;
        panelSettings.Location = new Point(0, 574);
        panelSettings.Name = "panelSettings";
        panelSettings.Size = new Size(1300, 227);
        panelSettings.TabIndex = 3;
        // 
        // btnConvertMain
        // 
        btnConvertMain.BackColor = Color.FromArgb(60, 180, 60);
        btnConvertMain.FlatAppearance.BorderColor = Color.FromArgb(40, 140, 40);
        btnConvertMain.FlatStyle = FlatStyle.Flat;
        btnConvertMain.Font = new Font("맑은 고딕", 12F, FontStyle.Bold);
        btnConvertMain.ForeColor = Color.White;
        btnConvertMain.Location = new Point(1196, 14);
        btnConvertMain.Name = "btnConvertMain";
        btnConvertMain.Size = new Size(96, 100);
        btnConvertMain.TabIndex = 4;
        btnConvertMain.Text = "변환\r\n(F5)";
        toolTip.SetToolTip(btnConvertMain, "현재 설정으로 이미지를 ASCII 아트로 변환합니다 (F5)");
        btnConvertMain.UseVisualStyleBackColor = false;
        btnConvertMain.Click += btnConvertMain_Click;
        // 
        // grpOptions
        // 
        grpOptions.Controls.Add(chkInvert);
        grpOptions.Controls.Add(chkEdgeDetect);
        grpOptions.Controls.Add(lblContrast);
        grpOptions.Controls.Add(trkContrast);
        grpOptions.Controls.Add(numContrastValue);
        grpOptions.Controls.Add(pnlContrastScale);
        grpOptions.Controls.Add(lblBrightness);
        grpOptions.Controls.Add(trkBrightness);
        grpOptions.Controls.Add(numBrightnessValue);
        grpOptions.Controls.Add(pnlBrightnessScale);
        grpOptions.Controls.Add(btnResetSettings);
        grpOptions.Location = new Point(890, 6);
        grpOptions.Name = "grpOptions";
        grpOptions.Size = new Size(300, 208);
        grpOptions.TabIndex = 3;
        grpOptions.TabStop = false;
        grpOptions.Text = "변환 옵션";
        // 
        // chkInvert
        // 
        chkInvert.Location = new Point(10, 24);
        chkInvert.Name = "chkInvert";
        chkInvert.Size = new Size(130, 20);
        chkInvert.TabIndex = 0;
        chkInvert.Text = "밝기 반전";
        toolTip.SetToolTip(chkInvert, "밝은 영역↔어두운 영역을 반전합니다\n흰 배경 이미지(문서, 로고 등)에 유용합니다");
        // 
        // chkEdgeDetect
        // 
        chkEdgeDetect.Location = new Point(150, 24);
        chkEdgeDetect.Name = "chkEdgeDetect";
        chkEdgeDetect.Size = new Size(140, 20);
        chkEdgeDetect.TabIndex = 1;
        chkEdgeDetect.Text = "윤곽선 강조";
        toolTip.SetToolTip(chkEdgeDetect, "이미지의 경계선을 강조하여 변환합니다\n선 드로잉이나 윤곽선 표현에 적합합니다");
        // 
        // lblContrast
        // 
        lblContrast.Location = new Point(6, 52);
        lblContrast.Name = "lblContrast";
        lblContrast.Size = new Size(40, 20);
        lblContrast.TabIndex = 2;
        lblContrast.Text = "대비:";
        lblContrast.TextAlign = ContentAlignment.MiddleRight;
        // 
        // trkContrast
        // 
        trkContrast.AutoSize = false;
        trkContrast.LargeChange = 10;
        trkContrast.Location = new Point(48, 48);
        trkContrast.Maximum = 100;
        trkContrast.Name = "trkContrast";
        trkContrast.Size = new Size(196, 28);
        trkContrast.SmallChange = 5;
        trkContrast.TabIndex = 3;
        trkContrast.TickFrequency = 10;
        toolTip.SetToolTip(trkContrast, "이미지 대비 (0~100, 기본값: 50=변경없음)\n오른쪽: 대비 증가 / 왼쪽: 대비 감소");
        trkContrast.Value = 50;
        trkContrast.Scroll += trkContrast_Scroll;
        // 
        // numContrastValue
        // 
        numContrastValue.Location = new Point(248, 50);
        numContrastValue.Name = "numContrastValue";
        numContrastValue.Size = new Size(44, 23);
        numContrastValue.TabIndex = 4;
        toolTip.SetToolTip(numContrastValue, "대비 값을 직접 입력합니다 (0~100, 50=변경없음)");
        numContrastValue.Value = new decimal(new int[] { 50, 0, 0, 0 });
        numContrastValue.ValueChanged += numContrastValue_ValueChanged;
        // 
        // pnlContrastScale
        // 
        pnlContrastScale.BackColor = Color.Transparent;
        pnlContrastScale.Location = new Point(48, 77);
        pnlContrastScale.Name = "pnlContrastScale";
        pnlContrastScale.Size = new Size(196, 14);
        pnlContrastScale.TabIndex = 5;
        pnlContrastScale.Paint += pnlScale_Paint;
        // 
        // lblBrightness
        // 
        lblBrightness.Location = new Point(6, 100);
        lblBrightness.Name = "lblBrightness";
        lblBrightness.Size = new Size(40, 20);
        lblBrightness.TabIndex = 6;
        lblBrightness.Text = "밝기:";
        lblBrightness.TextAlign = ContentAlignment.MiddleRight;
        // 
        // trkBrightness
        // 
        trkBrightness.AutoSize = false;
        trkBrightness.LargeChange = 10;
        trkBrightness.Location = new Point(48, 96);
        trkBrightness.Maximum = 100;
        trkBrightness.Name = "trkBrightness";
        trkBrightness.Size = new Size(196, 28);
        trkBrightness.SmallChange = 5;
        trkBrightness.TabIndex = 7;
        trkBrightness.TickFrequency = 10;
        toolTip.SetToolTip(trkBrightness, "이미지 밝기 (0~100, 기본값: 50=변경없음)\n오른쪽: 밝게 / 왼쪽: 어둡게");
        trkBrightness.Value = 50;
        trkBrightness.Scroll += trkBrightness_Scroll;
        // 
        // numBrightnessValue
        // 
        numBrightnessValue.Location = new Point(248, 98);
        numBrightnessValue.Name = "numBrightnessValue";
        numBrightnessValue.Size = new Size(44, 23);
        numBrightnessValue.TabIndex = 8;
        toolTip.SetToolTip(numBrightnessValue, "밝기 값을 직접 입력합니다 (0~100, 50=변경없음)");
        numBrightnessValue.Value = new decimal(new int[] { 50, 0, 0, 0 });
        numBrightnessValue.ValueChanged += numBrightnessValue_ValueChanged;
        // 
        // pnlBrightnessScale
        // 
        pnlBrightnessScale.BackColor = Color.Transparent;
        pnlBrightnessScale.Location = new Point(48, 125);
        pnlBrightnessScale.Name = "pnlBrightnessScale";
        pnlBrightnessScale.Size = new Size(196, 14);
        pnlBrightnessScale.TabIndex = 9;
        pnlBrightnessScale.Paint += pnlScale_Paint;
        // 
        // btnResetSettings
        // 
        btnResetSettings.FlatStyle = FlatStyle.Flat;
        btnResetSettings.Location = new Point(6, 143);
        btnResetSettings.Name = "btnResetSettings";
        btnResetSettings.Size = new Size(287, 26);
        btnResetSettings.TabIndex = 10;
        btnResetSettings.Text = "모든 설정 기본값 복원";
        toolTip.SetToolTip(btnResetSettings, "문자 집합, 크기, 폰트, 대비, 밝기 등 모든 설정을 초기 기본값으로 되돌립니다");
        btnResetSettings.Click += btnResetSettings_Click;
        // 
        // grpFont
        // 
        grpFont.Controls.Add(lblFontName);
        grpFont.Controls.Add(cmbFontName);
        grpFont.Controls.Add(lblFontSize);
        grpFont.Controls.Add(numFontSize);
        grpFont.Controls.Add(chkColorOutput);
        grpFont.Location = new Point(602, 6);
        grpFont.Name = "grpFont";
        grpFont.Size = new Size(280, 208);
        grpFont.TabIndex = 2;
        grpFont.TabStop = false;
        grpFont.Text = "출력 폰트";
        // 
        // lblFontName
        // 
        lblFontName.Location = new Point(10, 34);
        lblFontName.Name = "lblFontName";
        lblFontName.Size = new Size(60, 20);
        lblFontName.TabIndex = 0;
        lblFontName.Text = "폰트:";
        lblFontName.TextAlign = ContentAlignment.MiddleRight;
        toolTip.SetToolTip(lblFontName, "출력에 사용할 폰트");
        // 
        // cmbFontName
        // 
        cmbFontName.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbFontName.FormattingEnabled = true;
        cmbFontName.Location = new Point(74, 32);
        cmbFontName.Name = "cmbFontName";
        cmbFontName.Size = new Size(196, 23);
        cmbFontName.TabIndex = 1;
        toolTip.SetToolTip(cmbFontName, "출력에 사용할 고정폭(등폭) 폰트를 선택하세요\n블록 문자·특수기호 표시: Consolas, NSimSun, MS Gothic 권장");
        // 
        // lblFontSize
        // 
        lblFontSize.Location = new Point(10, 70);
        lblFontSize.Name = "lblFontSize";
        lblFontSize.Size = new Size(60, 20);
        lblFontSize.TabIndex = 2;
        lblFontSize.Text = "크기:";
        lblFontSize.TextAlign = ContentAlignment.MiddleRight;
        toolTip.SetToolTip(lblFontSize, "출력 텍스트 글자 크기 (pt)");
        // 
        // numFontSize
        // 
        numFontSize.DecimalPlaces = 1;
        numFontSize.Increment = new decimal(new int[] { 5, 0, 0, 65536 });
        numFontSize.Location = new Point(74, 68);
        numFontSize.Maximum = new decimal(new int[] { 24, 0, 0, 0 });
        numFontSize.Minimum = new decimal(new int[] { 5, 0, 0, 65536 });
        numFontSize.Name = "numFontSize";
        numFontSize.Size = new Size(80, 23);
        numFontSize.TabIndex = 3;
        toolTip.SetToolTip(numFontSize, "출력 텍스트의 글자 크기 (0.5~24pt)\n변환 후 우측 패널의 A+/A- 버튼으로 보기 크기만 변경할 수도 있습니다");
        numFontSize.Value = new decimal(new int[] { 40, 0, 0, 65536 });
        numFontSize.ValueChanged += numFontSize_ValueChanged;
        // 
        // chkColorOutput
        // 
        chkColorOutput.Location = new Point(10, 106);
        chkColorOutput.Name = "chkColorOutput";
        chkColorOutput.Size = new Size(260, 20);
        chkColorOutput.TabIndex = 4;
        chkColorOutput.Text = "컬러 출력 (원본 색상 적용)";
        toolTip.SetToolTip(chkColorOutput, "체크하면 원본 이미지 색상이 각 문자의 글자 색으로 적용됩니다\nHTML 내보내기 시에도 색상이 반영됩니다\n※ 컬러 모드는 일반 변환보다 처리 시간이 걸립니다");
        // 
        // grpSize
        // 
        grpSize.Controls.Add(lblWidth);
        grpSize.Controls.Add(numWidth);
        grpSize.Controls.Add(lblHeight);
        grpSize.Controls.Add(numHeight);
        grpSize.Controls.Add(chkAutoHeight);
        grpSize.Controls.Add(lblAspect);
        grpSize.Controls.Add(numAspectRatio);
        grpSize.Controls.Add(chkKeepAspectRatio);
        grpSize.Controls.Add(chkAutoWidth);
        grpSize.Controls.Add(lblOutputScale);
        grpSize.Controls.Add(numOutputScale);
        grpSize.Location = new Point(384, 6);
        grpSize.Name = "grpSize";
        grpSize.Size = new Size(210, 214);
        grpSize.TabIndex = 1;
        grpSize.TabStop = false;
        grpSize.Text = "출력 크기";
        // 
        // lblWidth
        // 
        lblWidth.Location = new Point(10, 22);
        lblWidth.Name = "lblWidth";
        lblWidth.Size = new Size(70, 20);
        lblWidth.TabIndex = 0;
        lblWidth.Text = "너비 (열):";
        lblWidth.TextAlign = ContentAlignment.MiddleRight;
        toolTip.SetToolTip(lblWidth, "출력할 문자 열의 수 (자동 너비 해제 시 활성화)");
        // 
        // numWidth
        // 
        numWidth.Enabled = false;
        numWidth.Location = new Point(84, 20);
        numWidth.Maximum = new decimal(new int[] { 1000, 0, 0, 0 });
        numWidth.Minimum = new decimal(new int[] { 10, 0, 0, 0 });
        numWidth.Name = "numWidth";
        numWidth.Size = new Size(110, 23);
        numWidth.TabIndex = 1;
        toolTip.SetToolTip(numWidth, "출력할 문자 열의 수 (10~1000)\n자동 너비 설정 해제 시 수동으로 지정 가능합니다");
        numWidth.Value = new decimal(new int[] { 120, 0, 0, 0 });
        // 
        // lblHeight
        // 
        lblHeight.Location = new Point(10, 50);
        lblHeight.Name = "lblHeight";
        lblHeight.Size = new Size(70, 20);
        lblHeight.TabIndex = 2;
        lblHeight.Text = "높이 (행):";
        lblHeight.TextAlign = ContentAlignment.MiddleRight;
        toolTip.SetToolTip(lblHeight, "출력할 문자 행의 수 (자동 조정 해제 시 활성화)");
        // 
        // numHeight
        // 
        numHeight.Enabled = false;
        numHeight.Location = new Point(84, 48);
        numHeight.Maximum = new decimal(new int[] { 1000, 0, 0, 0 });
        numHeight.Minimum = new decimal(new int[] { 5, 0, 0, 0 });
        numHeight.Name = "numHeight";
        numHeight.Size = new Size(110, 23);
        numHeight.TabIndex = 3;
        toolTip.SetToolTip(numHeight, "출력할 문자 행의 수 (5~1000)");
        numHeight.Value = new decimal(new int[] { 60, 0, 0, 0 });
        // 
        // chkAutoHeight
        // 
        chkAutoHeight.Checked = true;
        chkAutoHeight.CheckState = CheckState.Checked;
        chkAutoHeight.Location = new Point(10, 76);
        chkAutoHeight.Name = "chkAutoHeight";
        chkAutoHeight.Size = new Size(190, 20);
        chkAutoHeight.TabIndex = 4;
        chkAutoHeight.Text = "높이 자동 조정";
        toolTip.SetToolTip(chkAutoHeight, "원본 이미지 비율을 유지하며 높이를 자동 계산합니다\n아래 종횡비 보정값이 함께 적용됩니다");
        chkAutoHeight.CheckedChanged += chkAutoHeight_CheckedChanged;
        // 
        // lblAspect
        // 
        lblAspect.Location = new Point(10, 102);
        lblAspect.Name = "lblAspect";
        lblAspect.Size = new Size(70, 20);
        lblAspect.TabIndex = 5;
        lblAspect.Text = "종횡비 보정:";
        lblAspect.TextAlign = ContentAlignment.MiddleRight;
        toolTip.SetToolTip(lblAspect, "글자 가로:세로 비율 보정값\n대부분의 고정폭 폰트는 0.40~0.50이 적합합니다");
        // 
        // numAspectRatio
        // 
        numAspectRatio.DecimalPlaces = 2;
        numAspectRatio.Increment = new decimal(new int[] { 1, 0, 0, 131072 });
        numAspectRatio.Location = new Point(84, 100);
        numAspectRatio.Maximum = new decimal(new int[] { 250, 0, 0, 131072 });
        numAspectRatio.Minimum = new decimal(new int[] { 10, 0, 0, 131072 });
        numAspectRatio.Name = "numAspectRatio";
        numAspectRatio.Size = new Size(110, 23);
        numAspectRatio.TabIndex = 6;
        toolTip.SetToolTip(numAspectRatio, "글자 종횡비 보정값 (0.10 ~ 2.50, 기본값: 0.45)\n값이 작을수록 세로가 더 압축됩니다\n블록 문자 모드에서는 전각 폰트에 맞게 최대 2.50까지 자동 계산됩니다");
        numAspectRatio.Value = new decimal(new int[] { 45, 0, 0, 131072 });
        //
        // chkKeepAspectRatio
        //
        chkKeepAspectRatio.Location = new Point(10, 126);
        chkKeepAspectRatio.Name = "chkKeepAspectRatio";
        chkKeepAspectRatio.Size = new Size(190, 20);
        chkKeepAspectRatio.TabIndex = 7;
        chkKeepAspectRatio.Text = "원본 비율 유지 (자동 계산)";
        toolTip.SetToolTip(chkKeepAspectRatio, "현재 폰트의 글자 가로:세로 비율을 자동 측정하여\n출력 텍스트가 원본 이미지와 동일한 비율로 보이도록 종횡비를 설정합니다");
        chkKeepAspectRatio.CheckedChanged += chkKeepAspectRatio_CheckedChanged;
        //
        // chkAutoWidth
        //
        chkAutoWidth.Checked = true;
        chkAutoWidth.CheckState = CheckState.Checked;
        chkAutoWidth.Location = new Point(10, 150);
        chkAutoWidth.Name = "chkAutoWidth";
        chkAutoWidth.Size = new Size(190, 20);
        chkAutoWidth.TabIndex = 8;
        chkAutoWidth.Text = "너비 자동 설정 (비율)";
        toolTip.SetToolTip(chkAutoWidth, "이미지 크기를 기준으로 출력 너비를 자동 계산합니다\n아래 출력 비율값이 함께 적용됩니다");
        chkAutoWidth.CheckedChanged += chkAutoWidth_CheckedChanged;
        //
        // lblOutputScale
        //
        lblOutputScale.Location = new Point(10, 178);
        lblOutputScale.Name = "lblOutputScale";
        lblOutputScale.Size = new Size(70, 20);
        lblOutputScale.TabIndex = 9;
        lblOutputScale.Text = "출력 비율%:";
        lblOutputScale.TextAlign = ContentAlignment.MiddleRight;
        toolTip.SetToolTip(lblOutputScale, "이미지 원본 대비 출력 ASCII 아트의 시각적 크기 비율");
        //
        // numOutputScale
        //
        numOutputScale.Location = new Point(84, 176);
        numOutputScale.Maximum = new decimal(new int[] { 200, 0, 0, 0 });
        numOutputScale.Minimum = new decimal(new int[] { 5, 0, 0, 0 });
        numOutputScale.Name = "numOutputScale";
        numOutputScale.Size = new Size(110, 23);
        numOutputScale.TabIndex = 10;
        toolTip.SetToolTip(numOutputScale, "출력 ASCII 아트의 시각적 크기 비율 (5~200%, 기본값: 50%)\n50% = 원본 이미지의 절반 크기로 보이도록 너비 자동 계산\n자동 너비 체크 시 활성화됩니다");
        numOutputScale.Value = new decimal(new int[] { 50, 0, 0, 0 });
        // 
        // grpCharSet
        // 
        grpCharSet.Controls.Add(rbCharDetailed);
        grpCharSet.Controls.Add(rbCharStandard);
        grpCharSet.Controls.Add(rbCharSimple);
        grpCharSet.Controls.Add(rbCharBlock);
        grpCharSet.Controls.Add(rbCharCustom);
        grpCharSet.Controls.Add(txtCustomChars);
        grpCharSet.Location = new Point(6, 6);
        grpCharSet.Name = "grpCharSet";
        grpCharSet.Size = new Size(370, 208);
        grpCharSet.TabIndex = 0;
        grpCharSet.TabStop = false;
        grpCharSet.Text = "문자 집합";
        // 
        // rbCharDetailed
        // 
        rbCharDetailed.Location = new Point(10, 24);
        rbCharDetailed.Name = "rbCharDetailed";
        rbCharDetailed.Size = new Size(348, 20);
        rbCharDetailed.TabIndex = 0;
        rbCharDetailed.Text = "상세 70단계: $@B%8&WM#*oahkbdpqwm...";
        toolTip.SetToolTip(rbCharDetailed, "70가지 문자를 사용한 매우 세밀한 변환\n사진 등 복잡한 이미지에 적합합니다");
        // 
        // rbCharStandard
        // 
        rbCharStandard.Location = new Point(10, 52);
        rbCharStandard.Name = "rbCharStandard";
        rbCharStandard.Size = new Size(348, 20);
        rbCharStandard.TabIndex = 1;
        rbCharStandard.TabStop = true;
        rbCharStandard.Text = "표준 10단계: @#S%?*+;:,.";
        toolTip.SetToolTip(rbCharStandard, "10가지 문자를 사용한 표준 변환\n일반 이미지에 적합합니다");
        // 
        // rbCharSimple
        // 
        rbCharSimple.Checked = true;
        rbCharSimple.Location = new Point(10, 80);
        rbCharSimple.Name = "rbCharSimple";
        rbCharSimple.Size = new Size(348, 20);
        rbCharSimple.TabIndex = 2;
        rbCharSimple.Text = "단순 5단계: @#*. ";
        toolTip.SetToolTip(rbCharSimple, "5가지 문자를 사용한 단순 변환 (기본값)\n로고나 단순한 그래픽에 적합합니다");
        // 
        // rbCharBlock
        // 
        rbCharBlock.Location = new Point(10, 108);
        rbCharBlock.Name = "rbCharBlock";
        rbCharBlock.Size = new Size(348, 20);
        rbCharBlock.TabIndex = 3;
        rbCharBlock.Text = "블록 문자: █▓▒░ ";
        toolTip.SetToolTip(rbCharBlock, "유니코드 블록 문자를 사용한 변환\nConsolas, NSimSun 폰트 권장");
        // 
        // rbCharCustom
        // 
        rbCharCustom.Location = new Point(10, 138);
        rbCharCustom.Name = "rbCharCustom";
        rbCharCustom.Size = new Size(90, 20);
        rbCharCustom.TabIndex = 4;
        rbCharCustom.Text = "사용자 정의:";
        toolTip.SetToolTip(rbCharCustom, "아래 입력란에 직접 입력한 문자를 사용합니다");
        rbCharCustom.CheckedChanged += rbCharCustom_CheckedChanged;
        // 
        // txtCustomChars
        // 
        txtCustomChars.Enabled = false;
        txtCustomChars.Font = new Font("Consolas", 9F);
        txtCustomChars.Location = new Point(104, 136);
        txtCustomChars.Name = "txtCustomChars";
        txtCustomChars.Size = new Size(254, 22);
        txtCustomChars.TabIndex = 5;
        txtCustomChars.Text = "@#*+:. ";
        toolTip.SetToolTip(txtCustomChars, "어두운 문자(왼쪽) → 밝은 문자/공백(오른쪽) 순서로 입력\n예: @#*+:. (7단계)");
        // 
        // statusStrip
        // 
        statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel, statusProgressBar, statusImageInfo, statusOutputInfo, statusEditMode, statusFilePath });
        statusStrip.Location = new Point(0, 801);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1300, 24);
        statusStrip.TabIndex = 4;
        // 
        // statusLabel
        // 
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(1092, 19);
        statusLabel.Spring = true;
        statusLabel.Text = "이미지를 열어서 ASCII 아트로 변환하세요.";
        statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // statusProgressBar
        // 
        statusProgressBar.Name = "statusProgressBar";
        statusProgressBar.Size = new Size(100, 18);
        statusProgressBar.Visible = false;
        // 
        // statusImageInfo
        // 
        statusImageInfo.BorderSides = ToolStripStatusLabelBorderSides.Left | ToolStripStatusLabelBorderSides.Right;
        statusImageInfo.Name = "statusImageInfo";
        statusImageInfo.Size = new Size(59, 19);
        statusImageInfo.Text = "이미지: -";
        // 
        // statusOutputInfo
        // 
        statusOutputInfo.BorderSides = ToolStripStatusLabelBorderSides.Left | ToolStripStatusLabelBorderSides.Right;
        statusOutputInfo.Name = "statusOutputInfo";
        statusOutputInfo.Size = new Size(47, 19);
        statusOutputInfo.Text = "출력: -";
        // 
        // statusEditMode
        // 
        statusEditMode.BorderSides = ToolStripStatusLabelBorderSides.Left | ToolStripStatusLabelBorderSides.Right;
        statusEditMode.ForeColor = Color.Gray;
        statusEditMode.Name = "statusEditMode";
        statusEditMode.Size = new Size(63, 19);
        statusEditMode.Text = "읽기 전용";
        // 
        // statusFilePath
        // 
        statusFilePath.Name = "statusFilePath";
        statusFilePath.Size = new Size(0, 19);
        statusFilePath.TextAlign = ContentAlignment.MiddleRight;
        // 
        // openImageDialog
        // 
        openImageDialog.Filter = "이미지 파일|*.bmp;*.jpg;*.jpeg;*.png;*.gif;*.tiff;*.tif;*.ico|모든 파일|*.*";
        openImageDialog.Title = "이미지 파일 열기";
        // 
        // openTextDialog
        // 
        openTextDialog.Filter = "텍스트 파일|*.txt;*.asc|모든 파일|*.*";
        openTextDialog.Title = "ASCII 텍스트 파일 열기";
        // 
        // openPresetDialog
        // 
        openPresetDialog.DefaultExt = "I2t";
        openPresetDialog.Filter = "Image2Text 프리셋 (*.I2t)|*.I2t|모든 파일|*.*";
        openPresetDialog.Title = "설정 프리셋 파일 불러오기";
        // 
        // saveTextDialog
        // 
        saveTextDialog.DefaultExt = "txt";
        saveTextDialog.FileName = "Img2Txt_";
        saveTextDialog.Filter = "텍스트 파일 (*.txt)|*.txt|ASC 파일 (*.asc)|*.asc|모든 파일|*.*";
        saveTextDialog.Title = "ASCII 아트 텍스트로 저장";
        // 
        // saveImageDialog
        // 
        saveImageDialog.DefaultExt = "png";
        saveImageDialog.FileName = "Img2Txt_";
        saveImageDialog.Filter = "PNG 이미지 (*.png)|*.png|BMP 이미지 (*.bmp)|*.bmp|JPEG 이미지 (*.jpg)|*.jpg";
        saveImageDialog.Title = "ASCII 아트를 이미지로 저장";
        // 
        // savePresetDialog
        // 
        savePresetDialog.DefaultExt = "I2t";
        savePresetDialog.FileName = "MyPreset";
        savePresetDialog.Filter = "Image2Text 프리셋 (*.I2t)|*.I2t|모든 파일|*.*";
        savePresetDialog.Title = "변환 설정을 프리셋으로 저장";
        // 
        // Image2TextForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1300, 920);
        Controls.Add(splitContainerMain);
        Controls.Add(panelSettings);
        Controls.Add(toolStrip);
        Controls.Add(menuStrip);
        Controls.Add(statusStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        KeyPreview = true;
        MainMenuStrip = menuStrip;
        MinimumSize = new Size(1316, 780);
        Name = "Image2TextForm";
        Text = "Image to ASCII Art 변환기";
        Load += Image2TextForm_Load;
        KeyDown += Image2TextForm_KeyDown;
        menuStrip.ResumeLayout(false);
        menuStrip.PerformLayout();
        toolStrip.ResumeLayout(false);
        toolStrip.PerformLayout();
        splitContainerMain.Panel1.ResumeLayout(false);
        splitContainerMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).EndInit();
        splitContainerMain.ResumeLayout(false);
        panelLeft.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)pictureBoxOriginal).EndInit();
        panelRight.ResumeLayout(false);
        pnlOutputCanvas.ResumeLayout(false);
        panelOutputToolbar.ResumeLayout(false);
        panelOutputToolbar.PerformLayout();
        panelSettings.ResumeLayout(false);
        grpOptions.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)trkContrast).EndInit();
        ((System.ComponentModel.ISupportInitialize)numContrastValue).EndInit();
        ((System.ComponentModel.ISupportInitialize)trkBrightness).EndInit();
        ((System.ComponentModel.ISupportInitialize)numBrightnessValue).EndInit();
        grpFont.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)numFontSize).EndInit();
        grpSize.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)numWidth).EndInit();
        ((System.ComponentModel.ISupportInitialize)numHeight).EndInit();
        ((System.ComponentModel.ISupportInitialize)numAspectRatio).EndInit();
        ((System.ComponentModel.ISupportInitialize)numOutputScale).EndInit();
        grpCharSet.ResumeLayout(false);
        grpCharSet.PerformLayout();
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    // ── 메뉴 ───────────────────────────────────────────────────────────────
    private MenuStrip menuStrip;
    private ToolStripMenuItem menuFile;
    private ToolStripMenuItem menuFileOpenImage;
    private ToolStripMenuItem menuFileOpenText;
    private ToolStripSeparator menuFilePresetSep;
    private ToolStripMenuItem menuFileLoadPreset;
    private ToolStripMenuItem menuFileSavePreset;
    private ToolStripSeparator menuFileSep1;
    private ToolStripMenuItem menuFileSaveText;
    private ToolStripSeparator menuFileSep2;
    private ToolStripMenuItem menuFileExport;
    private ToolStripMenuItem menuFileExportHtml;
    private ToolStripMenuItem menuFileExportPdf;
    private ToolStripMenuItem menuFileExportWord;
    private ToolStripMenuItem menuFileExportImage;
    private ToolStripSeparator menuFileSep3;
    private ToolStripMenuItem menuFileExit;
    private ToolStripMenuItem menuEdit;
    private ToolStripMenuItem menuEditCopy;
    private ToolStripMenuItem menuEditSelectAll;
    private ToolStripSeparator menuEditSep1;
    private ToolStripMenuItem menuEditToggleEdit;
    private ToolStripMenuItem menuConvert;
    private ToolStripMenuItem menuConvertRun;
    private ToolStripMenuItem menuConvertRedraw;
    private ToolStripSeparator menuConvertSep1;
    private ToolStripMenuItem menuConvertRedrawWith;
    private ToolStripMenuItem menuConvertRedrawDetailed;
    private ToolStripMenuItem menuConvertRedrawStandard;
    private ToolStripMenuItem menuConvertRedrawSimple;
    private ToolStripMenuItem menuConvertRedrawBlock;
    private ToolStripMenuItem menuConvertRedrawCustom;
    private ToolStripMenuItem menuView;
    private ToolStripMenuItem menuViewZoomIn;
    private ToolStripMenuItem menuViewZoomOut;
    private ToolStripMenuItem menuViewZoomReset;
    // ── 툴바 ───────────────────────────────────────────────────────────────
    private ToolStrip toolStrip;
    private ToolStripButton btnOpenImage;
    private ToolStripButton btnOpenText;
    private ToolStripButton btnSaveText;
    private ToolStripSeparator toolStripSep1;
    private ToolStripButton btnCopy;
    private ToolStripSeparator toolStripSep2;
    private ToolStripButton btnConvertToolbar;
    private ToolStripButton btnRedraw;
    private ToolStripSeparator toolStripSep3;
    private ToolStripButton btnToggleEdit;
    private ToolStripSeparator toolStripSep4;
    private ToolStripButton btnResetToolbar;
    // ── 패널 ───────────────────────────────────────────────────────────────
    private SplitContainer splitContainerMain;
    private Panel panelLeft;
    private Label lblOriginal;
    private PictureBox pictureBoxOriginal;
    private Panel panelRight;
    private Label lblOutput;
    private Panel panelOutputToolbar;
    private Button btnZoomIn;
    private Button btnZoomOut;
    private Button btnZoomReset;
    private Label lblZoom;
    private Panel pnlOutputCanvas;
    private RichTextBox richTextBoxOutput;
    private Panel panelSettings;
    private GroupBox grpCharSet;
    private RadioButton rbCharDetailed;
    private RadioButton rbCharStandard;
    private RadioButton rbCharSimple;
    private RadioButton rbCharBlock;
    private RadioButton rbCharCustom;
    private TextBox txtCustomChars;
    private GroupBox grpSize;
    private Label lblWidth;
    private NumericUpDown numWidth;
    private Label lblHeight;
    private NumericUpDown numHeight;
    private CheckBox chkAutoHeight;
    private Label lblAspect;
    private NumericUpDown numAspectRatio;
    private CheckBox chkKeepAspectRatio;
    private CheckBox chkAutoWidth;
    private Label lblOutputScale;
    private NumericUpDown numOutputScale;
    private GroupBox grpFont;
    private Label lblFontName;
    private ComboBox cmbFontName;
    private Label lblFontSize;
    private NumericUpDown numFontSize;
    private CheckBox chkColorOutput;
    private GroupBox grpOptions;
    private CheckBox chkInvert;
    private CheckBox chkEdgeDetect;
    private Label lblContrast;
    private TrackBar trkContrast;
    private NumericUpDown numContrastValue;
    private Panel pnlContrastScale;
    private Label lblBrightness;
    private TrackBar trkBrightness;
    private NumericUpDown numBrightnessValue;
    private Panel pnlBrightnessScale;
    private Button btnResetSettings;
    private Button btnConvertMain;
    // ── 상태바 ─────────────────────────────────────────────────────────────
    private StatusStrip statusStrip;
    private ToolStripStatusLabel statusLabel;
    private ToolStripProgressBar statusProgressBar;
    private ToolStripStatusLabel statusImageInfo;
    private ToolStripStatusLabel statusOutputInfo;
    private ToolStripStatusLabel statusEditMode;
    private ToolStripStatusLabel statusFilePath;
    // ── 기타 ───────────────────────────────────────────────────────────────
    private ToolTip toolTip;
    private OpenFileDialog openImageDialog;
    private OpenFileDialog openTextDialog;
    private OpenFileDialog openPresetDialog;
    private SaveFileDialog saveTextDialog;
    private SaveFileDialog saveImageDialog;
    private SaveFileDialog savePresetDialog;
}
