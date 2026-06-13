using MyProject.Controls;

namespace MyProject.Forms
{
    partial class MainForm
    {
        private System.ComponentModel.IContainer components = null;

        // ── Menu ──────────────────────────────────────────────────────────────
        private System.Windows.Forms.MenuStrip mainMenuStrip;
        private System.Windows.Forms.ToolStripMenuItem menuFile;
        private System.Windows.Forms.ToolStripMenuItem menuNew;
        private System.Windows.Forms.ToolStripMenuItem menuOpen;
        private System.Windows.Forms.ToolStripSeparator menuSep1;
        private System.Windows.Forms.ToolStripMenuItem menuSave;
        private System.Windows.Forms.ToolStripMenuItem menuSaveAs;
        private System.Windows.Forms.ToolStripSeparator menuSep2;
        private System.Windows.Forms.ToolStripMenuItem menuExit;
        private System.Windows.Forms.ToolStripMenuItem menuTask;
        private System.Windows.Forms.ToolStripMenuItem menuAddTask;
        private System.Windows.Forms.ToolStripMenuItem menuAddSubtask;
        private System.Windows.Forms.ToolStripMenuItem menuDeleteTask;
        private System.Windows.Forms.ToolStripSeparator menuTaskSep1;
        private System.Windows.Forms.ToolStripMenuItem menuIndent;
        private System.Windows.Forms.ToolStripMenuItem menuOutdent;
        private System.Windows.Forms.ToolStripSeparator menuTaskSep2;
        private System.Windows.Forms.ToolStripMenuItem menuLink;
        private System.Windows.Forms.ToolStripMenuItem menuDepType;
        private System.Windows.Forms.ToolStripMenuItem menuDepFS;
        private System.Windows.Forms.ToolStripMenuItem menuDepFF;
        private System.Windows.Forms.ToolStripMenuItem menuDepSS;
        private System.Windows.Forms.ToolStripMenuItem menuDepSF;
        private System.Windows.Forms.ToolStripSeparator menuTaskSep3;
        private System.Windows.Forms.ToolStripMenuItem menuTaskProps;
        private System.Windows.Forms.ToolStripMenuItem menuExpandCollapse;
        private System.Windows.Forms.ToolStripMenuItem menuView;
        private System.Windows.Forms.ToolStripMenuItem menuZoomIn;
        private System.Windows.Forms.ToolStripMenuItem menuZoomOut;
        private System.Windows.Forms.ToolStripMenuItem menuToday;
        private System.Windows.Forms.ToolStripMenuItem menuReport;
        private System.Windows.Forms.ToolStripMenuItem menuExportMd;
        private System.Windows.Forms.ToolStripMenuItem menuExportExcel;
        private System.Windows.Forms.ToolStripMenuItem menuExportPdf;
        private System.Windows.Forms.ToolStripMenuItem menuPrint;

        // ── Toolbar ───────────────────────────────────────────────────────────
        private System.Windows.Forms.ToolStrip mainToolStrip;
        private System.Windows.Forms.ToolStripButton btnNew;
        private System.Windows.Forms.ToolStripButton btnOpen;
        private System.Windows.Forms.ToolStripButton btnSave;
        private System.Windows.Forms.ToolStripButton btnSaveAs;
        private System.Windows.Forms.ToolStripSeparator tsSep1;
        private System.Windows.Forms.ToolStripButton btnAddTask;
        private System.Windows.Forms.ToolStripButton btnAddSubtask;
        private System.Windows.Forms.ToolStripButton btnDeleteTask;
        private System.Windows.Forms.ToolStripButton btnTaskProps;
        private System.Windows.Forms.ToolStripButton btnIndent;
        private System.Windows.Forms.ToolStripButton btnOutdent;
        private System.Windows.Forms.ToolStripButton btnExpandCollapse;
        private System.Windows.Forms.ToolStripButton btnLink;
        private DependencyTypeSelector dependencyTypeSelector;
        private System.Windows.Forms.ToolStripControlHost dependencyTypeHost;
        private System.Windows.Forms.ToolStripSeparator tsSep2;
        private System.Windows.Forms.ToolStripButton btnZoomIn;
        private System.Windows.Forms.ToolStripButton btnZoomOut;
        private System.Windows.Forms.ToolStripButton btnToday;
        private System.Windows.Forms.ToolStripSeparator tsSep3;
        private System.Windows.Forms.ToolStripButton btnReport;
        private System.Windows.Forms.ToolStripButton btnExportMd;
        private System.Windows.Forms.ToolStripButton btnExportPdf;
        private System.Windows.Forms.ToolStripButton btnPrint;

