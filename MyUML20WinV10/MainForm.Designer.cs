namespace MyUML20WinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    private MenuStrip _menuStrip;
    private ToolStripMenuItem _menuFile;
    private ToolStripMenuItem _menuNew;
    private ToolStripMenuItem _menuOpen;
    private ToolStripMenuItem _menuSave;
    private ToolStripMenuItem _menuSaveAs;
    private ToolStripMenuItem _menuSample;
    private ToolStripMenuItem _menuExport;
    private ToolStripMenuItem _menuExportImage;
    private ToolStripMenuItem _menuExportSvg;
    private ToolStripMenuItem _menuExportPdf;
    private ToolStripMenuItem _menuExportHtml;
    private ToolStripMenuItem _menuExportMarkdown;
    private ToolStripMenuItem _menuExit;
    private ToolStripMenuItem _menuEdit;
    private ToolStripMenuItem _menuDelete;
    private SplitContainer _splitMain;
    private SplitContainer _splitWork;
    private Panel _pnlToolbox;
    private Label _lblToolbox;
    private Controls.UmlToolbox _umlToolbox;
    private SplitContainer _splitRight;
    private Panel _pnlExplorer;
    private Label _lblExplorer;
    private Controls.ModelExplorer _modelExplorer;
    private Panel _pnlCanvasHost;
    private Controls.UmlCanvas _canvas;
    private Panel _pnlProperties;
    private Label _lblProperties;
    private PropertyGrid _propertyGrid;
    private Panel _pnlFeatureButtons;
    private Button _btnAddProperty;
    private Button _btnAddOperation;
    private StatusStrip _statusStrip;
    private ToolStripStatusLabel _statusLabel;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components is not null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        _menuStrip = new MenuStrip();
        _menuFile = new ToolStripMenuItem();
        _menuNew = new ToolStripMenuItem();
        _menuOpen = new ToolStripMenuItem();
        _menuSave = new ToolStripMenuItem();
        _menuSaveAs = new ToolStripMenuItem();
        _menuSample = new ToolStripMenuItem();
        _menuExport = new ToolStripMenuItem();
        _menuExportImage = new ToolStripMenuItem();
        _menuExportSvg = new ToolStripMenuItem();
        _menuExportPdf = new ToolStripMenuItem();
        _menuExportHtml = new ToolStripMenuItem();
        _menuExportMarkdown = new ToolStripMenuItem();
        _menuExit = new ToolStripMenuItem();
        _menuEdit = new ToolStripMenuItem();
        _menuDelete = new ToolStripMenuItem();
        _splitMain = new SplitContainer();
        _splitWork = new SplitContainer();
        _pnlToolbox = new Panel();
        _lblToolbox = new Label();
        _umlToolbox = new Controls.UmlToolbox();
        _splitRight = new SplitContainer();
        _pnlExplorer = new Panel();
        _lblExplorer = new Label();
        _modelExplorer = new Controls.ModelExplorer();
        _pnlCanvasHost = new Panel();
        _canvas = new Controls.UmlCanvas();
        _pnlProperties = new Panel();
        _lblProperties = new Label();
        _propertyGrid = new PropertyGrid();
        _pnlFeatureButtons = new Panel();
        _btnAddProperty = new Button();
        _btnAddOperation = new Button();
        _statusStrip = new StatusStrip();
        _statusLabel = new ToolStripStatusLabel();
        _menuStrip.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitMain).BeginInit();
        _splitMain.Panel1.SuspendLayout();
        _splitMain.Panel2.SuspendLayout();
        _splitMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitWork).BeginInit();
        _splitWork.Panel1.SuspendLayout();
        _splitWork.Panel2.SuspendLayout();
        _splitWork.SuspendLayout();
        _pnlToolbox.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitRight).BeginInit();
        _splitRight.Panel1.SuspendLayout();
        _splitRight.Panel2.SuspendLayout();
        _splitRight.SuspendLayout();
        _pnlExplorer.SuspendLayout();
        _pnlCanvasHost.SuspendLayout();
        _pnlProperties.SuspendLayout();
        _pnlFeatureButtons.SuspendLayout();
        _statusStrip.SuspendLayout();
        SuspendLayout();

        _menuFile.Text = "파일";
        _menuNew.Text = "새로 만들기";
        _menuNew.ShortcutKeys = Keys.Control | Keys.N;
        _menuNew.Click += MenuNew_Click;
        _menuOpen.Text = "열기";
        _menuOpen.ShortcutKeys = Keys.Control | Keys.O;
        _menuOpen.Click += MenuOpen_Click;
        _menuSave.Text = "저장";
        _menuSave.ShortcutKeys = Keys.Control | Keys.S;
        _menuSave.Click += MenuSave_Click;
        _menuSaveAs.Text = "다른 이름으로 저장";
        _menuSaveAs.Click += MenuSaveAs_Click;
        _menuSample.Text = "샘플 불러오기";
        _menuSample.Click += MenuSample_Click;
        _menuExport.Text = "보내기";
        _menuExportImage.Text = "다이어그램 이미지...";
        _menuExportImage.Click += MenuExportImage_Click;
        _menuExportSvg.Text = "다이어그램 SVG...";
        _menuExportSvg.Click += MenuExportSvg_Click;
        _menuExportPdf.Text = "다이어그램 PDF...";
        _menuExportPdf.Click += MenuExportPdf_Click;
        _menuExportHtml.Text = "HTML 문서...";
        _menuExportHtml.Click += MenuExportHtml_Click;
        _menuExportMarkdown.Text = "Markdown 문서...";
        _menuExportMarkdown.Click += MenuExportMarkdown_Click;
        _menuExport.DropDownItems.AddRange([_menuExportImage, _menuExportSvg, _menuExportPdf, new ToolStripSeparator(), _menuExportHtml, _menuExportMarkdown]);
        _menuExit.Text = "종료";
        _menuExit.Click += (_, _) => Close();
        _menuFile.DropDownItems.AddRange([_menuNew, _menuOpen, _menuSave, _menuSaveAs, new ToolStripSeparator(), _menuSample, new ToolStripSeparator(), _menuExport, new ToolStripSeparator(), _menuExit]);

        _menuEdit.Text = "편집";
        _menuDelete.Text = "삭제";
        _menuDelete.ShortcutKeys = Keys.Delete;
        _menuDelete.Click += (_, _) => DeleteSelection();
        _menuEdit.DropDownItems.Add(_menuDelete);

        _menuStrip.Items.AddRange([_menuFile, _menuEdit]);

        _splitMain.Dock = DockStyle.Fill;
        _splitMain.FixedPanel = FixedPanel.Panel2;
        _splitMain.SplitterDistance = 900;

        _splitWork.Dock = DockStyle.Fill;
        _splitWork.FixedPanel = FixedPanel.Panel1;
        _splitWork.SplitterDistance = 200;

        _splitRight.Dock = DockStyle.Fill;
        _splitRight.Orientation = Orientation.Horizontal;
        _splitRight.FixedPanel = FixedPanel.Panel1;
        _splitRight.SplitterDistance = 320;

        _pnlToolbox.Dock = DockStyle.Fill;
        _pnlToolbox.Padding = new Padding(0, 8, 0, 0);

        _lblToolbox.Dock = DockStyle.Top;
        _lblToolbox.Height = 24;
        _lblToolbox.Text = "UML 도구";
        _lblToolbox.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        _lblToolbox.Padding = new Padding(8, 0, 0, 0);

        _umlToolbox.Dock = DockStyle.Fill;

        _pnlToolbox.Controls.Add(_umlToolbox);
        _pnlToolbox.Controls.Add(_lblToolbox);


        _pnlExplorer.Dock = DockStyle.Fill;
        _pnlExplorer.Padding = new Padding(8);

        _lblExplorer.Dock = DockStyle.Top;
        _lblExplorer.Height = 24;
        _lblExplorer.Text = "UML 구조";
        _lblExplorer.Font = new Font("Segoe UI", 9F, FontStyle.Bold);

        _modelExplorer.Dock = DockStyle.Fill;

        _pnlExplorer.Controls.Add(_modelExplorer);
        _pnlExplorer.Controls.Add(_lblExplorer);

        _pnlCanvasHost.Dock = DockStyle.Fill;
        _pnlCanvasHost.Padding = new Padding(4);

        _canvas.Dock = DockStyle.Fill;

        _pnlCanvasHost.Controls.Add(_canvas);

        _pnlProperties.Dock = DockStyle.Fill;
        _pnlProperties.Padding = new Padding(8);

        _lblProperties.Dock = DockStyle.Top;
        _lblProperties.Height = 24;
        _lblProperties.Text = "속성";
        _lblProperties.Font = new Font("Segoe UI", 9F, FontStyle.Bold);

        _propertyGrid.Dock = DockStyle.Fill;
        _propertyGrid.ToolbarVisible = false;
        _propertyGrid.PropertyValueChanged += PropertyGrid_PropertyValueChanged;

        _pnlFeatureButtons.Dock = DockStyle.Bottom;
        _pnlFeatureButtons.Height = 72;

        _btnAddProperty.Text = "속성 추가";
        _btnAddProperty.Dock = DockStyle.Top;
        _btnAddProperty.Height = 32;
        _btnAddProperty.Click += BtnAddProperty_Click;

        _btnAddOperation.Text = "연산 추가";
        _btnAddOperation.Dock = DockStyle.Top;
        _btnAddOperation.Height = 32;
        _btnAddOperation.Click += BtnAddOperation_Click;

        _pnlFeatureButtons.Controls.Add(_btnAddOperation);
        _pnlFeatureButtons.Controls.Add(_btnAddProperty);

        _pnlProperties.Controls.Add(_propertyGrid);
        _pnlProperties.Controls.Add(_pnlFeatureButtons);
        _pnlProperties.Controls.Add(_lblProperties);

        _splitWork.Panel1.Controls.Add(_pnlToolbox);
        _splitWork.Panel2.Controls.Add(_pnlCanvasHost);
        _splitRight.Panel1.Controls.Add(_pnlProperties);
        _splitRight.Panel2.Controls.Add(_pnlExplorer);
        _splitMain.Panel1.Controls.Add(_splitWork);
        _splitMain.Panel2.Controls.Add(_splitRight);

        _statusLabel.Spring = true;
        _statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        _statusStrip.Items.Add(_statusLabel);

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1280, 800);
        Controls.Add(_splitMain);
        Controls.Add(_menuStrip);
        Controls.Add(_statusStrip);
        MainMenuStrip = _menuStrip;
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "MyUML20WinV10";

        _menuStrip.ResumeLayout(false);
        _menuStrip.PerformLayout();
        _splitMain.Panel1.ResumeLayout(false);
        _splitMain.Panel2.ResumeLayout(false);
        _splitMain.ResumeLayout(false);
        _splitWork.Panel1.ResumeLayout(false);
        _splitWork.Panel2.ResumeLayout(false);
        _splitWork.ResumeLayout(false);
        _pnlToolbox.ResumeLayout(false);
        _splitRight.Panel1.ResumeLayout(false);
        _splitRight.Panel2.ResumeLayout(false);
        _splitRight.ResumeLayout(false);
        _pnlExplorer.ResumeLayout(false);
        _pnlCanvasHost.ResumeLayout(false);
        _pnlProperties.ResumeLayout(false);
        _pnlFeatureButtons.ResumeLayout(false);
        _statusStrip.ResumeLayout(false);
        _statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
