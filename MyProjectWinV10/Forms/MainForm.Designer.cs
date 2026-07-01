using MyProject.Controls;
using MyProject.Theme;

namespace MyProject.Forms
{
    partial class MainForm
    {
        private System.ComponentModel.IContainer components = null;

        // ── Menu ──────────────────────────────────────────────────────────────
        private System.Windows.Forms.MenuStrip mainMenuStrip;
        private System.Windows.Forms.ToolStripMenuItem menuFile;
        private System.Windows.Forms.ToolStripMenuItem menuEdit;
        private System.Windows.Forms.ToolStripMenuItem menuUndo;
        private System.Windows.Forms.ToolStripMenuItem menuRedo;
        private System.Windows.Forms.ToolStripMenuItem menuNew;
        private System.Windows.Forms.ToolStripMenuItem menuOpen;
        private System.Windows.Forms.ToolStripMenuItem menuDatabase;
        private System.Windows.Forms.ToolStripMenuItem menuDatabaseConnection;
        private System.Windows.Forms.ToolStripSeparator menuSepDatabaseActions;
        private System.Windows.Forms.ToolStripMenuItem menuFetchFromDatabase;
        private System.Windows.Forms.ToolStripMenuItem menuRefreshFromDatabase;
        private System.Windows.Forms.ToolStripMenuItem menuSaveToDatabase;
        private System.Windows.Forms.ToolStripSeparator menuSepDatabaseOpen;
        private System.Windows.Forms.ToolStripMenuItem menuOpenFromDatabase;
        private System.Windows.Forms.ToolStripSeparator menuSep1;
        private System.Windows.Forms.ToolStripMenuItem menuSave;
        private System.Windows.Forms.ToolStripMenuItem menuSaveAs;
        private System.Windows.Forms.ToolStripMenuItem menuProjectSettings;
        private System.Windows.Forms.ToolStripMenuItem menuPreferences;
        private System.Windows.Forms.ToolStripSeparator menuSepExportMs;
        private System.Windows.Forms.ToolStripMenuItem menuExportMsProject;
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
        private System.Windows.Forms.ToolStripMenuItem menuUnlink;
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
        private System.Windows.Forms.ToolStripMenuItem menuPropertiesPanel;
        private System.Windows.Forms.ToolStripMenuItem menuShowCriticalPath;
        private System.Windows.Forms.ToolStripMenuItem menuCalendarView;
        private System.Windows.Forms.ToolStripMenuItem menuReport;
        private System.Windows.Forms.ToolStripMenuItem menuExportExcel;
        private System.Windows.Forms.ToolStripMenuItem menuExportHtml;
        private System.Windows.Forms.ToolStripMenuItem menuExportWord;
        private System.Windows.Forms.ToolStripMenuItem menuExportMd;
        private System.Windows.Forms.ToolStripMenuItem menuExportGanttImage;
        private System.Windows.Forms.ToolStripMenuItem menuExportPdf;
        private System.Windows.Forms.ToolStripMenuItem menuPrint;