        // ── Main area ─────────────────────────────────────────────────────────
        private System.Windows.Forms.SplitContainer splitContainer;
        private TaskGridControl taskGridControl;
        private GanttChartControl ganttChartControl;

        // ── Status bar ────────────────────────────────────────────────────────
        private System.Windows.Forms.StatusStrip statusStrip;
        private System.Windows.Forms.ToolStripStatusLabel statusLabel;
        private System.Windows.Forms.ToolStripStatusLabel statusSpacer;
        private System.Windows.Forms.ToolStripStatusLabel lblDateToday;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            mainMenuStrip = new MenuStrip();
            menuFile = new ToolStripMenuItem();
            menuNew = new ToolStripMenuItem();
            menuOpen = new ToolStripMenuItem();
            menuSep1 = new ToolStripSeparator();
            menuSave = new ToolStripMenuItem();
            menuSaveAs = new ToolStripMenuItem();
            menuSep2 = new ToolStripSeparator();
            menuExit = new ToolStripMenuItem();
            menuTask = new ToolStripMenuItem();
            menuAddTask = new ToolStripMenuItem();
            menuAddSubtask = new ToolStripMenuItem();
            menuDeleteTask = new ToolStripMenuItem();
            menuTaskSep1 = new ToolStripSeparator();
            menuIndent = new ToolStripMenuItem();
            menuOutdent = new ToolStripMenuItem();
            menuTaskSep2 = new ToolStripSeparator();
            menuLink = new ToolStripMenuItem();
            menuDepType = new ToolStripMenuItem();
            menuDepFS = new ToolStripMenuItem();
            menuDepFF = new ToolStripMenuItem();
            menuDepSS = new ToolStripMenuItem();
            menuDepSF = new ToolStripMenuItem();
            menuTaskSep3 = new ToolStripSeparator();
            menuTaskProps = new ToolStripMenuItem();
            menuExpandCollapse = new ToolStripMenuItem();
            menuView = new ToolStripMenuItem();
            menuZoomIn = new ToolStripMenuItem();
            menuZoomOut = new ToolStripMenuItem();
            menuToday = new ToolStripMenuItem();
            menuReport = new ToolStripMenuItem();
            menuExportExcel = new ToolStripMenuItem();
            menuExportMd = new ToolStripMenuItem();
            menuExportPdf = new ToolStripMenuItem();
            menuPrint = new ToolStripMenuItem();
            mainToolStrip = new ToolStrip();
            btnNew = new ToolStripButton();
            btnOpen = new ToolStripButton();
            btnSave = new ToolStripButton();
            btnSaveAs = new ToolStripButton();
            tsSep1 = new ToolStripSeparator();
            btnAddTask = new ToolStripButton();
            btnAddSubtask = new ToolStripButton();
            btnDeleteTask = new ToolStripButton();
            btnTaskProps = new ToolStripButton();
            btnIndent = new ToolStripButton();
            btnOutdent = new ToolStripButton();
            btnExpandCollapse = new ToolStripButton();
            btnLink = new ToolStripButton();
            dependencyTypeSelector = new DependencyTypeSelector();
            dependencyTypeHost = new ToolStripControlHost(dependencyTypeSelector);
            tsSep2 = new ToolStripSeparator();
            btnZoomIn = new ToolStripButton();
            btnZoomOut = new ToolStripButton();
            btnToday = new ToolStripButton();
            tsSep3 = new ToolStripSeparator();
            btnReport = new ToolStripButton();
            btnExportMd = new ToolStripButton();
            btnExportPdf = new ToolStripButton();
            btnPrint = new ToolStripButton();
            splitContainer = new SplitContainer();
            taskGridControl = new TaskGridControl();
            ganttChartControl = new GanttChartControl();
            statusStrip = new StatusStrip();
            statusLabel = new ToolStripStatusLabel();
            statusSpacer = new ToolStripStatusLabel();
            lblDateToday = new ToolStripStatusLabel();
            mainMenuStrip.SuspendLayout();
            mainToolStrip.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)splitContainer).BeginInit();
            splitContainer.Panel1.SuspendLayout();
            splitContainer.Panel2.SuspendLayout();
            splitContainer.SuspendLayout();
            statusStrip.SuspendLayout();
            SuspendLayout();
            // 
            // mainMenuStrip
            // 
            mainMenuStrip.BackColor = Color.FromArgb(40, 45, 55);
            mainMenuStrip.Font = new Font("Segoe UI", 9F);
            mainMenuStrip.ForeColor = Color.White;
            mainMenuStrip.Items.AddRange(new ToolStripItem[] { menuFile, menuTask, menuView, menuReport });
            mainMenuStrip.Location = new Point(0, 0);
            mainMenuStrip.Name = "mainMenuStrip";
            mainMenuStrip.Size = new Size(1280, 24);
            mainMenuStrip.TabIndex = 0;
            // 
            // menuFile
            // 
            menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuNew, menuOpen, menuSep1, menuSave, menuSaveAs, menuSep2, menuExit });
            menuFile.ForeColor = Color.White;
            menuFile.Name = "menuFile";
            menuFile.Size = new Size(37, 20);
            menuFile.Text = "&File";
            // 
            // menuNew
            // 
            menuNew.Name = "menuNew";
            menuNew.ShortcutKeys = Keys.Control | Keys.N;
            menuNew.Size = new Size(181, 22);
            menuNew.Text = "&New Project";
            // 
            // menuOpen
            // 
            menuOpen.Name = "menuOpen";
            menuOpen.ShortcutKeys = Keys.Control | Keys.O;
            menuOpen.Size = new Size(181, 22);
            menuOpen.Text = "&Open...";
            // 
            // menuSep1
            // 
            menuSep1.Name = "menuSep1";
            menuSep1.Size = new Size(178, 6);
            // 
            // menuSave
            // 
            menuSave.Name = "menuSave";
            menuSave.ShortcutKeys = Keys.Control | Keys.S;
            menuSave.Size = new Size(181, 22);
            menuSave.Text = "&Save";
            // 
            // menuSaveAs
            // 
            menuSaveAs.Name = "menuSaveAs";
            menuSaveAs.Size = new Size(181, 22);
            menuSaveAs.Text = "Save &As...";
            // 
            // menuSep2
            // 
            menuSep2.Name = "menuSep2";
            menuSep2.Size = new Size(178, 6);
            // 
            // menuExit
            // 
            menuExit.Name = "menuExit";
            menuExit.Size = new Size(181, 22);
            menuExit.Text = "E&xit";
            // 
            // menuTask
            // 
            menuTask.DropDownItems.AddRange(new ToolStripItem[] { menuAddTask, menuAddSubtask, menuDeleteTask, menuTaskSep1, menuIndent, menuOutdent, menuTaskSep2, menuLink, menuDepType, menuTaskSep3, menuTaskProps, menuExpandCollapse });
            menuTask.ForeColor = Color.White;
            menuTask.Name = "menuTask";
            menuTask.Size = new Size(42, 20);
            menuTask.Text = "&Task";
            // 
            // menuAddTask
            // 
            menuAddTask.Name = "menuAddTask";
            menuAddTask.ShortcutKeys = Keys.Insert;
            menuAddTask.Size = new Size(260, 22);
            menuAddTask.Text = "&Add Task";
            // 
            // menuAddSubtask
            // 
            menuAddSubtask.Name = "menuAddSubtask";
            menuAddSubtask.ShortcutKeys = Keys.Control | Keys.Shift | Keys.Insert;
            menuAddSubtask.Size = new Size(260, 22);
            menuAddSubtask.Text = "Add &Subtask";
            // 
            // menuDeleteTask
            // 
            menuDeleteTask.Name = "menuDeleteTask";
            menuDeleteTask.ShortcutKeys = Keys.Delete;
            menuDeleteTask.Size = new Size(260, 22);
            menuDeleteTask.Text = "&Delete Task";
            // 
            // menuTaskSep1
            // 
            menuTaskSep1.Name = "menuTaskSep1";
            menuTaskSep1.Size = new Size(257, 6);
            // 
            // menuIndent
            // 
            menuIndent.Name = "menuIndent";
            menuIndent.ShortcutKeys = Keys.Alt | Keys.Right;
            menuIndent.Size = new Size(260, 22);
            menuIndent.Text = "Indent &Task";
            // 
            // menuOutdent
            // 
            menuOutdent.Name = "menuOutdent";
            menuOutdent.ShortcutKeys = Keys.Alt | Keys.Left;
            menuOutdent.Size = new Size(260, 22);
            menuOutdent.Text = "Outdent Tas&k";
            // 
            // menuTaskSep2
            // 
            menuTaskSep2.Name = "menuTaskSep2";
            menuTaskSep2.Size = new Size(257, 6);
            // 
            // menuLink
            // 
            menuLink.Name = "menuLink";
            menuLink.ShortcutKeys = Keys.Control | Keys.L;
            menuLink.Size = new Size(260, 22);
            menuLink.Text = "&Link Tasks";
            // 
            // menuDepType
            // 
            menuDepType.DropDownItems.AddRange(new ToolStripItem[] { menuDepFS, menuDepFF, menuDepSS, menuDepSF });
            menuDepType.Name = "menuDepType";
            menuDepType.Size = new Size(260, 22);
            menuDepType.Text = "Dependency &Type";
            // 
            // menuDepFS
            // 
            menuDepFS.Name = "menuDepFS";
            menuDepFS.Size = new Size(260, 22);
            menuDepFS.Text = "Finish-to-Start (FS)";
            // 
            // menuDepFF
            // 
            menuDepFF.Name = "menuDepFF";
            menuDepFF.Size = new Size(260, 22);
            menuDepFF.Text = "Finish-to-Finish (FF)";
            // 
            // menuDepSS
            // 
            menuDepSS.Name = "menuDepSS";
            menuDepSS.Size = new Size(260, 22);
            menuDepSS.Text = "Start-to-Start (SS)";
            // 
            // menuDepSF
            // 
            menuDepSF.Name = "menuDepSF";
            menuDepSF.Size = new Size(260, 22);
            menuDepSF.Text = "Start-to-Finish (SF)";
            // 
            // menuTaskSep3
            // 
            menuTaskSep3.Name = "menuTaskSep3";
            menuTaskSep3.Size = new Size(257, 6);
            // 
            // menuTaskProps
            // 
            menuTaskProps.Name = "menuTaskProps";
            menuTaskProps.ShortcutKeys = Keys.F2;
            menuTaskProps.Size = new Size(260, 22);
            menuTaskProps.Text = "Task &Properties...";
            // 
            // menuExpandCollapse
            // 
            menuExpandCollapse.Name = "menuExpandCollapse";
            menuExpandCollapse.Size = new Size(260, 22);
            menuExpandCollapse.Text = "Expand Subtasks";
            // 
            // menuView
            // 
            menuView.DropDownItems.AddRange(new ToolStripItem[] { menuZoomIn, menuZoomOut, menuToday });
            menuView.ForeColor = Color.White;
            menuView.Name = "menuView";
            menuView.Size = new Size(44, 20);
            menuView.Text = "&View";
            // 
            // menuZoomIn
            // 
            menuZoomIn.Name = "menuZoomIn";
            menuZoomIn.ShortcutKeys = Keys.Control | Keys.Oemplus;
            menuZoomIn.Size = new Size(222, 22);
            menuZoomIn.Text = "Zoom &In";
            // 
            // menuZoomOut
            // 
            menuZoomOut.Name = "menuZoomOut";
            menuZoomOut.ShortcutKeys = Keys.Control | Keys.OemMinus;
            menuZoomOut.Size = new Size(222, 22);
            menuZoomOut.Text = "Zoom &Out";
            // 
            // menuToday
            // 
            menuToday.Name = "menuToday";
            menuToday.ShortcutKeys = Keys.Control | Keys.T;
            menuToday.Size = new Size(222, 22);
            menuToday.Text = "Go to &Today";
            // 
            // menuReport
            // 
            menuReport.DropDownItems.AddRange(new ToolStripItem[] { menuExportExcel, menuExportMd, menuExportPdf, menuPrint });
            menuReport.ForeColor = Color.White;
            menuReport.Name = "menuReport";
            menuReport.Size = new Size(54, 20);
            menuReport.Text = "&Report";
            // 
            // menuExportExcel
            // 
            menuExportExcel.Name = "menuExportExcel";
            menuExportExcel.Size = new Size(222, 22);
            menuExportExcel.Text = "Export as E&xcel (.xlsx)...";
            // 
            // menuExportMd
            // 
            menuExportMd.Name = "menuExportMd";
            menuExportMd.Size = new Size(222, 22);
            menuExportMd.Text = "Export as &Markdown (.md)...";
            // 
            // menuExportPdf
            // 
            menuExportPdf.Name = "menuExportPdf";
            menuExportPdf.Size = new Size(222, 22);
            menuExportPdf.Text = "Export as &PDF...";
            // 
            // menuPrint
            // 
            menuPrint.Name = "menuPrint";
            menuPrint.ShortcutKeys = Keys.Control | Keys.P;
            menuPrint.Size = new Size(222, 22);
            menuPrint.Text = "&Print...";
            // 
            // mainToolStrip
            // 
            mainToolStrip.AutoSize = false;
            mainToolStrip.BackColor = Color.FromArgb(26, 115, 232);
            mainToolStrip.Font = new Font("Segoe UI", 9F);
            mainToolStrip.GripStyle = ToolStripGripStyle.Hidden;
            mainToolStrip.ImageScalingSize = new Size(20, 20);
            mainToolStrip.Items.AddRange(new ToolStripItem[] { btnNew, btnOpen, btnSave, btnSaveAs, tsSep1, btnAddTask, btnAddSubtask, btnDeleteTask, btnTaskProps, btnIndent, btnOutdent, btnExpandCollapse, btnLink, dependencyTypeHost, tsSep2, btnZoomIn, btnZoomOut, btnToday, tsSep3, btnReport, btnExportMd, btnExportPdf, btnPrint });
            mainToolStrip.Location = new Point(0, 24);
            mainToolStrip.Name = "mainToolStrip";
            mainToolStrip.Padding = new Padding(4, 0, 0, 0);
            mainToolStrip.Size = new Size(1280, 40);
            mainToolStrip.TabIndex = 1;
            // 
            // btnNew
            // 
            btnNew.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnNew.ForeColor = Color.White;
            btnNew.Name = "btnNew";
            btnNew.Size = new Size(23, 37);
            btnNew.Text = "New Project";
            // 
            // btnOpen
            // 
            btnOpen.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnOpen.ForeColor = Color.White;
            btnOpen.Name = "btnOpen";
            btnOpen.Size = new Size(23, 37);
            btnOpen.Text = "Open Project";
            // 
            // btnSave
            // 
            btnSave.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnSave.ForeColor = Color.White;
            btnSave.Name = "btnSave";
            btnSave.Size = new Size(23, 37);
            btnSave.Text = "Save Project";
            // 
            // btnSaveAs
            // 
            btnSaveAs.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnSaveAs.ForeColor = Color.White;
            btnSaveAs.Name = "btnSaveAs";
            btnSaveAs.Size = new Size(23, 37);
            btnSaveAs.Text = "Save As";
            // 
            // tsSep1
            // 
            tsSep1.Name = "tsSep1";
            tsSep1.Size = new Size(6, 40);
            // 
            // btnAddTask
            // 
            btnAddTask.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnAddTask.ForeColor = Color.White;
            btnAddTask.Name = "btnAddTask";
            btnAddTask.Size = new Size(23, 37);
            btnAddTask.Text = "Add Task";
            // 
            // btnAddSubtask
            // 
            btnAddSubtask.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnAddSubtask.ForeColor = Color.White;
            btnAddSubtask.Name = "btnAddSubtask";
            btnAddSubtask.Size = new Size(23, 37);
            btnAddSubtask.Text = "Add Subtask";
            // 
            // btnDeleteTask
            // 
            btnDeleteTask.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnDeleteTask.ForeColor = Color.White;
            btnDeleteTask.Name = "btnDeleteTask";
            btnDeleteTask.Size = new Size(23, 37);
            btnDeleteTask.Text = "Delete Task";
            // 
            // btnTaskProps
            // 
            btnTaskProps.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnTaskProps.ForeColor = Color.White;
            btnTaskProps.Name = "btnTaskProps";
            btnTaskProps.Size = new Size(23, 37);
            btnTaskProps.Text = "Task Properties";
            // 
            // btnIndent
            // 
            btnIndent.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnIndent.ForeColor = Color.White;
            btnIndent.Name = "btnIndent";
            btnIndent.Size = new Size(23, 37);
            btnIndent.Text = "Indent Task";
            // 
            // btnOutdent
            // 
            btnOutdent.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnOutdent.ForeColor = Color.White;
            btnOutdent.Name = "btnOutdent";
            btnOutdent.Size = new Size(23, 37);
            btnOutdent.Text = "Outdent Task";
            // 
            // btnExpandCollapse
            // 
            btnExpandCollapse.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnExpandCollapse.ForeColor = Color.White;
            btnExpandCollapse.Name = "btnExpandCollapse";
            btnExpandCollapse.Size = new Size(23, 37);
            btnExpandCollapse.Text = "Expand Subtasks";
            // 
            // btnLink
            // 
            btnLink.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnLink.ForeColor = Color.White;
            btnLink.Name = "btnLink";
            btnLink.Size = new Size(23, 37);
            btnLink.Text = "Link Tasks";
            // 
            // dependencyTypeSelector
            // 
            dependencyTypeSelector.Margin = new Padding(4, 6, 4, 6);
            dependencyTypeSelector.Size = new Size(260, 28);
            // 
            // dependencyTypeHost
            // 
            dependencyTypeHost.AutoSize = false;
            dependencyTypeHost.Margin = new Padding(2, 4, 2, 4);
            dependencyTypeHost.Name = "dependencyTypeHost";
            dependencyTypeHost.Size = new Size(268, 32);
            dependencyTypeHost.ToolTipText = "Dependency line type";
            // 
            // tsSep2
            // 
            tsSep2.Name = "tsSep2";
            tsSep2.Size = new Size(6, 40);
            // 
            // btnZoomIn
            // 
            btnZoomIn.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnZoomIn.ForeColor = Color.White;
            btnZoomIn.Name = "btnZoomIn";
            btnZoomIn.Size = new Size(23, 37);
            btnZoomIn.Text = "Zoom In";
            // 
            // btnZoomOut
            // 
            btnZoomOut.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnZoomOut.ForeColor = Color.White;
            btnZoomOut.Name = "btnZoomOut";
            btnZoomOut.Size = new Size(23, 37);
            btnZoomOut.Text = "Zoom Out";
            // 
            // btnToday
            // 
            btnToday.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnToday.ForeColor = Color.White;
            btnToday.Name = "btnToday";
            btnToday.Size = new Size(23, 37);
            btnToday.Text = "Go to Today";
            // 
            // tsSep3
            // 
            tsSep3.Name = "tsSep3";
            tsSep3.Size = new Size(6, 40);
            // 
            // btnReport
            // 
            btnReport.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnReport.ForeColor = Color.White;
            btnReport.Name = "btnReport";
            btnReport.Size = new Size(23, 37);
            btnReport.Text = "Export to Excel";
            // 
            // btnExportMd
            // 
            btnExportMd.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnExportMd.ForeColor = Color.White;
            btnExportMd.Name = "btnExportMd";
            btnExportMd.Size = new Size(23, 37);
            btnExportMd.Text = "Export Markdown";
            // 
            // btnExportPdf
            // 
            btnExportPdf.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnExportPdf.ForeColor = Color.White;
            btnExportPdf.Name = "btnExportPdf";
            btnExportPdf.Size = new Size(23, 37);
            btnExportPdf.Text = "Export PDF";
            // 
            // btnPrint
            // 
            btnPrint.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnPrint.ForeColor = Color.White;
            btnPrint.Name = "btnPrint";
            btnPrint.Size = new Size(23, 37);
            btnPrint.Text = "Print Schedule";
            // 
            // splitContainer
            // 
            splitContainer.Dock = DockStyle.Fill;
            splitContainer.Location = new Point(0, 64);
            splitContainer.Name = "splitContainer";
            // 
            // splitContainer.Panel1
            // 
            splitContainer.Panel1.BackColor = Color.FromArgb(244, 245, 247);
            splitContainer.Panel1.Controls.Add(taskGridControl);
            splitContainer.Panel1MinSize = 200;
            // 
            // splitContainer.Panel2
            // 
            splitContainer.Panel2.BackColor = Color.White;
            splitContainer.Panel2.Controls.Add(ganttChartControl);
            splitContainer.Panel2MinSize = 300;
            splitContainer.Size = new Size(1280, 634);
            splitContainer.SplitterDistance = 560;
            splitContainer.TabIndex = 2;
            // 
            // taskGridControl
            // 
            taskGridControl.Dock = DockStyle.Fill;
            taskGridControl.Location = new Point(0, 0);
            taskGridControl.Name = "taskGridControl";
            taskGridControl.Size = new Size(560, 634);
            taskGridControl.TabIndex = 0;
            // 
            // ganttChartControl
            // 
            ganttChartControl.Dock = DockStyle.Fill;
            ganttChartControl.Location = new Point(0, 0);
            ganttChartControl.Name = "ganttChartControl";
            ganttChartControl.Size = new Size(896, 634);
            ganttChartControl.TabIndex = 0;
            // 
            // statusStrip
            // 
            statusStrip.BackColor = Color.FromArgb(244, 245, 247);
            statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel, statusSpacer, lblDateToday });
            statusStrip.Location = new Point(0, 698);
            statusStrip.Name = "statusStrip";
            statusStrip.Size = new Size(1280, 22);
            statusStrip.SizingGrip = false;
            statusStrip.TabIndex = 3;
            // 
            // statusLabel
            // 
            statusLabel.Font = new Font("Segoe UI", 8F);
            statusLabel.ForeColor = Color.FromArgb(95, 99, 104);
            statusLabel.Name = "statusLabel";
            statusLabel.Size = new Size(38, 17);
            statusLabel.Text = "Ready";
            // 
            // statusSpacer
            // 
            statusSpacer.Name = "statusSpacer";
            statusSpacer.Size = new Size(1191, 17);
            statusSpacer.Spring = true;
            // 
            // lblDateToday
            // 
            lblDateToday.Font = new Font("Segoe UI", 8F);
            lblDateToday.ForeColor = Color.FromArgb(95, 99, 104);
            lblDateToday.Name = "lblDateToday";
            lblDateToday.Size = new Size(36, 17);
            lblDateToday.Text = "Today";
            // 
            // MainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(250, 250, 252);
            ClientSize = new Size(1280, 720);
            Controls.Add(splitContainer);
            Controls.Add(mainToolStrip);
            Controls.Add(mainMenuStrip);
            Controls.Add(statusStrip);
            Font = new Font("Segoe UI", 9F);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = mainMenuStrip;
            MinimumSize = new Size(800, 500);
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "MyProject - Project Manager";
            mainMenuStrip.ResumeLayout(false);
            mainMenuStrip.PerformLayout();
            mainToolStrip.ResumeLayout(false);
            mainToolStrip.PerformLayout();
            splitContainer.Panel1.ResumeLayout(false);
            splitContainer.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)splitContainer).EndInit();
            splitContainer.ResumeLayout(false);
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }
    }
}
