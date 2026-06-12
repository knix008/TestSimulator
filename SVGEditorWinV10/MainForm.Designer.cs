namespace SVGEditorWinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    private MenuStrip _menuStrip;
    private ToolStripMenuItem _menuFile;
    private ToolStripMenuItem _menuNew;
    private ToolStripMenuItem _menuOpen;
    private ToolStripMenuItem _menuSave;
    private ToolStripMenuItem _menuSaveAs;
    private ToolStripMenuItem _menuCanvasSize;
    private ToolStripSeparator _menuSepFileExport;
    private ToolStripMenuItem _menuExportImage;
    private ToolStripMenuItem _menuExit;
    private ToolStripMenuItem _menuEdit;
    private ToolStripMenuItem _menuDelete;
    private ToolStripMenuItem _menuView;
    private ToolStripMenuItem _menuZoomIn;
    private ToolStripMenuItem _menuZoomOut;
    private ToolStripMenuItem _menuZoomReset;
    private ToolStripMenuItem _menuTools;
    private ToolStripMenuItem _menuToolSelect;
    private ToolStripMenuItem _menuToolRectangle;
    private ToolStripMenuItem _menuToolSquare;
    private ToolStripMenuItem _menuToolRoundedRect;
    private ToolStripMenuItem _menuToolCircle;
    private ToolStripMenuItem _menuToolEllipse;
    private ToolStripMenuItem _menuToolTriangle;
    private ToolStripMenuItem _menuToolDiamond;
    private ToolStripMenuItem _menuToolHexagon;
    private ToolStripMenuItem _menuToolParallelogram;
    private ToolStripMenuItem _menuToolStar;
    private ToolStripMenuItem _menuToolLine;
    private ToolStripMenuItem _menuToolPolyline;
    private ToolStripMenuItem _menuToolPolygon;
    private ToolStripMenuItem _menuToolCurve;
    private ToolStripMenuItem _menuToolPath;
    private ToolStripMenuItem _menuToolText;
    private ToolStripMenuItem _menuToolImage;
    private ToolStripMenuItem _menuUndo;
    private ToolStripMenuItem _menuRedo;
    private ToolStripSeparator _menuSepEdit0;
    private ToolStripSeparator _menuSepEdit1;
    private ToolStripMenuItem _menuApplySource;
    private ToolStripMenuItem _menuCopySource;
    private ToolStrip _toolStripMain;
    private ToolStripButton _tbNew;
    private ToolStripButton _tbOpen;
    private ToolStripButton _tbSave;
    private ToolStripButton _tbSaveAs;
    private ToolStripButton _tbCanvasSize;
    private ToolStripButton _tbExportImage;
    private ToolStripSeparator _tbSepFile1;
    private ToolStripButton _tbDelete;
    private ToolStripButton _tbUndo;
    private ToolStripButton _tbRedo;
    private ToolStripSeparator _tbSepEdit0;
    private ToolStripSeparator _tbSepEdit1;
    private ToolStripButton _tbZoomIn;
    private ToolStripButton _tbZoomOut;
    private ToolStripButton _tbZoomReset;
    private ToolStripLabel _tbZoomLabel;
    private ToolStripSeparator _tbSepView1;
    private ToolStripButton _tbApplySource;
    private ToolStripButton _tbCopySource;
    private SplitContainer _splitMain;
    private SplitContainer _splitEditor;
    private Panel _pnlToolbox;
    private FlowLayoutPanel _pnlToolboxTop;
    private Panel _pnlToolGridHost;
    private Panel _pnlToolboxSectionDivider;
    private Label _lblToolboxTitle;
    private ToolStrip _toolStripTools;
    private ToolStripButton _btnSelect;
    private ToolStripButton _btnRectangle;
    private ToolStripButton _btnSquare;
    private ToolStripButton _btnRoundedRect;
    private ToolStripButton _btnCircle;
    private ToolStripButton _btnEllipse;
    private ToolStripButton _btnTriangle;
    private ToolStripButton _btnDiamond;
    private ToolStripButton _btnHexagon;
    private ToolStripButton _btnParallelogram;
    private ToolStripButton _btnStar;
    private ToolStripButton _btnLine;
    private ToolStripButton _btnPolyline;
    private ToolStripButton _btnPolygon;
    private ToolStripButton _btnCurve;
    private ToolStripButton _btnPath;
    private ToolStripButton _btnText;
    private ToolStripButton _btnImage;
    private Panel _pnlToolOptions;
    private Label _lblFillColor;
    private Button _btnFillColor;
    private Label _lblFillPattern;
    private ComboBox _cmbFillPattern;
    private Label _lblFillOpacity;
    private NumericUpDown _numFillOpacity;
    private Label _lblStrokeColor;
    private Button _btnStrokeColor;
    private Label _lblStrokeOpacity;
    private NumericUpDown _numStrokeOpacity;
    private Label _lblStrokeWidth;
    private NumericUpDown _numStrokeWidth;
    private Label _lblLineStyle;
    private ComboBox _cmbLineStyle;
    private Label _lblStartMarker;
    private ComboBox _cmbStartMarker;
    private Label _lblEndMarker;
    private ComboBox _cmbEndMarker;
    private Label _lblFontName;
    private ComboBox _cmbFontName;
    private Label _lblFontSize;
    private NumericUpDown _numFontSize;
    private CheckBox _chkFontBold;
    private CheckBox _chkFontItalic;
    private CheckBox _chkFontUnderline;
    private CheckBox _chkFontStrikeout;
    private Panel _pnlCanvasHost;
    private Controls.SvgCanvas _canvas;
    private Panel _pnlSource;
    private Panel _pnlSourceHeader;
    private Panel _pnlSourceButtons;
    private Label _lblSourceTitle;
    private Button _btnApplySource;
    private Button _btnCopySource;
    private Panel _pnlSourceEditor;
    private RichTextBox _txtSvgSource;
    private Panel _pnlProperties;
    private Panel _pnlPropertiesHeader;
    private Label _lblPropertiesTitle;
    private StatusStrip _statusStrip;
    private ToolStripStatusLabel _statusLabel;
    private ToolStripStatusLabel _statusZoomLabel;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        _menuStrip = new MenuStrip();
        _menuFile = new ToolStripMenuItem();
        _menuNew = new ToolStripMenuItem();
        _menuOpen = new ToolStripMenuItem();
        _menuSave = new ToolStripMenuItem();
        _menuSaveAs = new ToolStripMenuItem();
        _menuCanvasSize = new ToolStripMenuItem();
        _menuSepFileExport = new ToolStripSeparator();
        _menuExportImage = new ToolStripMenuItem();
        _menuExit = new ToolStripMenuItem();
        _menuEdit = new ToolStripMenuItem();
        _menuDelete = new ToolStripMenuItem();
        _menuUndo = new ToolStripMenuItem();
        _menuRedo = new ToolStripMenuItem();
        _menuSepEdit0 = new ToolStripSeparator();
        _menuSepEdit1 = new ToolStripSeparator();
        _menuApplySource = new ToolStripMenuItem();
        _menuCopySource = new ToolStripMenuItem();
        _menuTools = new ToolStripMenuItem();
        _menuToolSelect = new ToolStripMenuItem();
        _menuToolRectangle = new ToolStripMenuItem();
        _menuToolSquare = new ToolStripMenuItem();
        _menuToolRoundedRect = new ToolStripMenuItem();
        _menuToolCircle = new ToolStripMenuItem();
        _menuToolEllipse = new ToolStripMenuItem();
        _menuToolTriangle = new ToolStripMenuItem();
        _menuToolDiamond = new ToolStripMenuItem();
        _menuToolHexagon = new ToolStripMenuItem();
        _menuToolParallelogram = new ToolStripMenuItem();
        _menuToolStar = new ToolStripMenuItem();
        _menuToolLine = new ToolStripMenuItem();
        _menuToolPolyline = new ToolStripMenuItem();
        _menuToolPolygon = new ToolStripMenuItem();
        _menuToolCurve = new ToolStripMenuItem();
        _menuToolPath = new ToolStripMenuItem();
        _menuToolText = new ToolStripMenuItem();
        _menuToolImage = new ToolStripMenuItem();
        _menuView = new ToolStripMenuItem();
        _menuZoomIn = new ToolStripMenuItem();
        _menuZoomOut = new ToolStripMenuItem();
        _menuZoomReset = new ToolStripMenuItem();
        _toolStripMain = new ToolStrip();
        _tbNew = new ToolStripButton();
        _tbOpen = new ToolStripButton();
        _tbSave = new ToolStripButton();
        _tbSaveAs = new ToolStripButton();
        _tbCanvasSize = new ToolStripButton();
        _tbExportImage = new ToolStripButton();
        _tbSepFile1 = new ToolStripSeparator();
        _tbDelete = new ToolStripButton();
        _tbUndo = new ToolStripButton();
        _tbRedo = new ToolStripButton();
        _tbSepEdit0 = new ToolStripSeparator();
        _tbSepEdit1 = new ToolStripSeparator();
        _tbZoomIn = new ToolStripButton();
        _tbZoomOut = new ToolStripButton();
        _tbZoomReset = new ToolStripButton();
        _tbZoomLabel = new ToolStripLabel();
        _tbSepView1 = new ToolStripSeparator();
        _tbApplySource = new ToolStripButton();
        _tbCopySource = new ToolStripButton();
        _splitMain = new SplitContainer();
        _pnlToolbox = new Panel();
        _pnlProperties = new Panel();
        _pnlToolOptions = new Panel();
        _chkFontItalic = new CheckBox();
        _chkFontUnderline = new CheckBox();
        _chkFontStrikeout = new CheckBox();
        _chkFontBold = new CheckBox();
        _numFontSize = new NumericUpDown();
        _lblFontSize = new Label();
        _cmbFontName = new ComboBox();
        _lblFontName = new Label();
        _cmbEndMarker = new ComboBox();
        _lblEndMarker = new Label();
        _cmbStartMarker = new ComboBox();
        _lblStartMarker = new Label();
        _cmbLineStyle = new ComboBox();
        _lblLineStyle = new Label();
        _numStrokeOpacity = new NumericUpDown();
        _lblStrokeOpacity = new Label();
        _numStrokeWidth = new NumericUpDown();
        _lblStrokeWidth = new Label();
        _btnStrokeColor = new Button();
        _lblStrokeColor = new Label();
        _numFillOpacity = new NumericUpDown();
        _lblFillOpacity = new Label();
        _cmbFillPattern = new ComboBox();
        _lblFillPattern = new Label();
        _btnFillColor = new Button();
        _lblFillColor = new Label();
        _pnlPropertiesHeader = new Panel();
        _lblPropertiesTitle = new Label();
        _pnlToolboxSectionDivider = new Panel();
        _pnlToolboxTop = new FlowLayoutPanel();
        _lblToolboxTitle = new Label();
        _pnlToolGridHost = new Panel();
        _toolStripTools = new ToolStrip();
        _btnSelect = new ToolStripButton();
        _btnRectangle = new ToolStripButton();
        _btnSquare = new ToolStripButton();
        _btnRoundedRect = new ToolStripButton();
        _btnCircle = new ToolStripButton();
        _btnEllipse = new ToolStripButton();
        _btnTriangle = new ToolStripButton();
        _btnDiamond = new ToolStripButton();
        _btnHexagon = new ToolStripButton();
        _btnParallelogram = new ToolStripButton();
        _btnStar = new ToolStripButton();
        _btnLine = new ToolStripButton();
        _btnPolyline = new ToolStripButton();
        _btnPolygon = new ToolStripButton();
        _btnCurve = new ToolStripButton();
        _btnPath = new ToolStripButton();
        _btnText = new ToolStripButton();
        _btnImage = new ToolStripButton();
        _splitEditor = new SplitContainer();
        _pnlCanvasHost = new Panel();
        _canvas = new SVGEditorWinV10.Controls.SvgCanvas();
        _pnlSource = new Panel();
        _pnlSourceEditor = new Panel();
        _txtSvgSource = new RichTextBox();
        _pnlSourceHeader = new Panel();
        _lblSourceTitle = new Label();
        _pnlSourceButtons = new Panel();
        _btnCopySource = new Button();
        _btnApplySource = new Button();
        _statusStrip = new StatusStrip();
        _statusLabel = new ToolStripStatusLabel();
        _statusZoomLabel = new ToolStripStatusLabel();
        _menuStrip.SuspendLayout();
        _toolStripMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitMain).BeginInit();
        _splitMain.Panel1.SuspendLayout();
        _splitMain.Panel2.SuspendLayout();
        _splitMain.SuspendLayout();
        _pnlToolbox.SuspendLayout();
        _pnlProperties.SuspendLayout();
        _pnlToolOptions.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_numFontSize).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_numStrokeOpacity).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_numStrokeWidth).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_numFillOpacity).BeginInit();
        _pnlPropertiesHeader.SuspendLayout();
        _pnlToolboxTop.SuspendLayout();
        _pnlToolGridHost.SuspendLayout();
        _toolStripTools.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitEditor).BeginInit();
        _splitEditor.Panel1.SuspendLayout();
        _splitEditor.Panel2.SuspendLayout();
        _splitEditor.SuspendLayout();
        _pnlCanvasHost.SuspendLayout();
        _pnlSource.SuspendLayout();
        _pnlSourceEditor.SuspendLayout();
        _pnlSourceHeader.SuspendLayout();
        _pnlSourceButtons.SuspendLayout();
        _statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // _menuStrip
        // 
        _menuStrip.Items.AddRange(new ToolStripItem[] { _menuFile, _menuEdit, _menuTools, _menuView });
        _menuStrip.Location = new Point(0, 0);
        _menuStrip.Name = "_menuStrip";
        _menuStrip.ShowItemToolTips = true;
        _menuStrip.Size = new Size(1280, 24);
        _menuStrip.TabIndex = 0;
        // 
        // _menuFile
        // 
        _menuFile.DropDownItems.AddRange(new ToolStripItem[] { _menuNew, _menuOpen, _menuSave, _menuSaveAs, _menuCanvasSize, _menuSepFileExport, _menuExportImage, _menuExit });
        _menuFile.Name = "_menuFile";
        _menuFile.Size = new Size(57, 20);
        _menuFile.Text = "파일(&F)";
        // 
        // _menuNew
        // 
        _menuNew.Name = "_menuNew";
        _menuNew.ShortcutKeys = Keys.Control | Keys.N;
        _menuNew.Size = new Size(187, 22);
        _menuNew.Text = "새로 만들기";
        _menuNew.Click += MenuNew_Click;
        // 
        // _menuOpen
        // 
        _menuOpen.Name = "_menuOpen";
        _menuOpen.ShortcutKeys = Keys.Control | Keys.O;
        _menuOpen.Size = new Size(187, 22);
        _menuOpen.Text = "열기...";
        _menuOpen.Click += MenuOpen_Click;
        // 
        // _menuSave
        // 
        _menuSave.Name = "_menuSave";
        _menuSave.ShortcutKeys = Keys.Control | Keys.S;
        _menuSave.Size = new Size(187, 22);
        _menuSave.Text = "저장";
        _menuSave.Click += MenuSave_Click;
        // 
        // _menuSaveAs
        // 
        _menuSaveAs.Name = "_menuSaveAs";
        _menuSaveAs.Size = new Size(187, 22);
        _menuSaveAs.Text = "다른 이름으로 저장...";
        _menuSaveAs.Click += MenuSaveAs_Click;
        // 
        // _menuCanvasSize
        // 
        _menuCanvasSize.Name = "_menuCanvasSize";
        _menuCanvasSize.Size = new Size(187, 22);
        _menuCanvasSize.Text = "캔버스 크기...";
        _menuCanvasSize.Click += MenuCanvasSize_Click;
        // 
        // _menuSepFileExport
        // 
        _menuSepFileExport.Name = "_menuSepFileExport";
        _menuSepFileExport.Size = new Size(184, 6);
        // 
        // _menuExportImage
        // 
        _menuExportImage.Name = "_menuExportImage";
        _menuExportImage.Size = new Size(187, 22);
        _menuExportImage.Text = "이미지로 내보내기...";
        _menuExportImage.Click += MenuExportImage_Click;
        // 
        // _menuExit
        // 
        _menuExit.Name = "_menuExit";
        _menuExit.Size = new Size(187, 22);
        _menuExit.Text = "종료";
        _menuExit.Click += MenuExit_Click;
        // 
        // _menuEdit
        // 
        _menuEdit.DropDownItems.AddRange(new ToolStripItem[] { _menuUndo, _menuRedo, _menuSepEdit0, _menuDelete, _menuSepEdit1, _menuApplySource, _menuCopySource });
        _menuEdit.Name = "_menuEdit";
        _menuEdit.Size = new Size(57, 20);
        _menuEdit.Text = "편집(&E)";
        // 
        // _menuUndo
        // 
        _menuUndo.Name = "_menuUndo";
        _menuUndo.ShortcutKeys = Keys.Control | Keys.Z;
        _menuUndo.Size = new Size(198, 22);
        _menuUndo.Text = "실행 취소";
        _menuUndo.Click += MenuUndo_Click;
        // 
        // _menuRedo
        // 
        _menuRedo.Name = "_menuRedo";
        _menuRedo.ShortcutKeys = Keys.Control | Keys.Y;
        _menuRedo.Size = new Size(198, 22);
        _menuRedo.Text = "다시 실행";
        _menuRedo.Click += MenuRedo_Click;
        // 
        // _menuSepEdit0
        // 
        _menuSepEdit0.Name = "_menuSepEdit0";
        _menuSepEdit0.Size = new Size(195, 6);
        // 
        // _menuDelete
        // 
        _menuDelete.Name = "_menuDelete";
        _menuDelete.ShortcutKeys = Keys.Delete;
        _menuDelete.Size = new Size(153, 22);
        _menuDelete.Text = "삭제";
        _menuDelete.Click += MenuDelete_Click;
        // 
        // _menuSepEdit1
        // 
        _menuSepEdit1.Name = "_menuSepEdit1";
        _menuSepEdit1.Size = new Size(150, 6);
        // 
        // _menuApplySource
        // 
        _menuApplySource.Name = "_menuApplySource";
        _menuApplySource.Size = new Size(153, 22);
        _menuApplySource.Text = "SVG 소스 적용";
        _menuApplySource.Click += BtnApplySource_Click;
        // 
        // _menuCopySource
        // 
        _menuCopySource.Name = "_menuCopySource";
        _menuCopySource.Size = new Size(153, 22);
        _menuCopySource.Text = "SVG 소스 복사";
        _menuCopySource.Click += BtnCopySource_Click;
        // 
        // _menuTools
        // 
        _menuTools.DropDownItems.AddRange(new ToolStripItem[] { _menuToolSelect, _menuToolRectangle, _menuToolSquare, _menuToolRoundedRect, _menuToolCircle, _menuToolEllipse, _menuToolTriangle, _menuToolDiamond, _menuToolHexagon, _menuToolParallelogram, _menuToolStar, _menuToolLine, _menuToolPolyline, _menuToolPolygon, _menuToolCurve, _menuToolPath, _menuToolText, _menuToolImage });
        _menuTools.Name = "_menuTools";
        _menuTools.Size = new Size(57, 20);
        _menuTools.Text = "도구(&T)";
        // 
        // _menuToolSelect
        // 
        _menuToolSelect.Name = "_menuToolSelect";
        _menuToolSelect.Size = new Size(138, 22);
        _menuToolSelect.Text = "선택";
        // 
        // _menuToolRectangle
        // 
        _menuToolRectangle.Name = "_menuToolRectangle";
        _menuToolRectangle.Size = new Size(138, 22);
        _menuToolRectangle.Text = "사각형";
        // 
        // _menuToolSquare
        // 
        _menuToolSquare.Name = "_menuToolSquare";
        _menuToolSquare.Size = new Size(138, 22);
        _menuToolSquare.Text = "정사각형";
        // 
        // _menuToolRoundedRect
        // 
        _menuToolRoundedRect.Name = "_menuToolRoundedRect";
        _menuToolRoundedRect.Size = new Size(138, 22);
        _menuToolRoundedRect.Text = "둥근 사각형";
        // 
        // _menuToolCircle
        // 
        _menuToolCircle.Name = "_menuToolCircle";
        _menuToolCircle.Size = new Size(138, 22);
        _menuToolCircle.Text = "원";
        // 
        // _menuToolEllipse
        // 
        _menuToolEllipse.Name = "_menuToolEllipse";
        _menuToolEllipse.Size = new Size(138, 22);
        _menuToolEllipse.Text = "타원";
        // 
        // _menuToolTriangle
        // 
        _menuToolTriangle.Name = "_menuToolTriangle";
        _menuToolTriangle.Size = new Size(138, 22);
        _menuToolTriangle.Text = "삼각형";
        // 
        // _menuToolDiamond
        // 
        _menuToolDiamond.Name = "_menuToolDiamond";
        _menuToolDiamond.Size = new Size(138, 22);
        _menuToolDiamond.Text = "마름모";
        // 
        // _menuToolHexagon
        // 
        _menuToolHexagon.Name = "_menuToolHexagon";
        _menuToolHexagon.Size = new Size(138, 22);
        _menuToolHexagon.Text = "육각형";
        // 
        // _menuToolParallelogram
        // 
        _menuToolParallelogram.Name = "_menuToolParallelogram";
        _menuToolParallelogram.Size = new Size(138, 22);
        _menuToolParallelogram.Text = "평행사변형";
        // 
        // _menuToolStar
        // 
        _menuToolStar.Name = "_menuToolStar";
        _menuToolStar.Size = new Size(138, 22);
        _menuToolStar.Text = "별";
        // 
        // _menuToolLine
        // 
        _menuToolLine.Name = "_menuToolLine";
        _menuToolLine.Size = new Size(138, 22);
        _menuToolLine.Text = "선";
        // 
        // _menuToolPolyline
        // 
        _menuToolPolyline.Name = "_menuToolPolyline";
        _menuToolPolyline.Size = new Size(138, 22);
        _menuToolPolyline.Text = "폴리라인";
        // 
        // _menuToolPolygon
        // 
        _menuToolPolygon.Name = "_menuToolPolygon";
        _menuToolPolygon.Size = new Size(138, 22);
        _menuToolPolygon.Text = "폴리곤";
        // 
        // _menuToolCurve
        // 
        _menuToolCurve.Name = "_menuToolCurve";
        _menuToolCurve.Size = new Size(138, 22);
        _menuToolCurve.Text = "곡선 도형";
        // 
        // _menuToolPath
        // 
        _menuToolPath.Name = "_menuToolPath";
        _menuToolPath.Size = new Size(138, 22);
        _menuToolPath.Text = "곡률 경로";
        // 
        // _menuToolText
        // 
        _menuToolText.Name = "_menuToolText";
        _menuToolText.Size = new Size(138, 22);
        _menuToolText.Text = "텍스트";
        // 
        // _menuToolImage
        // 
        _menuToolImage.Name = "_menuToolImage";
        _menuToolImage.Size = new Size(138, 22);
        _menuToolImage.Text = "이미지";
        // 
        // _menuView
        // 
        _menuView.DropDownItems.AddRange(new ToolStripItem[] { _menuZoomIn, _menuZoomOut, _menuZoomReset });
        _menuView.Name = "_menuView";
        _menuView.Size = new Size(59, 20);
        _menuView.Text = "보기(&V)";
        // 
        // _menuZoomIn
        // 
        _menuZoomIn.Name = "_menuZoomIn";
        _menuZoomIn.ShortcutKeys = Keys.Control | Keys.Add;
        _menuZoomIn.Size = new Size(198, 22);
        _menuZoomIn.Text = "확대";
        _menuZoomIn.Click += MenuZoomIn_Click;
        // 
        // _menuZoomOut
        // 
        _menuZoomOut.Name = "_menuZoomOut";
        _menuZoomOut.ShortcutKeys = Keys.Control | Keys.Subtract;
        _menuZoomOut.Size = new Size(198, 22);
        _menuZoomOut.Text = "축소";
        _menuZoomOut.Click += MenuZoomOut_Click;
        // 
        // _menuZoomReset
        // 
        _menuZoomReset.Name = "_menuZoomReset";
        _menuZoomReset.ShortcutKeys = Keys.Control | Keys.D0;
        _menuZoomReset.Size = new Size(198, 22);
        _menuZoomReset.Text = "100%로 재설정";
        _menuZoomReset.Click += MenuZoomReset_Click;
        // 
        // _toolStripMain
        // 
        _toolStripMain.GripStyle = ToolStripGripStyle.Hidden;
        _toolStripMain.Items.AddRange(new ToolStripItem[] { _tbNew, _tbOpen, _tbSave, _tbSaveAs, _tbCanvasSize, _tbExportImage, _tbSepFile1, _tbUndo, _tbRedo, _tbSepEdit0, _tbDelete, _tbSepEdit1, _tbZoomIn, _tbZoomOut, _tbZoomReset, _tbZoomLabel, _tbSepView1, _tbApplySource, _tbCopySource });
        _toolStripMain.Location = new Point(0, 24);
        _toolStripMain.Name = "_toolStripMain";
        _toolStripMain.Padding = new Padding(6, 2, 6, 2);
        _toolStripMain.Size = new Size(1280, 27);
        _toolStripMain.TabIndex = 3;
        // 
        // _tbNew
        // 
        _tbNew.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbNew.ImageScaling = ToolStripItemImageScaling.None;
        _tbNew.Name = "_tbNew";
        _tbNew.Size = new Size(23, 20);
        _tbNew.Text = "새로 만들기";
        _tbNew.Click += MenuNew_Click;
        // 
        // _tbOpen
        // 
        _tbOpen.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbOpen.ImageScaling = ToolStripItemImageScaling.None;
        _tbOpen.Name = "_tbOpen";
        _tbOpen.Size = new Size(23, 20);
        _tbOpen.Text = "열기";
        _tbOpen.Click += MenuOpen_Click;
        // 
        // _tbSave
        // 
        _tbSave.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbSave.ImageScaling = ToolStripItemImageScaling.None;
        _tbSave.Name = "_tbSave";
        _tbSave.Size = new Size(23, 20);
        _tbSave.Text = "저장";
        _tbSave.Click += MenuSave_Click;
        // 
        // _tbSaveAs
        // 
        _tbSaveAs.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbSaveAs.ImageScaling = ToolStripItemImageScaling.None;
        _tbSaveAs.Name = "_tbSaveAs";
        _tbSaveAs.Size = new Size(23, 20);
        _tbSaveAs.Text = "다른 이름으로 저장";
        _tbSaveAs.Click += MenuSaveAs_Click;
        // 
        // _tbCanvasSize
        // 
        _tbCanvasSize.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbCanvasSize.ImageScaling = ToolStripItemImageScaling.None;
        _tbCanvasSize.Name = "_tbCanvasSize";
        _tbCanvasSize.Size = new Size(23, 20);
        _tbCanvasSize.Text = "캔버스 크기";
        _tbCanvasSize.Click += MenuCanvasSize_Click;
        // 
        // _tbExportImage
        // 
        _tbExportImage.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbExportImage.ImageScaling = ToolStripItemImageScaling.None;
        _tbExportImage.Name = "_tbExportImage";
        _tbExportImage.Size = new Size(23, 20);
        _tbExportImage.Text = "이미지로 내보내기";
        _tbExportImage.Click += MenuExportImage_Click;
        // 
        // _tbSepFile1
        // 
        _tbSepFile1.Name = "_tbSepFile1";
        _tbSepFile1.Size = new Size(6, 23);
        // 
        // _tbDelete
        // 
        _tbDelete.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbDelete.ImageScaling = ToolStripItemImageScaling.None;
        _tbDelete.Name = "_tbDelete";
        _tbDelete.Size = new Size(23, 20);
        _tbDelete.Text = "삭제";
        _tbDelete.Click += MenuDelete_Click;
        // 
        // _tbUndo
        // 
        _tbUndo.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbUndo.ImageScaling = ToolStripItemImageScaling.None;
        _tbUndo.Name = "_tbUndo";
        _tbUndo.Size = new Size(23, 20);
        _tbUndo.Text = "실행 취소";
        _tbUndo.Click += MenuUndo_Click;
        // 
        // _tbRedo
        // 
        _tbRedo.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbRedo.ImageScaling = ToolStripItemImageScaling.None;
        _tbRedo.Name = "_tbRedo";
        _tbRedo.Size = new Size(23, 20);
        _tbRedo.Text = "다시 실행";
        _tbRedo.Click += MenuRedo_Click;
        // 
        // _tbSepEdit0
        // 
        _tbSepEdit0.Name = "_tbSepEdit0";
        _tbSepEdit0.Size = new Size(6, 23);
        // 
        // _tbSepEdit1
        // 
        _tbSepEdit1.Name = "_tbSepEdit1";
        _tbSepEdit1.Size = new Size(6, 23);
        // 
        // _tbZoomIn
        // 
        _tbZoomIn.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbZoomIn.ImageScaling = ToolStripItemImageScaling.None;
        _tbZoomIn.Name = "_tbZoomIn";
        _tbZoomIn.Size = new Size(23, 20);
        _tbZoomIn.Text = "확대";
        _tbZoomIn.Click += MenuZoomIn_Click;
        // 
        // _tbZoomOut
        // 
        _tbZoomOut.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbZoomOut.ImageScaling = ToolStripItemImageScaling.None;
        _tbZoomOut.Name = "_tbZoomOut";
        _tbZoomOut.Size = new Size(23, 20);
        _tbZoomOut.Text = "축소";
        _tbZoomOut.Click += MenuZoomOut_Click;
        // 
        // _tbZoomReset
        // 
        _tbZoomReset.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbZoomReset.ImageScaling = ToolStripItemImageScaling.None;
        _tbZoomReset.Name = "_tbZoomReset";
        _tbZoomReset.Size = new Size(23, 20);
        _tbZoomReset.Text = "100%로 재설정";
        _tbZoomReset.Click += MenuZoomReset_Click;
        // 
        // _tbZoomLabel
        // 
        _tbZoomLabel.AutoSize = false;
        _tbZoomLabel.Margin = new Padding(4, 0, 0, 0);
        _tbZoomLabel.Name = "_tbZoomLabel";
        _tbZoomLabel.Size = new Size(44, 20);
        _tbZoomLabel.Text = "100%";
        // 
        // _tbSepView1
        // 
        _tbSepView1.Name = "_tbSepView1";
        _tbSepView1.Size = new Size(6, 23);
        // 
        // _tbApplySource
        // 
        _tbApplySource.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbApplySource.ImageScaling = ToolStripItemImageScaling.None;
        _tbApplySource.Name = "_tbApplySource";
        _tbApplySource.Size = new Size(23, 20);
        _tbApplySource.Text = "SVG 소스 적용";
        _tbApplySource.Click += BtnApplySource_Click;
        // 
        // _tbCopySource
        // 
        _tbCopySource.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tbCopySource.ImageScaling = ToolStripItemImageScaling.None;
        _tbCopySource.Name = "_tbCopySource";
        _tbCopySource.Size = new Size(23, 20);
        _tbCopySource.Text = "SVG 소스 복사";
        _tbCopySource.Click += BtnCopySource_Click;
        // 
        // _splitMain
        // 
        _splitMain.Dock = DockStyle.Fill;
        _splitMain.FixedPanel = FixedPanel.Panel1;
        _splitMain.Location = new Point(0, 51);
        _splitMain.Name = "_splitMain";
        // 
        // _splitMain.Panel1
        // 
        _splitMain.Panel1.Controls.Add(_pnlToolbox);
        _splitMain.Panel1MinSize = 220;
        // 
        // _splitMain.Panel2
        // 
        _splitMain.Panel2.Controls.Add(_splitEditor);
        _splitMain.Size = new Size(1280, 827);
        _splitMain.SplitterDistance = 280;
        _splitMain.TabIndex = 1;
        // 
        // _pnlToolbox
        // 
        _pnlToolbox.Controls.Add(_pnlProperties);
        _pnlToolbox.Controls.Add(_pnlToolboxSectionDivider);
        _pnlToolbox.Controls.Add(_pnlToolboxTop);
        _pnlToolbox.Dock = DockStyle.Fill;
        _pnlToolbox.Location = new Point(0, 0);
        _pnlToolbox.Name = "_pnlToolbox";
        _pnlToolbox.Padding = new Padding(0, 0, 1, 0);
        _pnlToolbox.Size = new Size(280, 827);
        _pnlToolbox.TabIndex = 0;
        // 
        // _pnlProperties
        // 
        _pnlProperties.Controls.Add(_pnlToolOptions);
        _pnlProperties.Controls.Add(_pnlPropertiesHeader);
        _pnlProperties.Dock = DockStyle.Fill;
        _pnlProperties.Location = new Point(0, 101);
        _pnlProperties.Name = "_pnlProperties";
        _pnlProperties.Padding = new Padding(8, 0, 8, 8);
        _pnlProperties.Size = new Size(279, 726);
        _pnlProperties.TabIndex = 2;
        // 
        // _pnlToolOptions
        // 
        _pnlToolOptions.AutoScroll = true;
        _pnlToolOptions.Controls.Add(_chkFontItalic);
        _pnlToolOptions.Controls.Add(_chkFontUnderline);
        _pnlToolOptions.Controls.Add(_chkFontStrikeout);
        _pnlToolOptions.Controls.Add(_chkFontBold);
        _pnlToolOptions.Controls.Add(_numFontSize);
        _pnlToolOptions.Controls.Add(_lblFontSize);
        _pnlToolOptions.Controls.Add(_cmbFontName);
        _pnlToolOptions.Controls.Add(_lblFontName);
        _pnlToolOptions.Controls.Add(_cmbEndMarker);
        _pnlToolOptions.Controls.Add(_lblEndMarker);
        _pnlToolOptions.Controls.Add(_cmbStartMarker);
        _pnlToolOptions.Controls.Add(_lblStartMarker);
        _pnlToolOptions.Controls.Add(_cmbLineStyle);
        _pnlToolOptions.Controls.Add(_lblLineStyle);
        _pnlToolOptions.Controls.Add(_numStrokeOpacity);
        _pnlToolOptions.Controls.Add(_lblStrokeOpacity);
        _pnlToolOptions.Controls.Add(_numStrokeWidth);
        _pnlToolOptions.Controls.Add(_lblStrokeWidth);
        _pnlToolOptions.Controls.Add(_btnStrokeColor);
        _pnlToolOptions.Controls.Add(_lblStrokeColor);
        _pnlToolOptions.Controls.Add(_numFillOpacity);
        _pnlToolOptions.Controls.Add(_lblFillOpacity);
        _pnlToolOptions.Controls.Add(_cmbFillPattern);
        _pnlToolOptions.Controls.Add(_lblFillPattern);
        _pnlToolOptions.Controls.Add(_btnFillColor);
        _pnlToolOptions.Controls.Add(_lblFillColor);
        _pnlToolOptions.Dock = DockStyle.Fill;
        _pnlToolOptions.Location = new Point(8, 28);
        _pnlToolOptions.Name = "_pnlToolOptions";
        _pnlToolOptions.Padding = new Padding(0, 8, 0, 0);
        _pnlToolOptions.Size = new Size(263, 690);
        _pnlToolOptions.TabIndex = 1;
        // 
        // _chkFontItalic
        // 
        _chkFontItalic.AutoSize = true;
        _chkFontItalic.Location = new Point(88, 260);
        _chkFontItalic.Name = "_chkFontItalic";
        _chkFontItalic.Size = new Size(62, 19);
        _chkFontItalic.TabIndex = 25;
        _chkFontItalic.Text = "기울임";
        _chkFontItalic.UseVisualStyleBackColor = true;
        // 
        // _chkFontUnderline
        // 
        _chkFontUnderline.AutoSize = true;
        _chkFontUnderline.Location = new Point(12, 285);
        _chkFontUnderline.Name = "_chkFontUnderline";
        _chkFontUnderline.Size = new Size(50, 19);
        _chkFontUnderline.TabIndex = 26;
        _chkFontUnderline.Text = "밑줄";
        _chkFontUnderline.UseVisualStyleBackColor = true;
        // 
        // _chkFontStrikeout
        // 
        _chkFontStrikeout.AutoSize = true;
        _chkFontStrikeout.Location = new Point(88, 285);
        _chkFontStrikeout.Name = "_chkFontStrikeout";
        _chkFontStrikeout.Size = new Size(62, 19);
        _chkFontStrikeout.TabIndex = 27;
        _chkFontStrikeout.Text = "취소선";
        _chkFontStrikeout.UseVisualStyleBackColor = true;
        // 
        // _chkFontBold
        // 
        _chkFontBold.AutoSize = true;
        _chkFontBold.Location = new Point(12, 260);
        _chkFontBold.Name = "_chkFontBold";
        _chkFontBold.Size = new Size(50, 19);
        _chkFontBold.TabIndex = 24;
        _chkFontBold.Text = "굵게";
        _chkFontBold.UseVisualStyleBackColor = true;
        // 
        // _numFontSize
        // 
        _numFontSize.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _numFontSize.Location = new Point(12, 230);
        _numFontSize.Maximum = new decimal(new int[] { 200, 0, 0, 0 });
        _numFontSize.Minimum = new decimal(new int[] { 6, 0, 0, 0 });
        _numFontSize.Name = "_numFontSize";
        _numFontSize.Size = new Size(221, 23);
        _numFontSize.TabIndex = 23;
        _numFontSize.Value = new decimal(new int[] { 16, 0, 0, 0 });
        // 
        // _lblFontSize
        // 
        _lblFontSize.AutoSize = true;
        _lblFontSize.Location = new Point(12, 212);
        _lblFontSize.Name = "_lblFontSize";
        _lblFontSize.Size = new Size(59, 15);
        _lblFontSize.TabIndex = 22;
        _lblFontSize.Text = "글자 크기";
        // 
        // _cmbFontName
        // 
        _cmbFontName.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbFontName.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbFontName.Location = new Point(12, 180);
        _cmbFontName.Name = "_cmbFontName";
        _cmbFontName.Size = new Size(221, 23);
        _cmbFontName.TabIndex = 21;
        // 
        // _lblFontName
        // 
        _lblFontName.AutoSize = true;
        _lblFontName.Location = new Point(12, 162);
        _lblFontName.Name = "_lblFontName";
        _lblFontName.Size = new Size(31, 15);
        _lblFontName.TabIndex = 20;
        _lblFontName.Text = "폰트";
        // _cmbEndMarker
        // 
        _cmbEndMarker.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbEndMarker.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbEndMarker.Location = new Point(12, 584);
        _cmbEndMarker.Name = "_cmbEndMarker";
        _cmbEndMarker.Size = new Size(221, 23);
        _cmbEndMarker.TabIndex = 17;
        // 
        // _lblEndMarker
        // 
        _lblEndMarker.AutoSize = true;
        _lblEndMarker.Location = new Point(12, 566);
        _lblEndMarker.Name = "_lblEndMarker";
        _lblEndMarker.Size = new Size(31, 15);
        _lblEndMarker.TabIndex = 16;
        _lblEndMarker.Text = "끝점";
        // 
        // _cmbStartMarker
        // 
        _cmbStartMarker.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbStartMarker.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbStartMarker.Location = new Point(12, 534);
        _cmbStartMarker.Name = "_cmbStartMarker";
        _cmbStartMarker.Size = new Size(221, 23);
        _cmbStartMarker.TabIndex = 15;
        // 
        // _lblStartMarker
        // 
        _lblStartMarker.AutoSize = true;
        _lblStartMarker.Location = new Point(12, 516);
        _lblStartMarker.Name = "_lblStartMarker";
        _lblStartMarker.Size = new Size(43, 15);
        _lblStartMarker.TabIndex = 14;
        _lblStartMarker.Text = "시작점";
        // 
        // _cmbLineStyle
        // 
        _cmbLineStyle.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbLineStyle.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbLineStyle.Location = new Point(12, 484);
        _cmbLineStyle.Name = "_cmbLineStyle";
        _cmbLineStyle.Size = new Size(221, 23);
        _cmbLineStyle.TabIndex = 13;
        // 
        // _lblLineStyle
        // 
        _lblLineStyle.AutoSize = true;
        _lblLineStyle.Location = new Point(12, 466);
        _lblLineStyle.Name = "_lblLineStyle";
        _lblLineStyle.Size = new Size(47, 15);
        _lblLineStyle.TabIndex = 12;
        _lblLineStyle.Text = "선 종류";
        // 
        // _numStrokeOpacity
        // 
        _numStrokeOpacity.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _numStrokeOpacity.Location = new Point(12, 386);
        _numStrokeOpacity.Name = "_numStrokeOpacity";
        _numStrokeOpacity.Size = new Size(221, 23);
        _numStrokeOpacity.TabIndex = 9;
        _numStrokeOpacity.Value = new decimal(new int[] { 100, 0, 0, 0 });
        // 
        // _lblStrokeOpacity
        // 
        _lblStrokeOpacity.AutoSize = true;
        _lblStrokeOpacity.Location = new Point(12, 368);
        _lblStrokeOpacity.Name = "_lblStrokeOpacity";
        _lblStrokeOpacity.Size = new Size(93, 15);
        _lblStrokeOpacity.TabIndex = 8;
        _lblStrokeOpacity.Text = "선 불투명도 (%)";
        // 
        // _numStrokeWidth
        // 
        _numStrokeWidth.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _numStrokeWidth.Location = new Point(12, 434);
        _numStrokeWidth.Maximum = new decimal(new int[] { 48, 0, 0, 0 });
        _numStrokeWidth.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        _numStrokeWidth.Name = "_numStrokeWidth";
        _numStrokeWidth.Size = new Size(221, 23);
        _numStrokeWidth.TabIndex = 11;
        _numStrokeWidth.Value = new decimal(new int[] { 2, 0, 0, 0 });
        // 
        // _lblStrokeWidth
        // 
        _lblStrokeWidth.AutoSize = true;
        _lblStrokeWidth.Location = new Point(12, 416);
        _lblStrokeWidth.Name = "_lblStrokeWidth";
        _lblStrokeWidth.Size = new Size(47, 15);
        _lblStrokeWidth.TabIndex = 10;
        _lblStrokeWidth.Text = "선 굵기";
        // 
        // _btnStrokeColor
        // 
        _btnStrokeColor.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _btnStrokeColor.Location = new Point(12, 332);
        _btnStrokeColor.Name = "_btnStrokeColor";
        _btnStrokeColor.Size = new Size(221, 28);
        _btnStrokeColor.TabIndex = 7;
        _btnStrokeColor.UseVisualStyleBackColor = false;
        // 
        // _lblStrokeColor
        // 
        _lblStrokeColor.AutoSize = true;
        _lblStrokeColor.Location = new Point(12, 314);
        _lblStrokeColor.Name = "_lblStrokeColor";
        _lblStrokeColor.Size = new Size(35, 15);
        _lblStrokeColor.TabIndex = 6;
        _lblStrokeColor.Text = "선 색";
        // 
        // _numFillOpacity
        // 
        _numFillOpacity.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _numFillOpacity.Location = new Point(12, 132);
        _numFillOpacity.Name = "_numFillOpacity";
        _numFillOpacity.Size = new Size(221, 23);
        _numFillOpacity.TabIndex = 5;
        _numFillOpacity.Value = new decimal(new int[] { 100, 0, 0, 0 });
        // 
        // _lblFillOpacity
        // 
        _lblFillOpacity.AutoSize = true;
        _lblFillOpacity.Location = new Point(12, 114);
        _lblFillOpacity.Name = "_lblFillOpacity";
        _lblFillOpacity.Size = new Size(117, 15);
        _lblFillOpacity.TabIndex = 4;
        _lblFillOpacity.Text = "채우기 불투명도 (%)";
        // 
        // _cmbFillPattern
        // 
        _cmbFillPattern.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbFillPattern.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbFillPattern.Location = new Point(12, 84);
        _cmbFillPattern.Name = "_cmbFillPattern";
        _cmbFillPattern.Size = new Size(221, 23);
        _cmbFillPattern.TabIndex = 3;
        // 
        // _lblFillPattern
        // 
        _lblFillPattern.AutoSize = true;
        _lblFillPattern.Location = new Point(12, 66);
        _lblFillPattern.Name = "_lblFillPattern";
        _lblFillPattern.Size = new Size(71, 15);
        _lblFillPattern.TabIndex = 2;
        _lblFillPattern.Text = "채우기 패턴";
        // 
        // _btnFillColor
        // 
        _btnFillColor.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _btnFillColor.Location = new Point(12, 30);
        _btnFillColor.Name = "_btnFillColor";
        _btnFillColor.Size = new Size(221, 28);
        _btnFillColor.TabIndex = 1;
        _btnFillColor.UseVisualStyleBackColor = false;
        // 
        // _lblFillColor
        // 
        _lblFillColor.AutoSize = true;
        _lblFillColor.Location = new Point(12, 12);
        _lblFillColor.Name = "_lblFillColor";
        _lblFillColor.Size = new Size(59, 15);
        _lblFillColor.TabIndex = 0;
        _lblFillColor.Text = "채우기 색";
        // 
        // _pnlPropertiesHeader
        // 
        _pnlPropertiesHeader.Controls.Add(_lblPropertiesTitle);
        _pnlPropertiesHeader.Dock = DockStyle.Top;
        _pnlPropertiesHeader.Location = new Point(8, 0);
        _pnlPropertiesHeader.Name = "_pnlPropertiesHeader";
        _pnlPropertiesHeader.Size = new Size(263, 28);
        _pnlPropertiesHeader.TabIndex = 0;
        // 
        // _lblPropertiesTitle
        // 
        _lblPropertiesTitle.Dock = DockStyle.Top;
        _lblPropertiesTitle.Location = new Point(0, 0);
        _lblPropertiesTitle.Name = "_lblPropertiesTitle";
        _lblPropertiesTitle.Padding = new Padding(0, 4, 0, 0);
        _lblPropertiesTitle.Size = new Size(263, 28);
        _lblPropertiesTitle.TabIndex = 0;
        _lblPropertiesTitle.Text = "속성";
        _lblPropertiesTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // _pnlToolboxSectionDivider
        // 
        _pnlToolboxSectionDivider.Dock = DockStyle.Top;
        _pnlToolboxSectionDivider.Location = new Point(0, 100);
        _pnlToolboxSectionDivider.Name = "_pnlToolboxSectionDivider";
        _pnlToolboxSectionDivider.Size = new Size(279, 1);
        _pnlToolboxSectionDivider.TabIndex = 3;
        // 
        // _pnlToolboxTop
        // 
        _pnlToolboxTop.AutoSize = true;
        _pnlToolboxTop.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        _pnlToolboxTop.Controls.Add(_lblToolboxTitle);
        _pnlToolboxTop.Controls.Add(_pnlToolGridHost);
        _pnlToolboxTop.Dock = DockStyle.Top;
        _pnlToolboxTop.FlowDirection = FlowDirection.TopDown;
        _pnlToolboxTop.Location = new Point(0, 0);
        _pnlToolboxTop.Margin = new Padding(0);
        _pnlToolboxTop.Name = "_pnlToolboxTop";
        _pnlToolboxTop.Size = new Size(279, 100);
        _pnlToolboxTop.TabIndex = 4;
        _pnlToolboxTop.WrapContents = false;
        // 
        // _lblToolboxTitle
        // 
        _lblToolboxTitle.Location = new Point(0, 0);
        _lblToolboxTitle.Margin = new Padding(0);
        _lblToolboxTitle.Name = "_lblToolboxTitle";
        _lblToolboxTitle.Size = new Size(279, 36);
        _lblToolboxTitle.TabIndex = 0;
        _lblToolboxTitle.Text = "도구";
        _lblToolboxTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // _pnlToolGridHost
        // 
        _pnlToolGridHost.Controls.Add(_toolStripTools);
        _pnlToolGridHost.Location = new Point(0, 36);
        _pnlToolGridHost.Margin = new Padding(0);
        _pnlToolGridHost.Name = "_pnlToolGridHost";
        _pnlToolGridHost.Size = new Size(263, 64);
        _pnlToolGridHost.TabIndex = 1;
        // 
        // _toolStripTools
        // 
        _toolStripTools.GripStyle = ToolStripGripStyle.Hidden;
        _toolStripTools.Items.AddRange(new ToolStripItem[] { _btnSelect, _btnRectangle, _btnSquare, _btnRoundedRect, _btnCircle, _btnEllipse, _btnTriangle, _btnDiamond, _btnHexagon, _btnParallelogram, _btnStar, _btnLine, _btnPolyline, _btnPolygon, _btnCurve, _btnPath, _btnText, _btnImage });
        _toolStripTools.LayoutStyle = ToolStripLayoutStyle.Flow;
        _toolStripTools.Location = new Point(0, 0);
        _toolStripTools.Name = "_toolStripTools";
        _toolStripTools.Padding = new Padding(8, 6, 8, 6);
        _toolStripTools.Size = new Size(263, 74);
        _toolStripTools.TabIndex = 0;
        // 
        // _btnSelect
        // 
        _btnSelect.AutoSize = false;
        _btnSelect.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnSelect.ImageScaling = ToolStripItemImageScaling.None;
        _btnSelect.Name = "_btnSelect";
        _btnSelect.Size = new Size(28, 28);
        // 
        // _btnRectangle
        // 
        _btnRectangle.AutoSize = false;
        _btnRectangle.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnRectangle.ImageScaling = ToolStripItemImageScaling.None;
        _btnRectangle.Name = "_btnRectangle";
        _btnRectangle.Size = new Size(28, 28);
        // 
        // _btnSquare
        // 
        _btnSquare.AutoSize = false;
        _btnSquare.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnSquare.ImageScaling = ToolStripItemImageScaling.None;
        _btnSquare.Name = "_btnSquare";
        _btnSquare.Size = new Size(28, 28);
        // 
        // _btnRoundedRect
        // 
        _btnRoundedRect.AutoSize = false;
        _btnRoundedRect.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnRoundedRect.ImageScaling = ToolStripItemImageScaling.None;
        _btnRoundedRect.Name = "_btnRoundedRect";
        _btnRoundedRect.Size = new Size(28, 28);
        // 
        // _btnCircle
        // 
        _btnCircle.AutoSize = false;
        _btnCircle.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnCircle.ImageScaling = ToolStripItemImageScaling.None;
        _btnCircle.Name = "_btnCircle";
        _btnCircle.Size = new Size(28, 28);
        // 
        // _btnEllipse
        // 
        _btnEllipse.AutoSize = false;
        _btnEllipse.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnEllipse.ImageScaling = ToolStripItemImageScaling.None;
        _btnEllipse.Name = "_btnEllipse";
        _btnEllipse.Size = new Size(28, 28);
        // 
        // _btnTriangle
        // 
        _btnTriangle.AutoSize = false;
        _btnTriangle.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnTriangle.ImageScaling = ToolStripItemImageScaling.None;
        _btnTriangle.Name = "_btnTriangle";
        _btnTriangle.Size = new Size(28, 28);
        // 
        // _btnDiamond
        // 
        _btnDiamond.AutoSize = false;
        _btnDiamond.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnDiamond.ImageScaling = ToolStripItemImageScaling.None;
        _btnDiamond.Name = "_btnDiamond";
        _btnDiamond.Size = new Size(28, 28);
        // 
        // _btnHexagon
        // 
        _btnHexagon.AutoSize = false;
        _btnHexagon.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnHexagon.ImageScaling = ToolStripItemImageScaling.None;
        _btnHexagon.Name = "_btnHexagon";
        _btnHexagon.Size = new Size(28, 28);
        // 
        // _btnParallelogram
        // 
        _btnParallelogram.AutoSize = false;
        _btnParallelogram.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnParallelogram.ImageScaling = ToolStripItemImageScaling.None;
        _btnParallelogram.Name = "_btnParallelogram";
        _btnParallelogram.Size = new Size(28, 28);
        // 
        // _btnStar
        // 
        _btnStar.AutoSize = false;
        _btnStar.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnStar.ImageScaling = ToolStripItemImageScaling.None;
        _btnStar.Name = "_btnStar";
        _btnStar.Size = new Size(28, 28);
        // 
        // _btnLine
        // 
        _btnLine.AutoSize = false;
        _btnLine.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnLine.ImageScaling = ToolStripItemImageScaling.None;
        _btnLine.Name = "_btnLine";
        _btnLine.Size = new Size(28, 28);
        // 
        // _btnPolyline
        // 
        _btnPolyline.AutoSize = false;
        _btnPolyline.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnPolyline.ImageScaling = ToolStripItemImageScaling.None;
        _btnPolyline.Name = "_btnPolyline";
        _btnPolyline.Size = new Size(28, 28);
        // 
        // _btnPolygon
        // 
        _btnPolygon.AutoSize = false;
        _btnPolygon.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnPolygon.ImageScaling = ToolStripItemImageScaling.None;
        _btnPolygon.Name = "_btnPolygon";
        _btnPolygon.Size = new Size(28, 28);
        // 
        // _btnCurve
        // 
        _btnCurve.AutoSize = false;
        _btnCurve.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnCurve.ImageScaling = ToolStripItemImageScaling.None;
        _btnCurve.Name = "_btnCurve";
        _btnCurve.Size = new Size(28, 28);
        // 
        // _btnPath
        // 
        _btnPath.AutoSize = false;
        _btnPath.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnPath.ImageScaling = ToolStripItemImageScaling.None;
        _btnPath.Name = "_btnPath";
        _btnPath.Size = new Size(28, 28);
        // 
        // _btnText
        // 
        _btnText.AutoSize = false;
        _btnText.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnText.ImageScaling = ToolStripItemImageScaling.None;
        _btnText.Name = "_btnText";
        _btnText.Size = new Size(28, 28);
        // 
        // _btnImage
        // 
        _btnImage.AutoSize = false;
        _btnImage.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _btnImage.ImageScaling = ToolStripItemImageScaling.None;
        _btnImage.Name = "_btnImage";
        _btnImage.Size = new Size(28, 28);
        // 
        // _splitEditor
        // 
        _splitEditor.Dock = DockStyle.Fill;
        _splitEditor.FixedPanel = FixedPanel.Panel2;
        _splitEditor.Location = new Point(0, 0);
        _splitEditor.Name = "_splitEditor";
        // 
        // _splitEditor.Panel1
        // 
        _splitEditor.Panel1.Controls.Add(_pnlCanvasHost);
        // 
        // _splitEditor.Panel2
        // 
        _splitEditor.Panel2.Controls.Add(_pnlSource);
        _splitEditor.Panel2MinSize = 260;
        _splitEditor.Size = new Size(996, 827);
        _splitEditor.SplitterDistance = 676;
        _splitEditor.TabIndex = 0;
        // 
        // _pnlCanvasHost
        // 
        _pnlCanvasHost.Controls.Add(_canvas);
        _pnlCanvasHost.Dock = DockStyle.Fill;
        _pnlCanvasHost.Location = new Point(0, 0);
        _pnlCanvasHost.Name = "_pnlCanvasHost";
        _pnlCanvasHost.Padding = new Padding(6);
        _pnlCanvasHost.Size = new Size(676, 827);
        _pnlCanvasHost.TabIndex = 0;
        // 
        // _canvas
        // 
        _canvas.BackColor = Color.FromArgb(210, 215, 222);
        _canvas.Dock = DockStyle.Fill;
        _canvas.Location = new Point(6, 6);
        _canvas.Name = "_canvas";
        _canvas.Size = new Size(664, 815);
        _canvas.TabIndex = 0;
        // 
        // _pnlSource
        // 
        _pnlSource.Controls.Add(_pnlSourceEditor);
        _pnlSource.Controls.Add(_pnlSourceHeader);
        _pnlSource.Dock = DockStyle.Fill;
        _pnlSource.Location = new Point(0, 0);
        _pnlSource.Name = "_pnlSource";
        _pnlSource.Padding = new Padding(12);
        _pnlSource.Size = new Size(316, 827);
        _pnlSource.TabIndex = 0;
        // 
        // _pnlSourceEditor
        // 
        _pnlSourceEditor.Controls.Add(_txtSvgSource);
        _pnlSourceEditor.Dock = DockStyle.Fill;
        _pnlSourceEditor.Location = new Point(12, 48);
        _pnlSourceEditor.Name = "_pnlSourceEditor";
        _pnlSourceEditor.Padding = new Padding(1);
        _pnlSourceEditor.Size = new Size(292, 767);
        _pnlSourceEditor.TabIndex = 1;
        // 
        // _txtSvgSource
        // 
        _txtSvgSource.BorderStyle = BorderStyle.None;
        _txtSvgSource.DetectUrls = false;
        _txtSvgSource.Dock = DockStyle.Fill;
        _txtSvgSource.Location = new Point(1, 1);
        _txtSvgSource.Name = "_txtSvgSource";
        _txtSvgSource.Size = new Size(290, 765);
        _txtSvgSource.TabIndex = 0;
        _txtSvgSource.Text = "";
        _txtSvgSource.WordWrap = false;
        // 
        // _pnlSourceHeader
        // 
        _pnlSourceHeader.Controls.Add(_lblSourceTitle);
        _pnlSourceHeader.Controls.Add(_pnlSourceButtons);
        _pnlSourceHeader.Dock = DockStyle.Top;
        _pnlSourceHeader.Location = new Point(12, 12);
        _pnlSourceHeader.Name = "_pnlSourceHeader";
        _pnlSourceHeader.Padding = new Padding(0, 4, 0, 4);
        _pnlSourceHeader.Size = new Size(292, 36);
        _pnlSourceHeader.TabIndex = 0;
        // 
        // _lblSourceTitle
        // 
        _lblSourceTitle.Dock = DockStyle.Fill;
        _lblSourceTitle.Location = new Point(0, 4);
        _lblSourceTitle.Name = "_lblSourceTitle";
        _lblSourceTitle.Padding = new Padding(0, 0, 8, 0);
        _lblSourceTitle.Size = new Size(184, 28);
        _lblSourceTitle.TabIndex = 0;
        _lblSourceTitle.Text = "SVG 소스";
        _lblSourceTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // _pnlSourceButtons
        // 
        _pnlSourceButtons.Controls.Add(_btnCopySource);
        _pnlSourceButtons.Controls.Add(_btnApplySource);
        _pnlSourceButtons.Dock = DockStyle.Right;
        _pnlSourceButtons.Location = new Point(184, 4);
        _pnlSourceButtons.Name = "_pnlSourceButtons";
        _pnlSourceButtons.Size = new Size(108, 28);
        _pnlSourceButtons.TabIndex = 1;
        // 
        // _btnCopySource
        // 
        _btnCopySource.Location = new Point(0, 2);
        _btnCopySource.Name = "_btnCopySource";
        _btnCopySource.Size = new Size(50, 24);
        _btnCopySource.TabIndex = 0;
        _btnCopySource.Text = "복사";
        _btnCopySource.UseVisualStyleBackColor = false;
        _btnCopySource.Click += BtnCopySource_Click;
        // 
        // _btnApplySource
        // 
        _btnApplySource.Location = new Point(54, 2);
        _btnApplySource.Name = "_btnApplySource";
        _btnApplySource.Size = new Size(50, 24);
        _btnApplySource.TabIndex = 1;
        _btnApplySource.Text = "적용";
        _btnApplySource.UseVisualStyleBackColor = false;
        _btnApplySource.Click += BtnApplySource_Click;
        // 
        // _statusStrip
        // 
        _statusStrip.Items.AddRange(new ToolStripItem[] { _statusLabel, _statusZoomLabel });
        _statusStrip.Location = new Point(0, 878);
        _statusStrip.Name = "_statusStrip";
        _statusStrip.Size = new Size(1280, 22);
        _statusStrip.TabIndex = 2;
        // 
        // _statusLabel
        // 
        _statusLabel.Name = "_statusLabel";
        _statusLabel.Size = new Size(1227, 17);
        _statusLabel.Spring = true;
        _statusLabel.Text = "Ready";
        _statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // _statusZoomLabel
        // 
        _statusZoomLabel.Name = "_statusZoomLabel";
        _statusZoomLabel.Size = new Size(38, 17);
        _statusZoomLabel.Text = "100%";
        _statusZoomLabel.TextAlign = ContentAlignment.MiddleRight;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1280, 900);
        Controls.Add(_splitMain);
        Controls.Add(_statusStrip);
        Controls.Add(_toolStripMain);
        Controls.Add(_menuStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = _menuStrip;
        MinimumSize = new Size(960, 640);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "SVG Editor";
        _menuStrip.ResumeLayout(false);
        _menuStrip.PerformLayout();
        _toolStripMain.ResumeLayout(false);
        _toolStripMain.PerformLayout();
        _splitMain.Panel1.ResumeLayout(false);
        _splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_splitMain).EndInit();
        _splitMain.ResumeLayout(false);
        _pnlToolbox.ResumeLayout(false);
        _pnlToolbox.PerformLayout();
        _pnlProperties.ResumeLayout(false);
        _pnlToolOptions.ResumeLayout(false);
        _pnlToolOptions.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)_numFontSize).EndInit();
        ((System.ComponentModel.ISupportInitialize)_numStrokeOpacity).EndInit();
        ((System.ComponentModel.ISupportInitialize)_numStrokeWidth).EndInit();
        ((System.ComponentModel.ISupportInitialize)_numFillOpacity).EndInit();
        _pnlPropertiesHeader.ResumeLayout(false);
        _pnlToolboxTop.ResumeLayout(false);
        _pnlToolGridHost.ResumeLayout(false);
        _pnlToolGridHost.PerformLayout();
        _toolStripTools.ResumeLayout(false);
        _toolStripTools.PerformLayout();
        _splitEditor.Panel1.ResumeLayout(false);
        _splitEditor.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_splitEditor).EndInit();
        _splitEditor.ResumeLayout(false);
        _pnlCanvasHost.ResumeLayout(false);
        _pnlSource.ResumeLayout(false);
        _pnlSourceEditor.ResumeLayout(false);
        _pnlSourceHeader.ResumeLayout(false);
        _pnlSourceButtons.ResumeLayout(false);
        _statusStrip.ResumeLayout(false);
        _statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
