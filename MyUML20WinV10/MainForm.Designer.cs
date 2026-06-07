namespace MyUML20WinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    private System.Windows.Forms.MenuStrip _menuStrip;
    private System.Windows.Forms.ToolStripMenuItem _menuFile;
    private System.Windows.Forms.ToolStripMenuItem _menuNew;
    private System.Windows.Forms.ToolStripMenuItem _menuOpen;
    private System.Windows.Forms.ToolStripMenuItem _menuSave;
    private System.Windows.Forms.ToolStripMenuItem _menuSaveAs;
    private System.Windows.Forms.ToolStripMenuItem _menuSample;
    private System.Windows.Forms.ToolStripMenuItem _menuExport;
    private System.Windows.Forms.ToolStripMenuItem _menuExportImage;
    private System.Windows.Forms.ToolStripMenuItem _menuExportSvg;
    private System.Windows.Forms.ToolStripMenuItem _menuExportPdf;
    private System.Windows.Forms.ToolStripMenuItem _menuExportHtml;
    private System.Windows.Forms.ToolStripMenuItem _menuExportMarkdown;
    private System.Windows.Forms.ToolStripMenuItem _menuExit;
    private System.Windows.Forms.ToolStripMenuItem _menuEdit;
    private System.Windows.Forms.ToolStripMenuItem _menuDelete;
    private System.Windows.Forms.ToolStripSeparator _menuSep1;
    private System.Windows.Forms.ToolStripSeparator _menuSep2;
    private System.Windows.Forms.ToolStripSeparator _menuSep3;
    private System.Windows.Forms.ToolStripSeparator _menuExportSep;
    private System.Windows.Forms.ToolStrip _toolStrip;
    private System.Windows.Forms.ToolStripButton _tsNew;
    private System.Windows.Forms.ToolStripButton _tsOpen;
    private System.Windows.Forms.ToolStripButton _tsSave;
    private System.Windows.Forms.ToolStripSeparator _tsSep1;
    private System.Windows.Forms.ToolStripButton _tsDelete;
    private System.Windows.Forms.ToolStripSeparator _tsSep2;
    private System.Windows.Forms.ToolStripButton _tsZoomOut;
    private System.Windows.Forms.ToolStripLabel _tsZoomLabel;
    private System.Windows.Forms.ToolStripButton _tsZoomIn;
    private System.Windows.Forms.ToolStripButton _tsZoomReset;
    private System.Windows.Forms.SplitContainer _splitMain;
    private System.Windows.Forms.SplitContainer _splitWork;
    private System.Windows.Forms.SplitContainer _splitRight;
    private System.Windows.Forms.Panel _pnlToolbox;
    private System.Windows.Forms.Label _lblToolbox;
    private Controls.UmlToolbox _umlToolbox;
    private System.Windows.Forms.Panel _pnlCanvasHost;
    private Controls.UmlDiagramTabBar _diagramTabBar;
    private Controls.UmlCanvas _canvas;
    private System.Windows.Forms.Panel _pnlExplorer;
    private System.Windows.Forms.Label _lblExplorer;
    private Controls.ModelExplorer _modelExplorer;
    private System.Windows.Forms.Panel _pnlProperties;
    private System.Windows.Forms.Label _lblProperties;
    private System.Windows.Forms.Panel _pnlFeatureButtons;
    private System.Windows.Forms.Button _btnAddProperty;
    private System.Windows.Forms.Button _btnAddOperation;
    private System.Windows.Forms.PropertyGrid _propertyGrid;
    private System.Windows.Forms.StatusStrip _statusStrip;
    private System.Windows.Forms.ToolStripStatusLabel _statusLabel;
    private System.Windows.Forms.ToolStripStatusLabel _statusZoomLabel;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        _menuStrip = new MenuStrip();
        _menuFile = new ToolStripMenuItem();
        _menuNew = new ToolStripMenuItem();
        _menuOpen = new ToolStripMenuItem();
        _menuSave = new ToolStripMenuItem();
        _menuSaveAs = new ToolStripMenuItem();
        _menuSep1 = new ToolStripSeparator();
        _menuSample = new ToolStripMenuItem();
        _menuSep2 = new ToolStripSeparator();
        _menuExport = new ToolStripMenuItem();
        _menuExportImage = new ToolStripMenuItem();
        _menuExportSvg = new ToolStripMenuItem();
        _menuExportPdf = new ToolStripMenuItem();
        _menuExportSep = new ToolStripSeparator();
        _menuExportHtml = new ToolStripMenuItem();
        _menuExportMarkdown = new ToolStripMenuItem();
        _menuSep3 = new ToolStripSeparator();
        _menuExit = new ToolStripMenuItem();
        _menuEdit = new ToolStripMenuItem();
        _menuDelete = new ToolStripMenuItem();
        _toolStrip = new ToolStrip();
        _tsNew = new ToolStripButton();
        _tsOpen = new ToolStripButton();
        _tsSave = new ToolStripButton();
        _tsSep1 = new ToolStripSeparator();
        _tsDelete = new ToolStripButton();
        _tsSep2 = new ToolStripSeparator();
        _tsZoomOut = new ToolStripButton();
        _tsZoomLabel = new ToolStripLabel();
        _tsZoomIn = new ToolStripButton();
        _tsZoomReset = new ToolStripButton();
        _splitMain = new SplitContainer();
        _splitWork = new SplitContainer();
        _pnlToolbox = new Panel();
        _umlToolbox = new MyUML20WinV10.Controls.UmlToolbox();
        _lblToolbox = new Label();
        _pnlCanvasHost = new Panel();
        _diagramTabBar = new MyUML20WinV10.Controls.UmlDiagramTabBar();
        _canvas = new MyUML20WinV10.Controls.UmlCanvas();
        _splitRight = new SplitContainer();
        _pnlExplorer = new Panel();
        _modelExplorer = new MyUML20WinV10.Controls.ModelExplorer();
        _lblExplorer = new Label();
        _pnlProperties = new Panel();
        _propertyGrid = new PropertyGrid();
        _pnlFeatureButtons = new Panel();
        _btnAddOperation = new Button();
        _btnAddProperty = new Button();
        _lblProperties = new Label();
        _statusStrip = new StatusStrip();
        _statusLabel = new ToolStripStatusLabel();
        _statusZoomLabel = new ToolStripStatusLabel();
        _menuStrip.SuspendLayout();
        _toolStrip.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitMain).BeginInit();
        _splitMain.Panel1.SuspendLayout();
        _splitMain.Panel2.SuspendLayout();
        _splitMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitWork).BeginInit();
        _splitWork.Panel1.SuspendLayout();
        _splitWork.Panel2.SuspendLayout();
        _splitWork.SuspendLayout();
        _pnlToolbox.SuspendLayout();
        _pnlCanvasHost.SuspendLayout();
        _diagramTabBar.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitRight).BeginInit();
        _splitRight.Panel1.SuspendLayout();
        _splitRight.Panel2.SuspendLayout();
        _splitRight.SuspendLayout();
        _pnlExplorer.SuspendLayout();
        _pnlProperties.SuspendLayout();
        _pnlFeatureButtons.SuspendLayout();
        _statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // _menuStrip
        // 
        _menuStrip.Items.AddRange(new ToolStripItem[] { _menuFile, _menuEdit });
        _menuStrip.Location = new Point(0, 0);
        _menuStrip.Name = "_menuStrip";
        _menuStrip.Size = new Size(1280, 24);
        _menuStrip.TabIndex = 2;
        // 
        // _menuFile
        // 
        _menuFile.DropDownItems.AddRange(new ToolStripItem[] { _menuNew, _menuOpen, _menuSave, _menuSaveAs, _menuSep1, _menuSample, _menuSep2, _menuExport, _menuSep3, _menuExit });
        _menuFile.Name = "_menuFile";
        _menuFile.Size = new Size(51, 20);
        _menuFile.Text = "File(&F)";
        // 
        // _menuNew
        // 
        _menuNew.Name = "_menuNew";
        _menuNew.ShortcutKeys = Keys.Control | Keys.N;
        _menuNew.Size = new Size(172, 22);
        _menuNew.Text = "New(&N)";
        _menuNew.Click += MenuNew_Click;
        // 
        // _menuOpen
        // 
        _menuOpen.Name = "_menuOpen";
        _menuOpen.ShortcutKeys = Keys.Control | Keys.O;
        _menuOpen.Size = new Size(172, 22);
        _menuOpen.Text = "Open(&O)...";
        _menuOpen.Click += MenuOpen_Click;
        // 
        // _menuSave
        // 
        _menuSave.Name = "_menuSave";
        _menuSave.ShortcutKeys = Keys.Control | Keys.S;
        _menuSave.Size = new Size(172, 22);
        _menuSave.Text = "Save(&S)";
        _menuSave.Click += MenuSave_Click;
        // 
        // _menuSaveAs
        // 
        _menuSaveAs.Name = "_menuSaveAs";
        _menuSaveAs.Size = new Size(172, 22);
        _menuSaveAs.Text = "Save As(&A)...";
        _menuSaveAs.Click += MenuSaveAs_Click;
        // 
        // _menuSep1
        // 
        _menuSep1.Name = "_menuSep1";
        _menuSep1.Size = new Size(169, 6);
        // 
        // _menuSample
        // 
        _menuSample.Name = "_menuSample";
        _menuSample.Size = new Size(172, 22);
        _menuSample.Text = "Load Sample";
        _menuSample.Click += MenuSample_Click;
        // 
        // _menuSep2
        // 
        _menuSep2.Name = "_menuSep2";
        _menuSep2.Size = new Size(169, 6);
        // 
        // _menuExport
        // 
        _menuExport.DropDownItems.AddRange(new ToolStripItem[] { _menuExportImage, _menuExportSvg, _menuExportPdf, _menuExportSep, _menuExportHtml, _menuExportMarkdown });
        _menuExport.Name = "_menuExport";
        _menuExport.Size = new Size(172, 22);
        _menuExport.Text = "Export(&E)";
        // 
        // _menuExportImage
        // 
        _menuExportImage.Name = "_menuExportImage";
        _menuExportImage.Size = new Size(201, 22);
        _menuExportImage.Text = "Diagram Image...";
        _menuExportImage.Click += MenuExportImage_Click;
        // 
        // _menuExportSvg
        // 
        _menuExportSvg.Name = "_menuExportSvg";
        _menuExportSvg.Size = new Size(201, 22);
        _menuExportSvg.Text = "Diagram SVG...";
        _menuExportSvg.Click += MenuExportSvg_Click;
        // 
        // _menuExportPdf
        // 
        _menuExportPdf.Name = "_menuExportPdf";
        _menuExportPdf.Size = new Size(201, 22);
        _menuExportPdf.Text = "Diagram PDF...";
        _menuExportPdf.Click += MenuExportPdf_Click;
        // 
        // _menuExportSep
        // 
        _menuExportSep.Name = "_menuExportSep";
        _menuExportSep.Size = new Size(198, 6);
        // 
        // _menuExportHtml
        // 
        _menuExportHtml.Name = "_menuExportHtml";
        _menuExportHtml.Size = new Size(201, 22);
        _menuExportHtml.Text = "HTML Document...";
        _menuExportHtml.Click += MenuExportHtml_Click;
        // 
        // _menuExportMarkdown
        // 
        _menuExportMarkdown.Name = "_menuExportMarkdown";
        _menuExportMarkdown.Size = new Size(201, 22);
        _menuExportMarkdown.Text = "Markdown Document...";
        _menuExportMarkdown.Click += MenuExportMarkdown_Click;
        // 
        // _menuSep3
        // 
        _menuSep3.Name = "_menuSep3";
        _menuSep3.Size = new Size(169, 6);
        // 
        // _menuExit
        // 
        _menuExit.Name = "_menuExit";
        _menuExit.Size = new Size(172, 22);
        _menuExit.Text = "Exit(&X)";
        _menuExit.Click += MenuExit_Click;
        // 
        // _menuEdit
        // 
        _menuEdit.DropDownItems.AddRange(new ToolStripItem[] { _menuDelete });
        _menuEdit.Name = "_menuEdit";
        _menuEdit.Size = new Size(53, 20);
        _menuEdit.Text = "Edit(&E)";
        // 
        // _menuDelete
        // 
        _menuDelete.Name = "_menuDelete";
        _menuDelete.ShortcutKeys = Keys.Delete;
        _menuDelete.Size = new Size(166, 22);
        _menuDelete.Text = "Delete(&D)";
        _menuDelete.Click += MenuDelete_Click;
        // 
        // _toolStrip
        // 
        _toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        _toolStrip.Items.AddRange(new ToolStripItem[] { _tsNew, _tsOpen, _tsSave, _tsSep1, _tsDelete, _tsSep2, _tsZoomOut, _tsZoomLabel, _tsZoomIn, _tsZoomReset });
        _toolStrip.Location = new Point(0, 24);
        _toolStrip.Name = "_toolStrip";
        _toolStrip.Size = new Size(1280, 26);
        _toolStrip.TabIndex = 1;
        // 
        // _tsNew
        // 
        _tsNew.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _tsNew.Name = "_tsNew";
        _tsNew.Size = new Size(35, 23);
        _tsNew.Text = "New";
        _tsNew.Click += MenuNew_Click;
        // 
        // _tsOpen
        // 
        _tsOpen.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _tsOpen.Name = "_tsOpen";
        _tsOpen.Size = new Size(40, 23);
        _tsOpen.Text = "Open";
        _tsOpen.Click += MenuOpen_Click;
        // 
        // _tsSave
        // 
        _tsSave.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _tsSave.Name = "_tsSave";
        _tsSave.Size = new Size(36, 23);
        _tsSave.Text = "Save";
        _tsSave.Click += MenuSave_Click;
        // 
        // _tsSep1
        // 
        _tsSep1.Name = "_tsSep1";
        _tsSep1.Size = new Size(6, 26);
        // 
        // _tsDelete
        // 
        _tsDelete.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _tsDelete.Name = "_tsDelete";
        _tsDelete.Size = new Size(45, 23);
        _tsDelete.Text = "Delete";
        _tsDelete.Click += MenuDelete_Click;
        // 
        // _tsSep2
        // 
        _tsSep2.Name = "_tsSep2";
        _tsSep2.Size = new Size(6, 26);
        // 
        // _tsZoomOut
        // 
        _tsZoomOut.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _tsZoomOut.Name = "_tsZoomOut";
        _tsZoomOut.Size = new Size(24, 23);
        _tsZoomOut.Text = " - ";
        _tsZoomOut.Click += TsZoomOut_Click;
        // 
        // _tsZoomLabel
        // 
        _tsZoomLabel.AutoSize = false;
        _tsZoomLabel.Name = "_tsZoomLabel";
        _tsZoomLabel.Size = new Size(52, 23);
        _tsZoomLabel.Text = "100%";
        // 
        // _tsZoomIn
        // 
        _tsZoomIn.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _tsZoomIn.Name = "_tsZoomIn";
        _tsZoomIn.Size = new Size(27, 23);
        _tsZoomIn.Text = " + ";
        _tsZoomIn.Click += TsZoomIn_Click;
        // 
        // _tsZoomReset
        // 
        _tsZoomReset.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _tsZoomReset.Name = "_tsZoomReset";
        _tsZoomReset.Size = new Size(24, 23);
        _tsZoomReset.Text = "Fit";
        _tsZoomReset.Click += TsZoomReset_Click;
        // 
        // _splitMain
        // 
        _splitMain.Dock = DockStyle.Fill;
        _splitMain.Location = new Point(0, 50);
        _splitMain.Name = "_splitMain";
        // 
        // _splitMain.Panel1
        // 
        _splitMain.Panel1.Controls.Add(_splitWork);
        _splitMain.Panel1MinSize = 400;
        // 
        // _splitMain.Panel2
        // 
        _splitMain.Panel2.Controls.Add(_splitRight);
        _splitMain.Panel2MinSize = 250;
        _splitMain.Size = new Size(1280, 728);
        _splitMain.SplitterDistance = 1026;
        _splitMain.TabIndex = 0;
        // 
        // _splitWork
        // 
        _splitWork.Dock = DockStyle.Fill;
        _splitWork.FixedPanel = FixedPanel.Panel1;
        _splitWork.Location = new Point(0, 0);
        _splitWork.Name = "_splitWork";
        // 
        // _splitWork.Panel1
        // 
        _splitWork.Panel1.Controls.Add(_pnlToolbox);
        _splitWork.Panel1MinSize = 175;
        // 
        // _splitWork.Panel2
        // 
        _splitWork.Panel2.Controls.Add(_pnlCanvasHost);
        _splitWork.Panel2MinSize = 200;
        _splitWork.Size = new Size(1026, 728);
        _splitWork.SplitterDistance = 121;
        _splitWork.TabIndex = 0;
        // 
        // _pnlToolbox
        // 
        _pnlToolbox.Controls.Add(_umlToolbox);
        _pnlToolbox.Controls.Add(_lblToolbox);
        _pnlToolbox.Dock = DockStyle.Fill;
        _pnlToolbox.Location = new Point(0, 0);
        _pnlToolbox.Name = "_pnlToolbox";
        _pnlToolbox.Size = new Size(121, 728);
        _pnlToolbox.TabIndex = 0;
        // 
        // _umlToolbox
        // 
        _umlToolbox.AutoScroll = true;
        _umlToolbox.BackColor = Color.FromArgb(250, 251, 253);
        _umlToolbox.Dock = DockStyle.Fill;
        _umlToolbox.Location = new Point(0, 28);
        _umlToolbox.Name = "_umlToolbox";
        _umlToolbox.Padding = new Padding(6, 4, 6, 10);
        _umlToolbox.Size = new Size(121, 700);
        _umlToolbox.TabIndex = 0;
        // 
        // _lblToolbox
        // 
        _lblToolbox.Dock = DockStyle.Top;
        _lblToolbox.Location = new Point(0, 0);
        _lblToolbox.Name = "_lblToolbox";
        _lblToolbox.Size = new Size(121, 28);
        _lblToolbox.TabIndex = 1;
        _lblToolbox.Text = "UML Toolbox";
        //
        // _pnlCanvasHost
        //
        _pnlCanvasHost.Controls.Add(_canvas);
        _pnlCanvasHost.Controls.Add(_diagramTabBar);
        _pnlCanvasHost.Dock = DockStyle.Fill;
        _pnlCanvasHost.Location = new Point(0, 0);
        _pnlCanvasHost.Name = "_pnlCanvasHost";
        _pnlCanvasHost.Size = new Size(901, 728);
        _pnlCanvasHost.TabIndex = 0;
        //
        // _diagramTabBar
        //
        _diagramTabBar.Dock = DockStyle.Top;
        _diagramTabBar.Location = new Point(1, 1);
        _diagramTabBar.Name = "_diagramTabBar";
        _diagramTabBar.Size = new Size(899, MyUML20WinV10.Controls.UmlDiagramTabBar.BarHeight);
        _diagramTabBar.TabIndex = 1;
        //
        // _canvas
        //
        _canvas.BackColor = Color.FromArgb(245, 245, 245);
        _canvas.Dock = DockStyle.Fill;
        _canvas.Location = new Point(0, MyUML20WinV10.Controls.UmlDiagramTabBar.BarHeight);
        _canvas.Name = "_canvas";
        _canvas.Size = new Size(901, 694);
        _canvas.TabIndex = 0;
        // 
        // _splitRight
        // 
        _splitRight.Dock = DockStyle.Fill;
        _splitRight.Location = new Point(0, 0);
        _splitRight.Name = "_splitRight";
        _splitRight.Orientation = Orientation.Horizontal;
        // 
        // _splitRight.Panel1
        // 
        _splitRight.Panel1.Controls.Add(_pnlExplorer);
        _splitRight.Panel1MinSize = 140;
        // 
        // _splitRight.Panel2
        // 
        _splitRight.Panel2.Controls.Add(_pnlProperties);
        _splitRight.Panel2MinSize = 180;
        _splitRight.Size = new Size(250, 728);
        _splitRight.SplitterDistance = 516;
        _splitRight.TabIndex = 0;
        // 
        // _pnlExplorer
        // 
        _pnlExplorer.Controls.Add(_modelExplorer);
        _pnlExplorer.Controls.Add(_lblExplorer);
        _pnlExplorer.Dock = DockStyle.Fill;
        _pnlExplorer.Location = new Point(0, 0);
        _pnlExplorer.Name = "_pnlExplorer";
        _pnlExplorer.Size = new Size(250, 516);
        _pnlExplorer.TabIndex = 0;
        // 
        // _modelExplorer
        // 
        _modelExplorer.BackColor = Color.White;
        _modelExplorer.BorderStyle = BorderStyle.None;
        _modelExplorer.Dock = DockStyle.Fill;
        _modelExplorer.HideSelection = false;
        _modelExplorer.Location = new Point(0, 28);
        _modelExplorer.Name = "_modelExplorer";
        _modelExplorer.Size = new Size(250, 488);
        _modelExplorer.TabIndex = 0;
        // 
        // _lblExplorer
        // 
        _lblExplorer.Dock = DockStyle.Top;
        _lblExplorer.Location = new Point(0, 0);
        _lblExplorer.Name = "_lblExplorer";
        _lblExplorer.Size = new Size(250, 28);
        _lblExplorer.TabIndex = 1;
        _lblExplorer.Text = "Structure";
        // 
        // _pnlProperties
        // 
        _pnlProperties.Controls.Add(_propertyGrid);
        _pnlProperties.Controls.Add(_pnlFeatureButtons);
        _pnlProperties.Controls.Add(_lblProperties);
        _pnlProperties.Dock = DockStyle.Fill;
        _pnlProperties.Location = new Point(0, 0);
        _pnlProperties.Name = "_pnlProperties";
        _pnlProperties.Size = new Size(250, 208);
        _pnlProperties.TabIndex = 0;
        // 
        // _propertyGrid
        // 
        _propertyGrid.BackColor = SystemColors.Control;
        _propertyGrid.Dock = DockStyle.Fill;
        _propertyGrid.HelpVisible = false;
        _propertyGrid.Location = new Point(0, 62);
        _propertyGrid.Name = "_propertyGrid";
        _propertyGrid.Size = new Size(250, 146);
        _propertyGrid.TabIndex = 0;
        _propertyGrid.ToolbarVisible = false;
        _propertyGrid.PropertyValueChanged += PropertyGrid_PropertyValueChanged;
        // 
        // _pnlFeatureButtons
        // 
        _pnlFeatureButtons.Controls.Add(_btnAddOperation);
        _pnlFeatureButtons.Controls.Add(_btnAddProperty);
        _pnlFeatureButtons.Dock = DockStyle.Top;
        _pnlFeatureButtons.Location = new Point(0, 28);
        _pnlFeatureButtons.Name = "_pnlFeatureButtons";
        _pnlFeatureButtons.Size = new Size(250, 34);
        _pnlFeatureButtons.TabIndex = 1;
        _pnlFeatureButtons.Visible = false;
        // 
        // _btnAddOperation
        // 
        _btnAddOperation.Dock = DockStyle.Left;
        _btnAddOperation.FlatStyle = FlatStyle.Flat;
        _btnAddOperation.Location = new Point(72, 0);
        _btnAddOperation.Name = "_btnAddOperation";
        _btnAddOperation.Size = new Size(72, 34);
        _btnAddOperation.TabIndex = 0;
        _btnAddOperation.Text = "+ Op";
        _btnAddOperation.Click += BtnAddOperation_Click;
        // 
        // _btnAddProperty
        // 
        _btnAddProperty.Dock = DockStyle.Left;
        _btnAddProperty.FlatStyle = FlatStyle.Flat;
        _btnAddProperty.Location = new Point(0, 0);
        _btnAddProperty.Name = "_btnAddProperty";
        _btnAddProperty.Size = new Size(72, 34);
        _btnAddProperty.TabIndex = 1;
        _btnAddProperty.Text = "+ Prop";
        _btnAddProperty.Click += BtnAddProperty_Click;
        // 
        // _lblProperties
        // 
        _lblProperties.Dock = DockStyle.Top;
        _lblProperties.Location = new Point(0, 0);
        _lblProperties.Name = "_lblProperties";
        _lblProperties.Size = new Size(250, 28);
        _lblProperties.TabIndex = 2;
        _lblProperties.Text = "Properties";
        // 
        // _statusStrip
        // 
        _statusStrip.Items.AddRange(new ToolStripItem[] { _statusLabel, _statusZoomLabel });
        _statusStrip.Location = new Point(0, 778);
        _statusStrip.Name = "_statusStrip";
        _statusStrip.Size = new Size(1280, 22);
        _statusStrip.TabIndex = 3;
        // 
        // _statusLabel
        // 
        _statusLabel.Name = "_statusLabel";
        _statusLabel.Size = new Size(1209, 17);
        _statusLabel.Spring = true;
        _statusLabel.Text = "Ready";
        // 
        // _statusZoomLabel
        // 
        _statusZoomLabel.AutoSize = false;
        _statusZoomLabel.Name = "_statusZoomLabel";
        _statusZoomLabel.Size = new Size(56, 17);
        _statusZoomLabel.Text = "100%";
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1280, 800);
        Controls.Add(_splitMain);
        Controls.Add(_toolStrip);
        Controls.Add(_menuStrip);
        Controls.Add(_statusStrip);
        MainMenuStrip = _menuStrip;
        MinimumSize = new Size(900, 600);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "MyUML20WinV10";
        Shown += MainForm_Shown;
        _menuStrip.ResumeLayout(false);
        _menuStrip.PerformLayout();
        _toolStrip.ResumeLayout(false);
        _toolStrip.PerformLayout();
        _splitMain.Panel1.ResumeLayout(false);
        _splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_splitMain).EndInit();
        _splitMain.ResumeLayout(false);
        _splitWork.Panel1.ResumeLayout(false);
        _splitWork.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_splitWork).EndInit();
        _splitWork.ResumeLayout(false);
        _pnlToolbox.ResumeLayout(false);
        _diagramTabBar.ResumeLayout(false);
        _pnlCanvasHost.ResumeLayout(false);
        _splitRight.Panel1.ResumeLayout(false);
        _splitRight.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_splitRight).EndInit();
        _splitRight.ResumeLayout(false);
        _pnlExplorer.ResumeLayout(false);
        _pnlProperties.ResumeLayout(false);
        _pnlFeatureButtons.ResumeLayout(false);
        _statusStrip.ResumeLayout(false);
        _statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