        // ── Toolbar ───────────────────────────────────────────────────────────
        private System.Windows.Forms.ToolStrip mainToolStrip;
        private System.Windows.Forms.ToolStripButton btnUndo;
        private System.Windows.Forms.ToolStripButton btnRedo;
        private System.Windows.Forms.ToolStripSeparator tsSepUndo;
        private System.Windows.Forms.ToolStripButton btnNew;
        private System.Windows.Forms.ToolStripButton btnOpen;
        private System.Windows.Forms.ToolStripButton btnSave;
        private System.Windows.Forms.ToolStripButton btnSaveAs;
        private System.Windows.Forms.ToolStripSeparator tsSep1;
        private System.Windows.Forms.ToolStripButton btnAddTask;
        private System.Windows.Forms.ToolStripButton btnAddSubtask;
        private System.Windows.Forms.ToolStripButton btnDeleteTask;
        private System.Windows.Forms.ToolStripButton btnTaskProps;
        private System.Windows.Forms.ToolStripButton btnNotes;
        private System.Windows.Forms.ToolStripButton btnIndent;
        private System.Windows.Forms.ToolStripButton btnOutdent;
        private System.Windows.Forms.ToolStripButton btnExpandCollapse;
        private System.Windows.Forms.ToolStripButton btnCriticalPath;
        private System.Windows.Forms.ToolStripButton btnLink;
        private System.Windows.Forms.ToolStripButton btnUnlink;
        private DependencyTypeSelector dependencyTypeSelector;
        private System.Windows.Forms.ToolStripControlHost dependencyTypeHost;
        private System.Windows.Forms.ToolStripSeparator tsSep2;
        private System.Windows.Forms.ToolStripButton btnCalendarView;
        private System.Windows.Forms.ToolStripButton btnZoomIn;
        private System.Windows.Forms.ToolStripButton btnZoomOut;
        private System.Windows.Forms.ToolStripButton btnZoomDefault;
        private System.Windows.Forms.ToolStripButton btnToday;
        private System.Windows.Forms.ToolStripButton btnPropertiesPanel;
        private System.Windows.Forms.ToolStripSeparator tsSep3;
        private System.Windows.Forms.ToolStripButton btnReport;
        private System.Windows.Forms.ToolStripButton btnExportMd;
        private System.Windows.Forms.ToolStripButton btnExportGanttImage;
        private System.Windows.Forms.ToolStripButton btnExportPdf;
        private System.Windows.Forms.ToolStripButton btnPrint;
        private System.Windows.Forms.ToolStripSeparator tsSepDelete;
        private System.Windows.Forms.ToolStripButton btnInfo;

