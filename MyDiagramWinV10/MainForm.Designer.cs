namespace MyDiagramWinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    private MenuStrip _menuStrip;
    private ToolStripMenuItem _menuFile;
    private ToolStripMenuItem _menuNew;
    private ToolStripMenuItem _menuTemplate;
    private ToolStripMenuItem _menuTemplateOrgBasic;
    private ToolStripMenuItem _menuTemplateOrgDepartment;
    private ToolStripMenuItem _menuTemplateOrgProject;
    private ToolStripMenuItem _menuTemplateFlowchart;
    private ToolStripMenuItem _menuTemplateProcess;
    private ToolStripMenuItem _menuTemplateNetwork;
    private ToolStripMenuItem _menuOpen;
    private ToolStripMenuItem _menuSave;
    private ToolStripMenuItem _menuSaveAs;
    private ToolStripMenuItem _menuExport;
    private ToolStripMenuItem _menuExportImage;
    private ToolStripMenuItem _menuExportSvg;
    private ToolStripMenuItem _menuExportPdf;
    private ToolStripMenuItem _menuExit;
    private ToolStripMenuItem _menuEdit;
    private ToolStripMenuItem _menuUndo;
    private ToolStripMenuItem _menuRedo;
    private ToolStripMenuItem _menuDelete;
    private ToolStripMenuItem _menuView;
    private ToolStripMenuItem _menuZoomIn;
    private ToolStripMenuItem _menuZoomOut;
    private ToolStripMenuItem _menuZoomReset;
    private ToolStrip _toolStrip;
    private ToolStripButton _btnSelect;
    private ToolStripButton _btnRectangle;
    private ToolStripButton _btnRoundedRect;
    private ToolStripButton _btnEllipse;
    private ToolStripButton _btnDiamond;
    private ToolStripButton _btnTriangle;
    private ToolStripButton _btnParallelogram;
    private ToolStripButton _btnHexagon;
    private ToolStripSeparator _sepShapes;
    private ToolStripButton _btnLineStraight;
    private ToolStripButton _btnLineOrthogonal;
    private ToolStripButton _btnLineCurved;
    private ToolStripSeparator _sepLines;
    private ToolStripSeparator _sepZoom;
    private ToolStripButton _btnZoomIn;
    private ToolStripButton _btnZoomOut;
    private ToolStripButton _btnZoomReset;
    private SplitContainer _splitMain;
    private SplitContainer _splitEditor;
    private Panel _pnlToolbox;
    private Label _lblToolboxTitle;
    private Panel _pnlProperties;
    private Label _lblPropertyTitle;
    private GroupBox _grpShape;
    private Label _lblShapeText;
    private TextBox _txtShapeText;
    private Label _lblShapeWidth;
    private NumericUpDown _numShapeWidth;
    private Label _lblShapeHeight;
    private NumericUpDown _numShapeHeight;
    private Label _lblFillColor;
    private Button _btnFillColor;
    private Label _lblBorderColor;
    private Button _btnBorderColor;
    private Label _lblTextColor;
    private Button _btnTextColor;
    private Label _lblBorderWidth;
    private NumericUpDown _numBorderWidth;
    private Label _lblBorderStyle;
    private ComboBox _cmbBorderStyle;
    private Label _lblFont;
    private ComboBox _cmbFont;
    private Label _lblFontSize;
    private NumericUpDown _numFontSize;
    private CheckBox _chkFontBold;
    private Button _btnSetImage;
    private Button _btnClearImage;
    private GroupBox _grpConnector;
    private Label _lblLineColor;
    private Button _btnLineColor;
    private Label _lblLineWidth;
    private NumericUpDown _numLineWidth;
    private Label _lblLineStyle;
    private ComboBox _cmbLineStyle;
    private Label _lblConnectorKind;
    private ComboBox _cmbConnectorKind;
    private Label _lblStartArrow;
    private ComboBox _cmbStartArrow;
    private Label _lblEndArrow;
    private ComboBox _cmbEndArrow;
    private Label _lblConnectorLabel;
    private TextBox _txtConnectorLabel;
    private Panel _pnlCanvasHost;
    private MyDiagramWinV10.Controls.DiagramCanvas _canvas;
    private MyDiagramWinV10.Controls.DiagramToolbox _toolbox;
    private StatusStrip _statusStrip;
    private ToolStripStatusLabel _statusLabel;

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
        _menuTemplate = new ToolStripMenuItem();
        _menuTemplateOrgBasic = new ToolStripMenuItem();
        _menuTemplateOrgDepartment = new ToolStripMenuItem();
        _menuTemplateOrgProject = new ToolStripMenuItem();
        _menuTemplateFlowchart = new ToolStripMenuItem();
        _menuTemplateProcess = new ToolStripMenuItem();
        _menuTemplateNetwork = new ToolStripMenuItem();
        _menuOpen = new ToolStripMenuItem();
        _menuSave = new ToolStripMenuItem();
        _menuSaveAs = new ToolStripMenuItem();
        _menuExport = new ToolStripMenuItem();
        _menuExportImage = new ToolStripMenuItem();
        _menuExportSvg = new ToolStripMenuItem();
        _menuExportPdf = new ToolStripMenuItem();
        _menuExit = new ToolStripMenuItem();
        _menuEdit = new ToolStripMenuItem();
        _menuUndo = new ToolStripMenuItem();
        _menuRedo = new ToolStripMenuItem();
        _menuDelete = new ToolStripMenuItem();
        _menuView = new ToolStripMenuItem();
        _menuZoomIn = new ToolStripMenuItem();
        _menuZoomOut = new ToolStripMenuItem();
        _menuZoomReset = new ToolStripMenuItem();
        _toolStrip = new ToolStrip();
        _btnSelect = new ToolStripButton();
        _sepShapes = new ToolStripSeparator();
        _btnRectangle = new ToolStripButton();
        _btnRoundedRect = new ToolStripButton();
        _btnEllipse = new ToolStripButton();
        _btnDiamond = new ToolStripButton();
        _btnTriangle = new ToolStripButton();
        _btnParallelogram = new ToolStripButton();
        _btnHexagon = new ToolStripButton();
        _sepLines = new ToolStripSeparator();
        _btnLineStraight = new ToolStripButton();
        _btnLineOrthogonal = new ToolStripButton();
        _btnLineCurved = new ToolStripButton();
        _sepZoom = new ToolStripSeparator();
        _btnZoomIn = new ToolStripButton();
        _btnZoomOut = new ToolStripButton();
        _btnZoomReset = new ToolStripButton();
        _splitMain = new SplitContainer();
        _pnlToolbox = new Panel();
        _lblToolboxTitle = new Label();
        _toolbox = new MyDiagramWinV10.Controls.DiagramToolbox();
        _splitEditor = new SplitContainer();
        _pnlCanvasHost = new Panel();
        _canvas = new MyDiagramWinV10.Controls.DiagramCanvas();
        _pnlProperties = new Panel();
        _grpConnector = new GroupBox();
        _txtConnectorLabel = new TextBox();
        _lblConnectorLabel = new Label();
        _cmbEndArrow = new ComboBox();
        _lblEndArrow = new Label();
        _cmbStartArrow = new ComboBox();
        _lblStartArrow = new Label();
        _cmbConnectorKind = new ComboBox();
        _lblConnectorKind = new Label();
        _cmbLineStyle = new ComboBox();
        _lblLineStyle = new Label();
        _numLineWidth = new NumericUpDown();
        _lblLineWidth = new Label();
        _btnLineColor = new Button();
        _lblLineColor = new Label();
        _grpShape = new GroupBox();
        _btnClearImage = new Button();
        _btnSetImage = new Button();
        _chkFontBold = new CheckBox();
        _numFontSize = new NumericUpDown();
        _lblFontSize = new Label();
        _cmbFont = new ComboBox();
        _lblFont = new Label();
        _cmbBorderStyle = new ComboBox();
        _lblBorderStyle = new Label();
        _numBorderWidth = new NumericUpDown();
        _lblBorderWidth = new Label();
        _btnTextColor = new Button();
        _lblTextColor = new Label();
        _btnBorderColor = new Button();
        _lblBorderColor = new Label();
        _btnFillColor = new Button();
        _lblFillColor = new Label();
        _numShapeHeight = new NumericUpDown();
        _lblShapeHeight = new Label();
        _numShapeWidth = new NumericUpDown();
        _lblShapeWidth = new Label();
        _txtShapeText = new TextBox();
        _lblShapeText = new Label();
        _lblPropertyTitle = new Label();
        _statusStrip = new StatusStrip();
        _statusLabel = new ToolStripStatusLabel();
        _menuStrip.SuspendLayout();
        _toolStrip.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitMain).BeginInit();
        _splitMain.Panel1.SuspendLayout();
        _splitMain.Panel2.SuspendLayout();
        _splitMain.SuspendLayout();
        _pnlToolbox.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitEditor).BeginInit();
        _splitEditor.Panel1.SuspendLayout();
        _splitEditor.Panel2.SuspendLayout();
        _splitEditor.SuspendLayout();
        _pnlCanvasHost.SuspendLayout();
        _pnlProperties.SuspendLayout();
        _grpConnector.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_numLineWidth).BeginInit();
        _grpShape.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_numFontSize).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_numBorderWidth).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_numShapeHeight).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_numShapeWidth).BeginInit();
        _statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // _menuStrip
        // 
        _menuStrip.Items.AddRange(new ToolStripItem[] { _menuFile, _menuEdit, _menuView });
        _menuStrip.Location = new Point(0, 0);
        _menuStrip.Name = "_menuStrip";
        _menuStrip.Size = new Size(1303, 24);
        _menuStrip.TabIndex = 0;
        // 
        // _menuFile
        // 
        _menuFile.DropDownItems.AddRange(new ToolStripItem[] { _menuNew, _menuTemplate, _menuOpen, _menuSave, _menuSaveAs, _menuExport, _menuExit });
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
        // _menuTemplate
        // 
        _menuTemplate.DropDownItems.AddRange(new ToolStripItem[] { _menuTemplateOrgBasic, _menuTemplateOrgDepartment, _menuTemplateOrgProject, _menuTemplateFlowchart, _menuTemplateProcess, _menuTemplateNetwork });
        _menuTemplate.Name = "_menuTemplate";
        _menuTemplate.Size = new Size(187, 22);
        _menuTemplate.Text = "템플릿";
        // 
        // _menuTemplateOrgBasic
        // 
        _menuTemplateOrgBasic.Name = "_menuTemplateOrgBasic";
        _menuTemplateOrgBasic.Size = new Size(182, 22);
        _menuTemplateOrgBasic.Text = "조직도 (기본 3단)";
        _menuTemplateOrgBasic.Click += MenuTemplateOrgBasic_Click;
        // 
        // _menuTemplateOrgDepartment
        // 
        _menuTemplateOrgDepartment.Name = "_menuTemplateOrgDepartment";
        _menuTemplateOrgDepartment.Size = new Size(182, 22);
        _menuTemplateOrgDepartment.Text = "조직도 (부서형)";
        _menuTemplateOrgDepartment.Click += MenuTemplateOrgDepartment_Click;
        // 
        // _menuTemplateOrgProject
        // 
        _menuTemplateOrgProject.Name = "_menuTemplateOrgProject";
        _menuTemplateOrgProject.Size = new Size(182, 22);
        _menuTemplateOrgProject.Text = "조직도 (프로젝트팀)";
        _menuTemplateOrgProject.Click += MenuTemplateOrgProject_Click;
        // 
        // _menuTemplateFlowchart
        // 
        _menuTemplateFlowchart.Name = "_menuTemplateFlowchart";
        _menuTemplateFlowchart.Size = new Size(182, 22);
        _menuTemplateFlowchart.Text = "플로우차트 (기본)";
        _menuTemplateFlowchart.Click += MenuTemplateFlowchart_Click;
        // 
        // _menuTemplateProcess
        // 
        _menuTemplateProcess.Name = "_menuTemplateProcess";
        _menuTemplateProcess.Size = new Size(182, 22);
        _menuTemplateProcess.Text = "순차 프로세스";
        _menuTemplateProcess.Click += MenuTemplateProcess_Click;
        // 
        // _menuTemplateNetwork
        // 
        _menuTemplateNetwork.Name = "_menuTemplateNetwork";
        _menuTemplateNetwork.Size = new Size(182, 22);
        _menuTemplateNetwork.Text = "네트워크 (기본)";
        _menuTemplateNetwork.Click += MenuTemplateNetwork_Click;
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
        // _menuExport
        // 
        _menuExport.DropDownItems.AddRange(new ToolStripItem[] { _menuExportImage, _menuExportSvg, _menuExportPdf });
        _menuExport.Name = "_menuExport";
        _menuExport.Size = new Size(187, 22);
        _menuExport.Text = "보내기";
        // 
        // _menuExportImage
        // 
        _menuExportImage.Name = "_menuExportImage";
        _menuExportImage.Size = new Size(171, 22);
        _menuExportImage.Text = "이미지로 보내기...";
        _menuExportImage.Click += MenuExportImage_Click;
        // 
        // _menuExportSvg
        // 
        _menuExportSvg.Name = "_menuExportSvg";
        _menuExportSvg.Size = new Size(171, 22);
        _menuExportSvg.Text = "SVG로 보내기...";
        _menuExportSvg.Click += MenuExportSvg_Click;
        // 
        // _menuExportPdf
        // 
        _menuExportPdf.Name = "_menuExportPdf";
        _menuExportPdf.Size = new Size(171, 22);
        _menuExportPdf.Text = "PDF로 보내기...";
        _menuExportPdf.Click += MenuExportPdf_Click;
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
        _menuEdit.DropDownItems.AddRange(new ToolStripItem[] { _menuUndo, _menuRedo, _menuDelete });
        _menuEdit.Name = "_menuEdit";
        _menuEdit.Size = new Size(57, 20);
        _menuEdit.Text = "편집(&E)";
        // 
        // _menuUndo
        // 
        _menuUndo.Name = "_menuUndo";
        _menuUndo.ShortcutKeys = Keys.Control | Keys.Z;
        _menuUndo.Size = new Size(167, 22);
        _menuUndo.Text = "실행 취소";
        _menuUndo.Click += MenuUndo_Click;
        // 
        // _menuRedo
        // 
        _menuRedo.Name = "_menuRedo";
        _menuRedo.ShortcutKeys = Keys.Control | Keys.Y;
        _menuRedo.Size = new Size(167, 22);
        _menuRedo.Text = "다시 실행";
        _menuRedo.Click += MenuRedo_Click;
        // 
        // _menuDelete
        // 
        _menuDelete.Name = "_menuDelete";
        _menuDelete.ShortcutKeys = Keys.Delete;
        _menuDelete.Size = new Size(167, 22);
        _menuDelete.Text = "삭제";
        _menuDelete.Click += MenuDelete_Click;
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
        // _toolStrip
        // 
        _toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        _toolStrip.Items.AddRange(new ToolStripItem[] { _btnSelect, _sepShapes, _btnRectangle, _btnRoundedRect, _btnEllipse, _btnDiamond, _btnTriangle, _btnParallelogram, _btnHexagon, _sepLines, _btnLineStraight, _btnLineOrthogonal, _btnLineCurved, _sepZoom, _btnZoomIn, _btnZoomOut, _btnZoomReset });
        _toolStrip.Location = new Point(0, 24);
        _toolStrip.Name = "_toolStrip";
        _toolStrip.Size = new Size(1303, 25);
        _toolStrip.TabIndex = 1;
        // 
        // _btnSelect
        // 
        _btnSelect.CheckOnClick = true;
        _btnSelect.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnSelect.Name = "_btnSelect";
        _btnSelect.Size = new Size(50, 22);
        _btnSelect.Text = "↖ 선택";
        _btnSelect.ToolTipText = "선택 도구 (Esc)";
        _btnSelect.Click += BtnSelect_Click;
        // 
        // _sepShapes
        // 
        _sepShapes.Name = "_sepShapes";
        _sepShapes.Size = new Size(6, 25);
        // 
        // _btnRectangle
        // 
        _btnRectangle.CheckOnClick = true;
        _btnRectangle.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnRectangle.Name = "_btnRectangle";
        _btnRectangle.Size = new Size(23, 22);
        _btnRectangle.Text = "□";
        _btnRectangle.ToolTipText = "사각형";
        _btnRectangle.Click += BtnRectangle_Click;
        // 
        // _btnRoundedRect
        // 
        _btnRoundedRect.CheckOnClick = true;
        _btnRoundedRect.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnRoundedRect.Name = "_btnRoundedRect";
        _btnRoundedRect.Size = new Size(23, 22);
        _btnRoundedRect.Text = "▢";
        _btnRoundedRect.ToolTipText = "둥근 사각형";
        _btnRoundedRect.Click += BtnRoundedRect_Click;
        // 
        // _btnEllipse
        // 
        _btnEllipse.CheckOnClick = true;
        _btnEllipse.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnEllipse.Name = "_btnEllipse";
        _btnEllipse.Size = new Size(23, 22);
        _btnEllipse.Text = "○";
        _btnEllipse.ToolTipText = "타원";
        _btnEllipse.Click += BtnEllipse_Click;
        // 
        // _btnDiamond
        // 
        _btnDiamond.CheckOnClick = true;
        _btnDiamond.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnDiamond.Name = "_btnDiamond";
        _btnDiamond.Size = new Size(23, 22);
        _btnDiamond.Text = "◇";
        _btnDiamond.ToolTipText = "마름모";
        _btnDiamond.Click += BtnDiamond_Click;
        // 
        // _btnTriangle
        // 
        _btnTriangle.CheckOnClick = true;
        _btnTriangle.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnTriangle.Name = "_btnTriangle";
        _btnTriangle.Size = new Size(23, 22);
        _btnTriangle.Text = "△";
        _btnTriangle.ToolTipText = "삼각형";
        _btnTriangle.Click += BtnTriangle_Click;
        // 
        // _btnParallelogram
        // 
        _btnParallelogram.CheckOnClick = true;
        _btnParallelogram.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnParallelogram.Name = "_btnParallelogram";
        _btnParallelogram.Size = new Size(23, 22);
        _btnParallelogram.Text = "▱";
        _btnParallelogram.ToolTipText = "평행사변형";
        _btnParallelogram.Click += BtnParallelogram_Click;
        // 
        // _btnHexagon
        // 
        _btnHexagon.CheckOnClick = true;
        _btnHexagon.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnHexagon.Name = "_btnHexagon";
        _btnHexagon.Size = new Size(23, 22);
        _btnHexagon.Text = "⬡";
        _btnHexagon.ToolTipText = "육각형";
        _btnHexagon.Click += BtnHexagon_Click;
        // 
        // _sepLines
        // 
        _sepLines.Name = "_sepLines";
        _sepLines.Size = new Size(6, 25);
        // 
        // _btnLineStraight
        // 
        _btnLineStraight.CheckOnClick = true;
        _btnLineStraight.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnLineStraight.Name = "_btnLineStraight";
        _btnLineStraight.Size = new Size(23, 22);
        _btnLineStraight.Text = "─";
        _btnLineStraight.ToolTipText = "직선 연결";
        _btnLineStraight.Click += BtnLineStraight_Click;
        // 
        // _btnLineOrthogonal
        // 
        _btnLineOrthogonal.CheckOnClick = true;
        _btnLineOrthogonal.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnLineOrthogonal.Name = "_btnLineOrthogonal";
        _btnLineOrthogonal.Size = new Size(23, 22);
        _btnLineOrthogonal.Text = "└";
        _btnLineOrthogonal.ToolTipText = "꺾은선 연결";
        _btnLineOrthogonal.Click += BtnLineOrthogonal_Click;
        // 
        // _btnLineCurved
        // 
        _btnLineCurved.CheckOnClick = true;
        _btnLineCurved.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnLineCurved.Name = "_btnLineCurved";
        _btnLineCurved.Size = new Size(23, 22);
        _btnLineCurved.Text = "⌒";
        _btnLineCurved.ToolTipText = "곡선 연결";
        _btnLineCurved.Click += BtnLineCurved_Click;
        // 
        // _sepZoom
        // 
        _sepZoom.Name = "_sepZoom";
        _sepZoom.Size = new Size(6, 25);
        // 
        // _btnZoomIn
        // 
        _btnZoomIn.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnZoomIn.Name = "_btnZoomIn";
        _btnZoomIn.Size = new Size(23, 22);
        _btnZoomIn.Text = "⊕";
        _btnZoomIn.ToolTipText = "확대 (Ctrl++)";
        _btnZoomIn.Click += MenuZoomIn_Click;
        // 
        // _btnZoomOut
        // 
        _btnZoomOut.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnZoomOut.Name = "_btnZoomOut";
        _btnZoomOut.Size = new Size(23, 22);
        _btnZoomOut.Text = "⊖";
        _btnZoomOut.ToolTipText = "축소 (Ctrl+-)";
        _btnZoomOut.Click += MenuZoomOut_Click;
        // 
        // _btnZoomReset
        // 
        _btnZoomReset.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnZoomReset.Name = "_btnZoomReset";
        _btnZoomReset.Size = new Size(53, 22);
        _btnZoomReset.Text = "↕100%";
        _btnZoomReset.ToolTipText = "100% 보기 (Ctrl+0)";
        _btnZoomReset.Click += MenuZoomReset_Click;
        //
        // _splitMain
        // 
        _splitMain.Dock = DockStyle.Fill;
        _splitMain.FixedPanel = FixedPanel.Panel1;
        _splitMain.Location = new Point(0, 49);
        _splitMain.Name = "_splitMain";
        // 
        // _splitMain.Panel1
        // 
        _splitMain.Panel1.Controls.Add(_pnlToolbox);
        _splitMain.Panel1MinSize = 200;
        // 
        // _splitMain.Panel2
        // 
        _splitMain.Panel2.Controls.Add(_splitEditor);
        _splitMain.Size = new Size(1303, 683);
        _splitMain.SplitterDistance = 220;
        _splitMain.TabIndex = 2;
        // 
        // _pnlToolbox
        // 
        _pnlToolbox.Controls.Add(_toolbox);
        _pnlToolbox.Controls.Add(_lblToolboxTitle);
        _pnlToolbox.Dock = DockStyle.Fill;
        _pnlToolbox.Location = new Point(0, 0);
        _pnlToolbox.Name = "_pnlToolbox";
        _pnlToolbox.Padding = new Padding(0, 8, 0, 0);
        _pnlToolbox.Size = new Size(220, 683);
        _pnlToolbox.TabIndex = 0;
        // 
        // _lblToolboxTitle
        // 
        _lblToolboxTitle.Dock = DockStyle.Top;
        _lblToolboxTitle.Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold);
        _lblToolboxTitle.Location = new Point(0, 8);
        _lblToolboxTitle.Name = "_lblToolboxTitle";
        _lblToolboxTitle.Padding = new Padding(12, 0, 0, 0);
        _lblToolboxTitle.Size = new Size(220, 28);
        _lblToolboxTitle.TabIndex = 0;
        _lblToolboxTitle.Text = "도형 도구";
        _lblToolboxTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // _toolbox
        // 
        _toolbox.AutoScroll = true;
        _toolbox.BackColor = Color.FromArgb(250, 251, 253);
        _toolbox.Dock = DockStyle.Fill;
        _toolbox.Location = new Point(0, 8);
        _toolbox.MinimumSize = new Size(160, 0);
        _toolbox.Name = "_toolbox";
        _toolbox.Padding = new Padding(8, 6, 8, 10);
        _toolbox.Size = new Size(220, 675);
        _toolbox.TabIndex = 1;
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
        _splitEditor.Panel2.Controls.Add(_pnlProperties);
        _splitEditor.Panel2MinSize = 235;
        _splitEditor.Size = new Size(1079, 683);
        _splitEditor.SplitterDistance = 839;
        _splitEditor.TabIndex = 0;
        // 
        // _pnlCanvasHost
        // 
        _pnlCanvasHost.Controls.Add(_canvas);
        _pnlCanvasHost.Dock = DockStyle.Fill;
        _pnlCanvasHost.Location = new Point(0, 0);
        _pnlCanvasHost.Name = "_pnlCanvasHost";
        _pnlCanvasHost.Size = new Size(783, 683);
        _pnlCanvasHost.TabIndex = 0;
        // 
        // _canvas
        // 
        _canvas.BackColor = Color.FromArgb(245, 245, 245);
        _canvas.Dock = DockStyle.Fill;
        _canvas.Location = new Point(0, 0);
        _canvas.Name = "_canvas";
        _canvas.Size = new Size(783, 683);
        _canvas.TabIndex = 0;
        // 
        // _pnlProperties
        // 
        _pnlProperties.AutoScroll = true;
        _pnlProperties.Controls.Add(_grpConnector);
        _pnlProperties.Controls.Add(_grpShape);
        _pnlProperties.Controls.Add(_lblPropertyTitle);
        _pnlProperties.Dock = DockStyle.Fill;
        _pnlProperties.Location = new Point(0, 0);
        _pnlProperties.Name = "_pnlProperties";
        _pnlProperties.Padding = new Padding(8);
        _pnlProperties.Size = new Size(235, 683);
        _pnlProperties.TabIndex = 0;
        // 
        // _grpConnector
        // 
        _grpConnector.Controls.Add(_txtConnectorLabel);
        _grpConnector.Controls.Add(_lblConnectorLabel);
        _grpConnector.Controls.Add(_cmbEndArrow);
        _grpConnector.Controls.Add(_lblEndArrow);
        _grpConnector.Controls.Add(_cmbStartArrow);
        _grpConnector.Controls.Add(_lblStartArrow);
        _grpConnector.Controls.Add(_cmbConnectorKind);
        _grpConnector.Controls.Add(_lblConnectorKind);
        _grpConnector.Controls.Add(_cmbLineStyle);
        _grpConnector.Controls.Add(_lblLineStyle);
        _grpConnector.Controls.Add(_numLineWidth);
        _grpConnector.Controls.Add(_lblLineWidth);
        _grpConnector.Controls.Add(_btnLineColor);
        _grpConnector.Controls.Add(_lblLineColor);
        _grpConnector.Dock = DockStyle.Top;
        _grpConnector.Enabled = false;
        _grpConnector.Location = new Point(8, 404);
        _grpConnector.Name = "_grpConnector";
        _grpConnector.Size = new Size(219, 252);
        _grpConnector.TabIndex = 2;
        _grpConnector.TabStop = false;
        _grpConnector.Text = "연결선 속성";
        //
        // _txtConnectorLabel
        //
        _txtConnectorLabel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _txtConnectorLabel.Location = new Point(88, 214);
        _txtConnectorLabel.Name = "_txtConnectorLabel";
        _txtConnectorLabel.Size = new Size(123, 23);
        _txtConnectorLabel.TabIndex = 13;
        _txtConnectorLabel.TextChanged += ConnectorPropertyChanged;
        //
        // _lblConnectorLabel
        //
        _lblConnectorLabel.AutoSize = true;
        _lblConnectorLabel.Location = new Point(12, 218);
        _lblConnectorLabel.Name = "_lblConnectorLabel";
        _lblConnectorLabel.Size = new Size(31, 15);
        _lblConnectorLabel.TabIndex = 12;
        _lblConnectorLabel.Text = "라벨";
        //
        // _cmbEndArrow
        //
        _cmbEndArrow.DrawMode = DrawMode.OwnerDrawFixed;
        _cmbEndArrow.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbEndArrow.FormattingEnabled = true;
        _cmbEndArrow.Items.AddRange(new object[] { "없음", "열린 화살", "채운 화살", "이중 화살", "채운 마름모", "채운 원", "빈 마름모", "빈 원", "사각형", "반 화살", "가로선" });
        _cmbEndArrow.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbEndArrow.Location = new Point(88, 182);
        _cmbEndArrow.Name = "_cmbEndArrow";
        _cmbEndArrow.Size = new Size(123, 23);
        _cmbEndArrow.TabIndex = 11;
        _cmbEndArrow.DrawItem += CmbArrowStyle_DrawItem;
        _cmbEndArrow.SelectedIndexChanged += ConnectorPropertyChanged;
        //
        // _lblEndArrow
        //
        _lblEndArrow.AutoSize = true;
        _lblEndArrow.Location = new Point(12, 186);
        _lblEndArrow.Name = "_lblEndArrow";
        _lblEndArrow.Size = new Size(44, 15);
        _lblEndArrow.TabIndex = 10;
        _lblEndArrow.Text = "끝 화살";
        //
        // _cmbStartArrow
        //
        _cmbStartArrow.DrawMode = DrawMode.OwnerDrawFixed;
        _cmbStartArrow.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbStartArrow.FormattingEnabled = true;
        _cmbStartArrow.Items.AddRange(new object[] { "없음", "열린 화살", "채운 화살", "이중 화살", "채운 마름모", "채운 원", "빈 마름모", "빈 원", "사각형", "반 화살", "가로선" });
        _cmbStartArrow.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbStartArrow.Location = new Point(88, 152);
        _cmbStartArrow.Name = "_cmbStartArrow";
        _cmbStartArrow.Size = new Size(123, 23);
        _cmbStartArrow.TabIndex = 9;
        _cmbStartArrow.DrawItem += CmbArrowStyle_DrawItem;
        _cmbStartArrow.SelectedIndexChanged += ConnectorPropertyChanged;
        //
        // _lblStartArrow
        //
        _lblStartArrow.AutoSize = true;
        _lblStartArrow.Location = new Point(12, 156);
        _lblStartArrow.Name = "_lblStartArrow";
        _lblStartArrow.Size = new Size(52, 15);
        _lblStartArrow.TabIndex = 8;
        _lblStartArrow.Text = "시작 화살";
        // 
        // _cmbConnectorKind
        // 
        _cmbConnectorKind.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbConnectorKind.FormattingEnabled = true;
        _cmbConnectorKind.Items.AddRange(new object[] { "직선", "꺾은선", "곡선" });
        _cmbConnectorKind.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbConnectorKind.Location = new Point(88, 120);
        _cmbConnectorKind.Name = "_cmbConnectorKind";
        _cmbConnectorKind.Size = new Size(123, 23);
        _cmbConnectorKind.TabIndex = 7;
        _cmbConnectorKind.SelectedIndexChanged += ConnectorPropertyChanged;
        // 
        // _lblConnectorKind
        // 
        _lblConnectorKind.AutoSize = true;
        _lblConnectorKind.Location = new Point(12, 124);
        _lblConnectorKind.Name = "_lblConnectorKind";
        _lblConnectorKind.Size = new Size(55, 15);
        _lblConnectorKind.TabIndex = 6;
        _lblConnectorKind.Text = "연결형태";
        // 
        // _cmbLineStyle
        // 
        _cmbLineStyle.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbLineStyle.FormattingEnabled = true;
        _cmbLineStyle.Items.AddRange(new object[] { "실선", "파선", "점선", "일점쇄선", "일점이쇄선", "긴파선", "짧은파선", "이중선" });
        _cmbLineStyle.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbLineStyle.Location = new Point(88, 84);
        _cmbLineStyle.Name = "_cmbLineStyle";
        _cmbLineStyle.Size = new Size(123, 23);
        _cmbLineStyle.TabIndex = 5;
        _cmbLineStyle.SelectedIndexChanged += ConnectorPropertyChanged;
        // 
        // _lblLineStyle
        // 
        _lblLineStyle.AutoSize = true;
        _lblLineStyle.Location = new Point(12, 88);
        _lblLineStyle.Name = "_lblLineStyle";
        _lblLineStyle.Size = new Size(59, 15);
        _lblLineStyle.TabIndex = 4;
        _lblLineStyle.Text = "선 스타일";
        // 
        // _numLineWidth
        // 
        _numLineWidth.DecimalPlaces = 1;
        _numLineWidth.Increment = new decimal(new int[] { 5, 0, 0, 65536 });
        _numLineWidth.Location = new Point(88, 52);
        _numLineWidth.Maximum = new decimal(new int[] { 20, 0, 0, 0 });
        _numLineWidth.Minimum = new decimal(new int[] { 1, 0, 0, 65536 });
        _numLineWidth.Name = "_numLineWidth";
        _numLineWidth.Size = new Size(80, 23);
        _numLineWidth.TabIndex = 3;
        _numLineWidth.Value = new decimal(new int[] { 2, 0, 0, 0 });
        _numLineWidth.ValueChanged += ConnectorPropertyChanged;
        // 
        // _lblLineWidth
        // 
        _lblLineWidth.AutoSize = true;
        _lblLineWidth.Location = new Point(12, 56);
        _lblLineWidth.Name = "_lblLineWidth";
        _lblLineWidth.Size = new Size(47, 15);
        _lblLineWidth.TabIndex = 2;
        _lblLineWidth.Text = "선 두께";
        // 
        // _btnLineColor
        // 
        _btnLineColor.BackColor = Color.Black;
        _btnLineColor.Location = new Point(88, 20);
        _btnLineColor.Name = "_btnLineColor";
        _btnLineColor.Size = new Size(80, 24);
        _btnLineColor.TabIndex = 1;
        _btnLineColor.UseVisualStyleBackColor = false;
        _btnLineColor.Click += BtnLineColor_Click;
        // 
        // _lblLineColor
        // 
        _lblLineColor.AutoSize = true;
        _lblLineColor.Location = new Point(12, 24);
        _lblLineColor.Name = "_lblLineColor";
        _lblLineColor.Size = new Size(47, 15);
        _lblLineColor.TabIndex = 0;
        _lblLineColor.Text = "선 색상";
        // 
        // _grpShape
        // 
        _grpShape.Controls.Add(_btnClearImage);
        _grpShape.Controls.Add(_btnSetImage);
        _grpShape.Controls.Add(_chkFontBold);
        _grpShape.Controls.Add(_numFontSize);
        _grpShape.Controls.Add(_lblFontSize);
        _grpShape.Controls.Add(_cmbFont);
        _grpShape.Controls.Add(_lblFont);
        _grpShape.Controls.Add(_cmbBorderStyle);
        _grpShape.Controls.Add(_lblBorderStyle);
        _grpShape.Controls.Add(_numBorderWidth);
        _grpShape.Controls.Add(_lblBorderWidth);
        _grpShape.Controls.Add(_btnTextColor);
        _grpShape.Controls.Add(_lblTextColor);
        _grpShape.Controls.Add(_btnBorderColor);
        _grpShape.Controls.Add(_lblBorderColor);
        _grpShape.Controls.Add(_btnFillColor);
        _grpShape.Controls.Add(_lblFillColor);
        _grpShape.Controls.Add(_numShapeHeight);
        _grpShape.Controls.Add(_lblShapeHeight);
        _grpShape.Controls.Add(_numShapeWidth);
        _grpShape.Controls.Add(_lblShapeWidth);
        _grpShape.Controls.Add(_txtShapeText);
        _grpShape.Controls.Add(_lblShapeText);
        _grpShape.Dock = DockStyle.Top;
        _grpShape.Enabled = false;
        _grpShape.Location = new Point(8, 36);
        _grpShape.Name = "_grpShape";
        _grpShape.Size = new Size(219, 384);
        _grpShape.TabIndex = 1;
        _grpShape.TabStop = false;
        _grpShape.Text = "도형 속성";
        // 
        // _btnClearImage
        // 
        _btnClearImage.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnClearImage.Location = new Point(152, 340);
        _btnClearImage.Name = "_btnClearImage";
        _btnClearImage.Size = new Size(59, 28);
        _btnClearImage.TabIndex = 18;
        _btnClearImage.Text = "제거";
        _btnClearImage.Click += BtnClearImage_Click;
        // 
        // _btnSetImage
        // 
        _btnSetImage.Location = new Point(88, 340);
        _btnSetImage.Name = "_btnSetImage";
        _btnSetImage.Size = new Size(80, 28);
        _btnSetImage.TabIndex = 17;
        _btnSetImage.Text = "이미지...";
        _btnSetImage.Click += BtnSetImage_Click;
        // 
        // _chkFontBold
        // 
        _chkFontBold.AutoSize = true;
        _chkFontBold.Location = new Point(174, 308);
        _chkFontBold.Name = "_chkFontBold";
        _chkFontBold.Size = new Size(50, 19);
        _chkFontBold.TabIndex = 16;
        _chkFontBold.Text = "굵게";
        _chkFontBold.CheckedChanged += ShapePropertyChanged;
        // 
        // _numFontSize
        // 
        _numFontSize.Location = new Point(88, 306);
        _numFontSize.Maximum = new decimal(new int[] { 72, 0, 0, 0 });
        _numFontSize.Minimum = new decimal(new int[] { 6, 0, 0, 0 });
        _numFontSize.Name = "_numFontSize";
        _numFontSize.Size = new Size(80, 23);
        _numFontSize.TabIndex = 15;
        _numFontSize.Value = new decimal(new int[] { 10, 0, 0, 0 });
        _numFontSize.ValueChanged += ShapePropertyChanged;
        // 
        // _lblFontSize
        // 
        _lblFontSize.AutoSize = true;
        _lblFontSize.Location = new Point(12, 310);
        _lblFontSize.Name = "_lblFontSize";
        _lblFontSize.Size = new Size(59, 15);
        _lblFontSize.TabIndex = 14;
        _lblFontSize.Text = "글자 크기";
        // 
        // _cmbFont
        // 
        _cmbFont.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbFont.FormattingEnabled = true;
        _cmbFont.Location = new Point(88, 272);
        _cmbFont.Name = "_cmbFont";
        _cmbFont.Size = new Size(123, 23);
        _cmbFont.TabIndex = 13;
        _cmbFont.SelectedIndexChanged += ShapePropertyChanged;
        // 
        // _lblFont
        // 
        _lblFont.AutoSize = true;
        _lblFont.Location = new Point(12, 276);
        _lblFont.Name = "_lblFont";
        _lblFont.Size = new Size(31, 15);
        _lblFont.TabIndex = 12;
        _lblFont.Text = "글꼴";
        // 
        // _cmbBorderStyle
        // 
        _cmbBorderStyle.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbBorderStyle.FormattingEnabled = true;
        _cmbBorderStyle.Items.AddRange(new object[] { "실선", "파선", "점선", "일점쇄선", "일점이쇄선", "긴파선", "짧은파선", "이중선" });
        _cmbBorderStyle.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbBorderStyle.Location = new Point(88, 236);
        _cmbBorderStyle.Name = "_cmbBorderStyle";
        _cmbBorderStyle.Size = new Size(123, 23);
        _cmbBorderStyle.TabIndex = 11;
        _cmbBorderStyle.SelectedIndexChanged += ShapePropertyChanged;
        // 
        // _lblBorderStyle
        // 
        _lblBorderStyle.AutoSize = true;
        _lblBorderStyle.Location = new Point(12, 240);
        _lblBorderStyle.Name = "_lblBorderStyle";
        _lblBorderStyle.Size = new Size(55, 15);
        _lblBorderStyle.TabIndex = 10;
        _lblBorderStyle.Text = "테두리선";
        // 
        // _numBorderWidth
        // 
        _numBorderWidth.DecimalPlaces = 1;
        _numBorderWidth.Increment = new decimal(new int[] { 5, 0, 0, 65536 });
        _numBorderWidth.Location = new Point(88, 204);
        _numBorderWidth.Maximum = new decimal(new int[] { 20, 0, 0, 0 });
        _numBorderWidth.Minimum = new decimal(new int[] { 1, 0, 0, 65536 });
        _numBorderWidth.Name = "_numBorderWidth";
        _numBorderWidth.Size = new Size(80, 23);
        _numBorderWidth.TabIndex = 9;
        _numBorderWidth.Value = new decimal(new int[] { 2, 0, 0, 0 });
        _numBorderWidth.ValueChanged += ShapePropertyChanged;
        // 
        // _lblBorderWidth
        // 
        _lblBorderWidth.AutoSize = true;
        _lblBorderWidth.Location = new Point(12, 208);
        _lblBorderWidth.Name = "_lblBorderWidth";
        _lblBorderWidth.Size = new Size(71, 15);
        _lblBorderWidth.TabIndex = 8;
        _lblBorderWidth.Text = "테두리 두께";
        // 
        // _btnTextColor
        // 
        _btnTextColor.BackColor = Color.Black;
        _btnTextColor.Location = new Point(88, 172);
        _btnTextColor.Name = "_btnTextColor";
        _btnTextColor.Size = new Size(80, 24);
        _btnTextColor.TabIndex = 7;
        _btnTextColor.UseVisualStyleBackColor = false;
        _btnTextColor.Click += BtnTextColor_Click;
        // 
        // _lblTextColor
        // 
        _lblTextColor.AutoSize = true;
        _lblTextColor.Location = new Point(12, 176);
        _lblTextColor.Name = "_lblTextColor";
        _lblTextColor.Size = new Size(59, 15);
        _lblTextColor.TabIndex = 6;
        _lblTextColor.Text = "글자 색상";
        // 
        // _btnBorderColor
        // 
        _btnBorderColor.BackColor = Color.Black;
        _btnBorderColor.Location = new Point(88, 140);
        _btnBorderColor.Name = "_btnBorderColor";
        _btnBorderColor.Size = new Size(80, 24);
        _btnBorderColor.TabIndex = 5;
        _btnBorderColor.UseVisualStyleBackColor = false;
        _btnBorderColor.Click += BtnBorderColor_Click;
        // 
        // _lblBorderColor
        // 
        _lblBorderColor.AutoSize = true;
        _lblBorderColor.Location = new Point(12, 144);
        _lblBorderColor.Name = "_lblBorderColor";
        _lblBorderColor.Size = new Size(71, 15);
        _lblBorderColor.TabIndex = 4;
        _lblBorderColor.Text = "테두리 색상";
        // 
        // _btnFillColor
        // 
        _btnFillColor.BackColor = Color.White;
        _btnFillColor.Location = new Point(88, 108);
        _btnFillColor.Name = "_btnFillColor";
        _btnFillColor.Size = new Size(80, 24);
        _btnFillColor.TabIndex = 3;
        _btnFillColor.UseVisualStyleBackColor = false;
        _btnFillColor.Click += BtnFillColor_Click;
        // 
        // _lblFillColor
        // 
        _lblFillColor.AutoSize = true;
        _lblFillColor.Location = new Point(12, 112);
        _lblFillColor.Name = "_lblFillColor";
        _lblFillColor.Size = new Size(55, 15);
        _lblFillColor.TabIndex = 2;
        _lblFillColor.Text = "채우기색";
        // 
        // _numShapeHeight
        // 
        _numShapeHeight.Location = new Point(88, 76);
        _numShapeHeight.Maximum = new decimal(new int[] { 4000, 0, 0, 0 });
        _numShapeHeight.Minimum = new decimal(new int[] { 20, 0, 0, 0 });
        _numShapeHeight.Name = "_numShapeHeight";
        _numShapeHeight.Size = new Size(80, 23);
        _numShapeHeight.TabIndex = 21;
        _numShapeHeight.Value = new decimal(new int[] { 80, 0, 0, 0 });
        _numShapeHeight.ValueChanged += ShapePropertyChanged;
        // 
        // _lblShapeHeight
        // 
        _lblShapeHeight.AutoSize = true;
        _lblShapeHeight.Location = new Point(12, 80);
        _lblShapeHeight.Name = "_lblShapeHeight";
        _lblShapeHeight.Size = new Size(31, 15);
        _lblShapeHeight.TabIndex = 20;
        _lblShapeHeight.Text = "높이";
        // 
        // _numShapeWidth
        // 
        _numShapeWidth.Location = new Point(88, 48);
        _numShapeWidth.Maximum = new decimal(new int[] { 4000, 0, 0, 0 });
        _numShapeWidth.Minimum = new decimal(new int[] { 20, 0, 0, 0 });
        _numShapeWidth.Name = "_numShapeWidth";
        _numShapeWidth.Size = new Size(80, 23);
        _numShapeWidth.TabIndex = 19;
        _numShapeWidth.Value = new decimal(new int[] { 120, 0, 0, 0 });
        _numShapeWidth.ValueChanged += ShapePropertyChanged;
        // 
        // _lblShapeWidth
        // 
        _lblShapeWidth.AutoSize = true;
        _lblShapeWidth.Location = new Point(12, 52);
        _lblShapeWidth.Name = "_lblShapeWidth";
        _lblShapeWidth.Size = new Size(31, 15);
        _lblShapeWidth.TabIndex = 18;
        _lblShapeWidth.Text = "너비";
        // 
        // _txtShapeText
        // 
        _txtShapeText.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _txtShapeText.Location = new Point(88, 20);
        _txtShapeText.Name = "_txtShapeText";
        _txtShapeText.Size = new Size(123, 23);
        _txtShapeText.TabIndex = 1;
        _txtShapeText.TextChanged += ShapePropertyChanged;
        // 
        // _lblShapeText
        // 
        _lblShapeText.AutoSize = true;
        _lblShapeText.Location = new Point(12, 24);
        _lblShapeText.Name = "_lblShapeText";
        _lblShapeText.Size = new Size(43, 15);
        _lblShapeText.TabIndex = 0;
        _lblShapeText.Text = "텍스트";
        // 
        // _lblPropertyTitle
        // 
        _lblPropertyTitle.Dock = DockStyle.Top;
        _lblPropertyTitle.Font = new Font("맑은 고딕", 10F, FontStyle.Bold);
        _lblPropertyTitle.Location = new Point(8, 8);
        _lblPropertyTitle.Name = "_lblPropertyTitle";
        _lblPropertyTitle.Size = new Size(219, 28);
        _lblPropertyTitle.TabIndex = 0;
        _lblPropertyTitle.Text = "속성";
        _lblPropertyTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // _statusStrip
        // 
        _statusStrip.Items.AddRange(new ToolStripItem[] { _statusLabel });
        _statusStrip.Location = new Point(0, 732);
        _statusStrip.Name = "_statusStrip";
        _statusStrip.Size = new Size(1303, 22);
        _statusStrip.TabIndex = 3;
        // 
        // _statusLabel
        // 
        _statusLabel.Name = "_statusLabel";
        _statusLabel.Size = new Size(1288, 17);
        _statusLabel.Spring = true;
        _statusLabel.Text = "준비";
        _statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1303, 754);
        Controls.Add(_splitMain);
        Controls.Add(_statusStrip);
        Controls.Add(_toolStrip);
        Controls.Add(_menuStrip);
        KeyPreview = true;
        MainMenuStrip = _menuStrip;
        Icon = (Icon)resources.GetObject("$this.Icon");
        MinimumSize = new Size(960, 600);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "MyDiagramWinV10";
        FormClosing += MainForm_FormClosing;
        _menuStrip.ResumeLayout(false);
        _menuStrip.PerformLayout();
        _toolStrip.ResumeLayout(false);
        _toolStrip.PerformLayout();
        _splitMain.Panel1.ResumeLayout(false);
        _splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_splitMain).EndInit();
        _splitMain.ResumeLayout(false);
        _pnlToolbox.ResumeLayout(false);
        _splitEditor.Panel1.ResumeLayout(false);
        _splitEditor.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_splitEditor).EndInit();
        _splitEditor.ResumeLayout(false);
        _pnlCanvasHost.ResumeLayout(false);
        _pnlProperties.ResumeLayout(false);
        _grpConnector.ResumeLayout(false);
        _grpConnector.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)_numLineWidth).EndInit();
        _grpShape.ResumeLayout(false);
        _grpShape.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)_numFontSize).EndInit();
        ((System.ComponentModel.ISupportInitialize)_numBorderWidth).EndInit();
        ((System.ComponentModel.ISupportInitialize)_numShapeHeight).EndInit();
        ((System.ComponentModel.ISupportInitialize)_numShapeWidth).EndInit();
        _statusStrip.ResumeLayout(false);
        _statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