        // ── Main area ─────────────────────────────────────────────────────────
        private System.Windows.Forms.SplitContainer splitContainer;
        private System.Windows.Forms.SplitContainer ganttSplitContainer;
        private TaskGridControl taskGridControl;
        private GanttChartControl ganttChartControl;
        private CalendarViewControl calendarViewControl;
        private SelectionPropertiesControl selectionPropertiesControl;

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
            menuDatabase = new ToolStripMenuItem();
            menuDatabaseConnection = new ToolStripMenuItem();
            menuSepDatabaseActions = new ToolStripSeparator();
            menuFetchFromDatabase = new ToolStripMenuItem();
            menuRefreshFromDatabase = new ToolStripMenuItem();
            menuSaveToDatabase = new ToolStripMenuItem();
            menuSepDatabaseOpen = new ToolStripSeparator();
            menuOpenFromDatabase = new ToolStripMenuItem();
            menuSep1 = new ToolStripSeparator();
            menuSave = new ToolStripMenuItem();
            menuSaveAs = new ToolStripMenuItem();
            menuProjectSettings = new ToolStripMenuItem();
            menuPreferences = new ToolStripMenuItem();
            menuSepExportMs = new ToolStripSeparator();
            menuExportMsProject = new ToolStripMenuItem();
            menuSep2 = new ToolStripSeparator();
            menuExit = new ToolStripMenuItem();
            menuEdit = new ToolStripMenuItem();
            menuUndo = new ToolStripMenuItem();
            menuRedo = new ToolStripMenuItem();
            menuTask = new ToolStripMenuItem();
            menuAddTask = new ToolStripMenuItem();
            menuAddSubtask = new ToolStripMenuItem();
            menuDeleteTask = new ToolStripMenuItem();
            menuTaskSep1 = new ToolStripSeparator();
            menuIndent = new ToolStripMenuItem();
            menuOutdent = new ToolStripMenuItem();
            menuTaskSep2 = new ToolStripSeparator();
            menuLink = new ToolStripMenuItem();
            menuUnlink = new ToolStripMenuItem();
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
            menuPropertiesPanel = new ToolStripMenuItem();
            menuShowCriticalPath = new ToolStripMenuItem();
            menuCalendarView = new ToolStripMenuItem();
            menuReport = new ToolStripMenuItem();
            menuExportExcel = new ToolStripMenuItem();
            menuExportHtml = new ToolStripMenuItem();
            menuExportWord = new ToolStripMenuItem();
            menuExportMd = new ToolStripMenuItem();
            menuExportGanttImage = new ToolStripMenuItem();
            menuExportPdf = new ToolStripMenuItem();
            menuPrint = new ToolStripMenuItem();
            mainToolStrip = new ToolStrip();
            btnUndo = new ToolStripButton();
            btnRedo = new ToolStripButton();
            tsSepUndo = new ToolStripSeparator();
            btnNew = new ToolStripButton();
            btnOpen = new ToolStripButton();
            btnSave = new ToolStripButton();
            btnSaveAs = new ToolStripButton();
            tsSep1 = new ToolStripSeparator();
            btnAddTask = new ToolStripButton();
            btnAddSubtask = new ToolStripButton();
            btnDeleteTask = new ToolStripButton();
            btnTaskProps = new ToolStripButton();
            btnNotes = new ToolStripButton();
            btnIndent = new ToolStripButton();
            btnOutdent = new ToolStripButton();
            btnExpandCollapse = new ToolStripButton();
            btnCriticalPath = new ToolStripButton();
            btnLink = new ToolStripButton();
            btnUnlink = new ToolStripButton();
            dependencyTypeSelector = new DependencyTypeSelector();
            dependencyTypeHost = new ToolStripControlHost(dependencyTypeSelector);
            tsSep2 = new ToolStripSeparator();
            btnCalendarView = new ToolStripButton();
            btnZoomIn = new ToolStripButton();
            btnZoomOut = new ToolStripButton();
            btnZoomDefault = new ToolStripButton();
            btnToday = new ToolStripButton();
            btnPropertiesPanel = new ToolStripButton();
            tsSep3 = new ToolStripSeparator();
            btnReport = new ToolStripButton();
            btnExportMd = new ToolStripButton();
            btnExportGanttImage = new ToolStripButton();
            btnExportPdf = new ToolStripButton();
            btnPrint = new ToolStripButton();
            tsSepDelete = new ToolStripSeparator();
            btnInfo = new ToolStripButton();
            splitContainer = new SplitContainer();
            ganttSplitContainer = new SplitContainer();
            taskGridControl = new TaskGridControl();
            ganttChartControl = new GanttChartControl();
            calendarViewControl = new CalendarViewControl();
            selectionPropertiesControl = new SelectionPropertiesControl();
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
            ((System.ComponentModel.ISupportInitialize)ganttSplitContainer).BeginInit();
            ganttSplitContainer.Panel1.SuspendLayout();
            ganttSplitContainer.Panel2.SuspendLayout();
            ganttSplitContainer.SuspendLayout();
            statusStrip.SuspendLayout();
            SuspendLayout();
            // 
            // mainMenuStrip
            // 
            mainMenuStrip.BackColor = Color.FromArgb(40, 45, 55);
            mainMenuStrip.Font = AppTheme.FontMenu;
            mainMenuStrip.ForeColor = Color.White;
            mainMenuStrip.ImageScalingSize = AppTheme.MenuImageSize;
            mainMenuStrip.Items.AddRange(new ToolStripItem[] { menuFile, menuDatabase, menuEdit, menuTask, menuView, menuReport });
            mainMenuStrip.Location = new Point(0, 0);
            mainMenuStrip.Name = "mainMenuStrip";
            mainMenuStrip.Size = new Size(1280, AppTheme.MenuStripHeight);
            mainMenuStrip.TabIndex = 0;
            // 
            // menuFile
            // 
            menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuNew, menuOpen, menuSep1, menuSave, menuSaveAs, menuProjectSettings, menuPreferences, menuSepExportMs, menuExportMsProject, menuSep2, menuExit });
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
            // menuDatabase
            // 
            menuDatabase.DropDownItems.AddRange(new ToolStripItem[]
            {
                menuDatabaseConnection,
                menuSepDatabaseActions,
                menuFetchFromDatabase,
                menuRefreshFromDatabase,
                menuSaveToDatabase,
                menuSepDatabaseOpen,
                menuOpenFromDatabase
            });
            menuDatabase.ForeColor = Color.White;
            menuDatabase.Name = "menuDatabase";
            menuDatabase.Size = new Size(66, 20);
            menuDatabase.Text = "&Database";
            // 
            // menuDatabaseConnection
            // 
            menuDatabaseConnection.Name = "menuDatabaseConnection";
            menuDatabaseConnection.Size = new Size(220, 22);
            menuDatabaseConnection.Text = "&Connection Settings...";
            // 
            // menuSepDatabaseActions
            // 
            menuSepDatabaseActions.Name = "menuSepDatabaseActions";
            menuSepDatabaseActions.Size = new Size(220, 6);
            // 
            // menuFetchFromDatabase
            // 
            menuFetchFromDatabase.Name = "menuFetchFromDatabase";
            menuFetchFromDatabase.Size = new Size(220, 22);
            menuFetchFromDatabase.Text = "&Fetch Shared Schedule...";
            // 
            // menuRefreshFromDatabase
            // 
            menuRefreshFromDatabase.Name = "menuRefreshFromDatabase";
            menuRefreshFromDatabase.Size = new Size(220, 22);
            menuRefreshFromDatabase.Text = "&Refresh from Database";
            // 
            // menuSaveToDatabase
            // 
            menuSaveToDatabase.Name = "menuSaveToDatabase";
            menuSaveToDatabase.Size = new Size(220, 22);
            menuSaveToDatabase.Text = "&Save to Shared Schedule...";
            // 
            // menuSepDatabaseOpen
            // 
            menuSepDatabaseOpen.Name = "menuSepDatabaseOpen";
            menuSepDatabaseOpen.Size = new Size(220, 6);
            // 
            // menuOpenFromDatabase
            // 
            menuOpenFromDatabase.Name = "menuOpenFromDatabase";
            menuOpenFromDatabase.Size = new Size(220, 22);
            menuOpenFromDatabase.Text = "Open Shared Schedule...";
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
            // menuProjectSettings
            // 
            menuProjectSettings.Name = "menuProjectSettings";
            menuProjectSettings.Size = new Size(181, 22);
            menuProjectSettings.Text = "Project &Settings...";
            // 
            // menuPreferences
            // 
            menuPreferences.Name = "menuPreferences";
            menuPreferences.Size = new Size(181, 22);
            menuPreferences.Text = "Preferences(&P)...";
            // 
            // menuSepExportMs
            // 
            menuSepExportMs.Name = "menuSepExportMs";
            menuSepExportMs.Size = new Size(178, 6);
            // 
            // menuExportMsProject
            // 
            menuExportMsProject.Name = "menuExportMsProject";
            menuExportMsProject.Size = new Size(181, 22);
            menuExportMsProject.Text = "Export to Microsoft Project...";
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
            // menuEdit
            //
            menuEdit.DropDownItems.AddRange(new ToolStripItem[] { menuUndo, menuRedo });
            menuEdit.ForeColor = Color.White;
            menuEdit.Name = "menuEdit";
            menuEdit.Size = new Size(39, 20);
            menuEdit.Text = "&Edit";
            //
            // menuUndo
            //
            menuUndo.Enabled = false;
            menuUndo.Name = "menuUndo";
            menuUndo.ShortcutKeys = Keys.Control | Keys.Z;
            menuUndo.Size = new Size(151, 22);
            menuUndo.Text = "&Undo";
            //
            // menuRedo
            //
            menuRedo.Enabled = false;
            menuRedo.Name = "menuRedo";
            menuRedo.ShortcutKeys = Keys.Control | Keys.Y;
            menuRedo.Size = new Size(151, 22);
            menuRedo.Text = "&Redo";
            //
            // menuTask
            //
            menuTask.DropDownItems.AddRange(new ToolStripItem[] { menuAddTask, menuAddSubtask, menuDeleteTask, menuTaskSep1, menuIndent, menuOutdent, menuTaskSep2, menuLink, menuUnlink, menuDepType, menuTaskSep3, menuTaskProps, menuExpandCollapse });
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
            // menuUnlink
            // 
            menuUnlink.Name = "menuUnlink";
            menuUnlink.ShortcutKeys = Keys.Control | Keys.Shift | Keys.L;
            menuUnlink.Size = new Size(260, 22);
            menuUnlink.Text = "&Remove Link";
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
            menuView.DropDownItems.AddRange(new ToolStripItem[] { menuCalendarView, menuZoomIn, menuZoomOut, menuToday, menuPropertiesPanel, menuShowCriticalPath });
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
            // menuPropertiesPanel
            // 
            menuPropertiesPanel.CheckOnClick = true;
            menuPropertiesPanel.Name = "menuPropertiesPanel";
            menuPropertiesPanel.Size = new Size(222, 22);
            menuPropertiesPanel.Text = "Properties &Panel";
            // 
            // menuCalendarView
            // 
            menuCalendarView.CheckOnClick = true;
            menuCalendarView.Name = "menuCalendarView";
            menuCalendarView.Size = new Size(222, 22);
            menuCalendarView.Text = "Calendar &View";
            // 
            // menuShowCriticalPath
            // 
            menuShowCriticalPath.CheckOnClick = true;
            menuShowCriticalPath.Name = "menuShowCriticalPath";
            menuShowCriticalPath.Size = new Size(222, 22);
            menuShowCriticalPath.Text = "Show Critical &Path";
            // 
            // menuReport
            // 
            menuReport.DropDownItems.AddRange(new ToolStripItem[] { menuExportExcel, menuExportHtml, menuExportWord, menuExportPdf, menuExportMd, menuExportGanttImage, menuPrint });
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
            // menuExportHtml
            // 
            menuExportHtml.Name = "menuExportHtml";
            menuExportHtml.Size = new Size(222, 22);
            menuExportHtml.Text = "Export as &HTML (.html)...";
            // 
            // menuExportWord
            // 
            menuExportWord.Name = "menuExportWord";
            menuExportWord.Size = new Size(222, 22);
            menuExportWord.Text = "Export as &Word (.docx)...";
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
            // menuExportGanttImage
            // 
            menuExportGanttImage.Name = "menuExportGanttImage";
            menuExportGanttImage.Size = new Size(222, 22);
            menuExportGanttImage.Text = "Export Gantt as &Image...";
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
            mainToolStrip.Font = AppTheme.FontToolbar;
            mainToolStrip.GripStyle = ToolStripGripStyle.Hidden;
            mainToolStrip.ImageScalingSize = AppTheme.ToolbarImageSize;
            mainToolStrip.Items.AddRange(new ToolStripItem[] { btnNew, btnOpen, btnSave, btnSaveAs, tsSepUndo, btnUndo, btnRedo, tsSep1, btnAddTask, btnAddSubtask, btnTaskProps, btnNotes, btnIndent, btnOutdent, btnExpandCollapse, btnCriticalPath, btnLink, btnUnlink, dependencyTypeHost, tsSep2, btnCalendarView, btnZoomIn, btnZoomOut, btnZoomDefault, btnToday, btnPropertiesPanel, tsSep3, btnReport, btnExportMd, btnExportPdf, btnExportGanttImage, btnPrint, tsSepDelete, btnDeleteTask, btnInfo });
            mainToolStrip.Location = new Point(0, AppTheme.MenuStripHeight);
            mainToolStrip.Name = "mainToolStrip";
            mainToolStrip.Padding = AppTheme.ToolbarStripPadding;
            mainToolStrip.Size = new Size(1280, AppTheme.ToolbarHeight);
            mainToolStrip.ShowItemToolTips = true;
            mainToolStrip.TabIndex = 1;
            //
            // tsSepUndo
            //
            tsSepUndo.Name = "tsSepUndo";
            tsSepUndo.Size = new Size(6, 40);
            //
            // btnUndo
            //
            btnUndo.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnUndo.Enabled = false;
            btnUndo.ForeColor = Color.White;
            btnUndo.Name = "btnUndo";
            btnUndo.Size = new Size(23, 37);
            btnUndo.Text = "Undo";
            //
            // btnRedo
            //
            btnRedo.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnRedo.Enabled = false;
            btnRedo.ForeColor = Color.White;
            btnRedo.Name = "btnRedo";
            btnRedo.Size = new Size(23, 37);
            btnRedo.Text = "Redo";
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
            // tsSepDelete
            // 
            tsSepDelete.Name = "tsSepDelete";
            tsSepDelete.Size = new Size(6, 40);
            // 
            // btnInfo
            // 
            btnInfo.Alignment = ToolStripItemAlignment.Right;
            btnInfo.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
            btnInfo.ForeColor = Color.White;
            btnInfo.ImageAlign = ContentAlignment.MiddleLeft;
            btnInfo.Name = "btnInfo";
            btnInfo.Size = new Size(52, 37);
            btnInfo.Text = "Info";
            btnInfo.TextImageRelation = TextImageRelation.ImageBeforeText;
            // 
            // btnTaskProps
            // 
            btnTaskProps.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnTaskProps.ForeColor = Color.White;
            btnTaskProps.Name = "btnTaskProps";
            btnTaskProps.Size = new Size(23, 37);
            btnTaskProps.Text = "Task Properties";
            // 
            // btnNotes
            // 
            btnNotes.CheckOnClick = true;
            btnNotes.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnNotes.ForeColor = Color.White;
            btnNotes.Name = "btnNotes";
            btnNotes.Size = new Size(23, 37);
            btnNotes.Text = "Notes";
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
            // btnCriticalPath
            // 
            btnCriticalPath.CheckOnClick = true;
            btnCriticalPath.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnCriticalPath.ForeColor = Color.White;
            btnCriticalPath.Name = "btnCriticalPath";
            btnCriticalPath.Size = new Size(23, 37);
            btnCriticalPath.Text = "Show Critical Path";
            // 
            // btnLink
            // 
            btnLink.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnLink.ForeColor = Color.White;
            btnLink.Name = "btnLink";
            btnLink.Size = new Size(23, 37);
            btnLink.Text = "Link Tasks";
            // 
            // btnUnlink
            // 
            btnUnlink.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnUnlink.ForeColor = Color.White;
            btnUnlink.Name = "btnUnlink";
            btnUnlink.Size = new Size(23, 37);
            btnUnlink.Text = "Remove Link";
            // 
            // dependencyTypeSelector
            // 
            dependencyTypeSelector.Margin = Padding.Empty;
            dependencyTypeSelector.Size = new Size(AppTheme.ToolbarControlHostWidth, AppTheme.ToolbarHeight - AppTheme.ToolbarStripPadding.Vertical);
            // 
            // dependencyTypeHost
            // 
            dependencyTypeHost.AutoSize = false;
            dependencyTypeHost.BackColor = AppTheme.ToolbarBackground;
            dependencyTypeHost.Margin = AppTheme.ToolbarSeparatorMargin;
            dependencyTypeHost.Name = "dependencyTypeHost";
            dependencyTypeHost.Size = new Size(AppTheme.ToolbarControlHostWidth, AppTheme.ToolbarHeight - AppTheme.ToolbarStripPadding.Vertical);
            // 
            // tsSep2
            // 
            tsSep2.Name = "tsSep2";
            tsSep2.Size = new Size(6, 40);
            // 
            // btnCalendarView
            // 
            btnCalendarView.CheckOnClick = true;
            btnCalendarView.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnCalendarView.ForeColor = Color.White;
            btnCalendarView.Name = "btnCalendarView";
            btnCalendarView.Size = new Size(23, 37);
            btnCalendarView.Text = "Calendar View";
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
            // btnZoomDefault
            // 
            btnZoomDefault.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnZoomDefault.ForeColor = Color.White;
            btnZoomDefault.Name = "btnZoomDefault";
            btnZoomDefault.Size = new Size(23, 37);
            btnZoomDefault.Text = "Zoom Default";
            // 
            // btnToday
            // 
            btnToday.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnToday.ForeColor = Color.White;
            btnToday.Name = "btnToday";
            btnToday.Size = new Size(23, 37);
            btnToday.Text = "Go to Today";
            // 
            // btnPropertiesPanel
            // 
            btnPropertiesPanel.CheckOnClick = true;
            btnPropertiesPanel.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnPropertiesPanel.ForeColor = Color.White;
            btnPropertiesPanel.Name = "btnPropertiesPanel";
            btnPropertiesPanel.Size = new Size(23, 37);
            btnPropertiesPanel.Text = "Properties Panel";
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
            // btnExportGanttImage
            // 
            btnExportGanttImage.DisplayStyle = ToolStripItemDisplayStyle.Image;
            btnExportGanttImage.ForeColor = Color.White;
            btnExportGanttImage.Name = "btnExportGanttImage";
            btnExportGanttImage.Size = new Size(23, 37);
            btnExportGanttImage.Text = "Export Gantt Image";
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
            splitContainer.Location = new Point(0, AppTheme.MenuStripHeight + AppTheme.ToolbarHeight);
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
            splitContainer.Panel2.Controls.Add(ganttSplitContainer);
            splitContainer.Panel2MinSize = 300;
            splitContainer.Size = new Size(1280, 634);
            splitContainer.SplitterDistance = 552;
            splitContainer.TabIndex = 2;
            // 
            // ganttSplitContainer
            // 
            ganttSplitContainer.Dock = DockStyle.Fill;
            ganttSplitContainer.FixedPanel = FixedPanel.Panel2;
            ganttSplitContainer.Location = new Point(0, 0);
            ganttSplitContainer.Name = "ganttSplitContainer";
            // 
            // ganttSplitContainer.Panel1
            // 
            ganttSplitContainer.Panel1.Controls.Add(calendarViewControl);
            ganttSplitContainer.Panel1.Controls.Add(ganttChartControl);
            ganttSplitContainer.Panel1MinSize = 240;
            // 
            // ganttSplitContainer.Panel2
            // 
            ganttSplitContainer.Panel2.BackColor = Color.FromArgb(244, 245, 247);
            ganttSplitContainer.Panel2.Controls.Add(selectionPropertiesControl);
            ganttSplitContainer.Panel2MinSize = AppTheme.PropertiesPanelMinWidth;
            ganttSplitContainer.Size = new Size(724, 634);
            ganttSplitContainer.SplitterDistance = 240;
            ganttSplitContainer.TabIndex = 0;
            // 
            // selectionPropertiesControl
            // 
            selectionPropertiesControl.Dock = DockStyle.Fill;
            selectionPropertiesControl.Location = new Point(0, 0);
            selectionPropertiesControl.Name = "selectionPropertiesControl";
            selectionPropertiesControl.Size = new Size(340, 634);
            selectionPropertiesControl.TabIndex = 0;
            // 
            // taskGridControl
            // 
            taskGridControl.Dock = DockStyle.Fill;
            taskGridControl.Location = new Point(0, 0);
            taskGridControl.Name = "taskGridControl";
            taskGridControl.Size = new Size(720, 634);
            taskGridControl.TabIndex = 0;
            // 
            // calendarViewControl
            // 
            calendarViewControl.Dock = DockStyle.Fill;
            calendarViewControl.Location = new Point(0, 0);
            calendarViewControl.Name = "calendarViewControl";
            calendarViewControl.Size = new Size(896, 634);
            calendarViewControl.TabIndex = 1;
            calendarViewControl.Visible = false;
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
            ClientSize = new Size(1440, 768);
            Controls.Add(splitContainer);
            Controls.Add(mainToolStrip);
            Controls.Add(mainMenuStrip);
            Controls.Add(statusStrip);
            Font = new Font("Segoe UI", 9F);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = mainMenuStrip;
            MinimumSize = new Size(1200, 500);
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "MyProject - Project Manager";
            mainMenuStrip.ResumeLayout(false);
            mainMenuStrip.PerformLayout();
            mainToolStrip.ResumeLayout(false);
            mainToolStrip.PerformLayout();
            splitContainer.Panel1.ResumeLayout(false);
            splitContainer.Panel2.ResumeLayout(false);
            ganttSplitContainer.Panel1.ResumeLayout(false);
            ganttSplitContainer.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)ganttSplitContainer).EndInit();
            ganttSplitContainer.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)splitContainer).EndInit();
            splitContainer.ResumeLayout(false);
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }
    }
}
